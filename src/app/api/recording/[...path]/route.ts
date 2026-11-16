import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, notFoundResponse, badRequestResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { getSessionStats, saveRecordedCaseAsTestCase } from "@/lib/recording/session-store"
import { recorderWorkerRequest, RecorderWorkerError, RECORDER_WORKER_URL } from "@/lib/recording/worker-client"
import { saveFile } from "@/lib/storage"
import { ActionType, TargetType } from "@prisma/client"

const ACTION_TYPES = new Set<string>(Object.values(ActionType))
const TARGET_TYPES = new Set<string>(Object.values(TargetType))

async function verifyRecordingSession(sessionId: string, userId: string) {
  const rec = await prisma.recordingSession.findUnique({
    where: { id: sessionId },
    include: {
      project: {
        select: {
          id: true,
          userId: true,
          projectMembers: { select: { userId: true } }
        }
      }
    }
  })
  if (!rec) return notFoundResponse("Recording session not found")

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  const isGlobalAdmin = user?.role === "Admin"
  const isOwner = rec.project.userId === userId
  const isMember = rec.project.projectMembers.some((m) => m.userId === userId)

  if (!isGlobalAdmin && !isOwner && !isMember) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  }
  return null
}

async function verifyRecordedStep(stepId: string, userId: string) {
  const step = await prisma.recordedStep.findUnique({
    where: { id: stepId },
    include: {
      recordedTestCase: {
        include: {
          session: {
            include: {
              project: { select: { userId: true } }
            }
          }
        }
      }
    }
  })
  if (!step) return notFoundResponse("Step not found")
  if (step.recordedTestCase.session.project.userId !== userId) return unauthorizedResponse("Access denied")
  return null
}

async function verifyRecordedTestCase(caseId: string, userId: string) {
  const recCase = await prisma.recordedTestCase.findUnique({
    where: { id: caseId },
    include: {
      session: {
        include: {
          project: { select: { userId: true } }
        }
      }
    }
  })
  if (!recCase) return notFoundResponse("Test case not found")
  if (recCase.session.project.userId !== userId) return unauthorizedResponse("Access denied")
  return null
}

const expectedResultSchema = z.object({ expectedResult: z.string().min(1, "expectedResult is required") })
const assertionSchema = z.object({
  assertionType: z.string().min(1, "assertionType is required"),
  assertionValue: z.string().min(1, "assertionValue is required"),
  assertions: z.array(z.any()).optional(),
})
const screenshotSchema = z.object({ screenshotPath: z.string().min(1, "screenshotPath is required") })
const saveCurrentSchema = z.object({ testCaseId: z.string().min(1, "testCaseId is required") })
const mergeStepsSchema = z.object({
  stepIds: z.array(z.string()).min(2, "At least two stepIds are required"),
  mergedDescription: z.string().optional(),
  mergedActionType: z.string().optional(),
})
const splitStepSchema = z.object({
  firstDescription: z.string().optional(),
  secondDescription: z.string().optional(),
  secondActionType: z.string().optional(),
  secondTargetValue: z.string().optional(),
  secondTargetType: z.string().optional(),
  secondInputValue: z.string().optional(),
})
const appendStepSchema = z.object({
  pageUrl: z.string().optional(),
  actionType: z.string().min(1, "actionType is required"),
  actionDescription: z.string().min(1, "actionDescription is required"),
  targetType: z.string().optional(),
  targetValue: z.string().optional().nullable(),
  inputValue: z.string().optional().nullable(),
  recommendedSelector: z.string().optional().nullable(),
})

const startGlobalRecordingSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  title: z.string().min(1, "Test case title is required"),
  module: z.string().optional(),
  moduleId: z.string().nullable().optional(),
  featureId: z.string().nullable().optional(),
  componentId: z.string().nullable().optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  preconditions: z.string().nullable().optional(),
  requiredCredentialId: z.string().nullable().optional(),
  startUrl: z.string().url("Target URL must be a valid URL"),
  browserType: z.enum(["Chromium", "Firefox", "WebKit"]).optional(),
  viewport: z.enum(["Desktop", "Tablet", "Mobile", "Custom"]).optional(),
  recordingMode: z.enum(["Fast", "Detailed", "Assertion"]).optional(),
})

/**
 * Read and validate a JSON body, returning the response to send on failure.
 *
 * Exposes both `raw` and `data` because the endpoints below are not uniform:
 * most write the RAW body through to Prisma while using the schema only as a
 * gate, and one uses the parsed value. Collapsing them onto one or the other
 * would change what gets written (Zod strips unknown keys and applies
 * coercions), so each caller keeps the one it already used.
 *
 * `request.json()` is intentionally left unguarded, as before: invalid JSON
 * throws and is caught by the handler's outer try/catch.
 */
type ValidatedBody<T> =
  | { ok: true; raw: any; data: T }
  | { ok: false; response: NextResponse }

async function readValidatedBody<T>(
  // Request, not NextRequest: PUT/PATCH here are typed with the base Request.
  request: Request,
  schema: z.ZodType<T>
): Promise<ValidatedBody<T>> {
  const raw = await request.json()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      response: badRequestResponse(parsed.error.errors.map(e => e.message).join(", ")),
    }
  }
  return { ok: true, raw, data: parsed.data }
}

/**
 * Run a recorder-worker interaction, translating any failure into the standard
 * worker error response. Every worker-backed endpoint repeated this try/catch
 * verbatim; a new one that forgot it would answer 500 instead of the worker's
 * own status.
 *
 * Only used where the catch does nothing else — the two endpoints that inspect
 * RecorderWorkerError first keep their own try/catch.
 */
async function withWorker(op: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await op()
  } catch (err) {
    return workerErrorResponse(err)
  }
}


/**
 * Path-segment matcher for this catch-all route. "*" matches any single
 * segment (an id), so `matches(path, ["*", "steps", "*", "split"])` replaces
 * hand-written `path.length === 4 && path[1] === "steps" && path[3] === "split"`
 * chains, where an off-by-one in an index is easy to miss and impossible to
 * spot at a glance. Branch order is unchanged, so first-match still wins.
 */
function matches(path: string[], pattern: string[]): boolean {
  return (
    path.length === pattern.length &&
    pattern.every((segment, i) => segment === "*" || segment === path[i])
  )
}

function workerErrorResponse(err: unknown) {
  if (err instanceof RecorderWorkerError) {
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
        details: err.details,
      },
      { status: err.status || 503 }
    )
  }
  const message = err instanceof Error ? err.message : "Recorder operation failed"
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const path = params.path
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  // GET /api/recording/sessions/active
  if (matches(path, ["sessions", "active"])) {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")
    if (!projectId) return badRequestResponse("projectId is required")

    // Verify project membership
    const user = await prisma.user.findUnique({ where: { id: auth.session!.user.id }, select: { role: true } })
    const isGlobalAdmin = user?.role === "Admin"
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ...(isGlobalAdmin
          ? {}
          : {
              OR: [
                { userId: auth.session!.user.id },
                { projectMembers: { some: { userId: auth.session!.user.id } } }
              ]
            })
      }
    })
    if (!project) return NextResponse.json({ error: "Access denied" }, { status: 403 })

    // Only this person's own session of the requested kind (Live QA by
    // default — this endpoint backs the Live QA page).
    const kind = searchParams.get("kind") === "Studio" ? "Studio" : "LiveQA"
    const session = await prisma.recordingSession.findFirst({
      where: {
        projectId,
        kind,
        startedById: auth.session!.user.id,
        status: { in: ["Starting", "Active", "Paused", "Saving"] },
      },
      orderBy: { startedAt: "desc" },
      include: {
        recordedTestCases: {
          orderBy: { createdAt: "desc" },
          include: {
            steps: {
              orderBy: { stepNumber: "asc" },
            },
          },
        },
      },
    })

    if (!session) {
      return NextResponse.json({ session: null, connection: null })
    }

    let connection = null
    try {
      connection = await recorderWorkerRequest(`/sessions/${session.id}/connection`, {
        method: "GET",
      })
    } catch (err) {
      if (err instanceof RecorderWorkerError) {
        connection = {
          connectionStatus: "WorkerOffline",
          browserOpen: false,
          toolbarInjected: false,
          sessionStatus: session.status,
          lastError: session.lastError,
        }
      }
    }

    const currentCase =
      session.recordedTestCases.find((c) => c.id === session.currentRecordedTestCaseId) ||
      session.recordedTestCases.find((c) => c.status === "Draft") ||
      session.recordedTestCases[0] ||
      null

    return NextResponse.json({
      session,
      currentTestCase: currentCase,
      connection,
    })
  }

  // GET /api/recording/[sessionId]/connection
  if (matches(path, ["*", "connection"])) {
    const sessionId = path[0]
    const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
    if (guard) return guard
    try {
      const status = await recorderWorkerRequest(`/sessions/${sessionId}/connection`, { method: "GET" })
      return NextResponse.json(status)
    } catch (err) {
      if (err instanceof RecorderWorkerError) {
        const sessionDb = await prisma.recordingSession.findUnique({ where: { id: sessionId } })
        return NextResponse.json({
          connectionStatus: "WorkerOffline",
          browserOpen: false,
          toolbarInjected: false,
          sessionStatus: sessionDb?.status || "Failed",
          lastError: sessionDb?.lastError,
        })
      }
      return workerErrorResponse(err)
    }
  }

  // GET /api/recording/[sessionId]/recordings — session video artifacts
  if (matches(path, ["*", "recordings"])) {
    const sessionId = path[0]
    const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
    if (guard) return guard
    const recordings = await prisma.sessionRecording.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json({ recordings })
  }

  // GET /api/recording/[sessionId]/screenshots — persisted session captures
  if (matches(path, ["*", "screenshots"])) {
    const sessionId = path[0]
    const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
    if (guard) return guard
    const screenshots = await prisma.sessionScreenshot.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json({ screenshots })
  }

  // GET /api/recording/[sessionId]/frame — live preview snapshot (base64 JPEG)
  if (matches(path, ["*", "frame"])) {
    const sessionId = path[0]
    const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
    if (guard) return guard
    try {
      const result = await recorderWorkerRequest<{ frame: string | null; url: string | null }>(
        `/sessions/${sessionId}/frame`,
        { method: "GET" }
      )
      return NextResponse.json(result)
    } catch (err) {
      if (err instanceof RecorderWorkerError) {
        return NextResponse.json({ frame: null, url: null })
      }
      return workerErrorResponse(err)
    }
  }

  // 1. GET /api/recording/[sessionId]/stats
  if (matches(path, ["*", "stats"])) {
    const sessionId = path[0]
    const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
    if (guard) return guard
    const stats = await getSessionStats(sessionId)

    // The live view polls this for the Logs panel. getSessionStats only knows
    // about saved/draft counts, so the console and network errors have to come
    // from the recorder worker, which holds them in memory for the live
    // session. A worker that is down must not break the rest of the stats.
    let consoleErrors: string[] = []
    let networkErrors: string[] = []
    try {
      const logs = await recorderWorkerRequest<{
        consoleErrors?: string[]
        networkErrors?: string[]
      }>(`/sessions/${sessionId}/logs`, { method: "POST", body: JSON.stringify({}) })
      consoleErrors = logs?.consoleErrors ?? []
      networkErrors = logs?.networkErrors ?? []
    } catch {
      // Worker unavailable or session no longer live — report no live logs
      // rather than failing the poll.
    }

    return NextResponse.json({ ...stats, consoleErrors, networkErrors })
  }

  // 1. GET /api/recording/[sessionId]/steps
  if (matches(path, ["*", "steps"])) {
    const sessionId = path[0]
    const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
    if (guard) return guard
    const session = await prisma.recordingSession.findUnique({
      where: { id: sessionId },
    })
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const activeCase = session.currentRecordedTestCaseId
      ? await prisma.recordedTestCase.findFirst({
          where: { id: session.currentRecordedTestCaseId, sessionId },
        })
      : await prisma.recordedTestCase.findFirst({
          where: { sessionId, status: "Draft" },
          orderBy: { createdAt: "desc" },
        })
    
    if (!activeCase) {
      return NextResponse.json({ steps: [] })
    }

    const steps = await prisma.recordedStep.findMany({
      where: { recordedTestCaseId: activeCase.id },
      orderBy: { stepNumber: "asc" }
    })
    return NextResponse.json({ steps, testCaseId: activeCase.id })
  }

  // 2. GET /api/recording/[sessionId]
  if (path.length === 1 && path[0] !== "steps") {
    const sessionId = path[0]
    const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
    if (guard) return guard
    const recSession = await prisma.recordingSession.findUnique({
      where: { id: sessionId },
      include: {
        recordedTestCases: {
          orderBy: { createdAt: "desc" }
        }
      }
    })

    if (!recSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    return NextResponse.json({ session: recSession })
  }

  return NextResponse.json({ error: "Invalid GET endpoint" }, { status: 400 })
}

export async function POST(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const path = params.path
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  const firstArg = path[0]

  try {
    // POST /api/recording/sessions/start
    if (matches(path, ["sessions", "start"])) {
      const bodyResult = await readValidatedBody(request, startGlobalRecordingSchema)
      if (!bodyResult.ok) return bodyResult.response
      const data = bodyResult.data
      const { projectId } = data

      // Verify project ownership (permission audit)
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: auth.session!.user.id }
      })
      if (!project) {
        return unauthorizedResponse("Access denied or project not found")
      }

      // Verify credentials and hierarchy objects match the project scope
      if (data.requiredCredentialId) {
        const cred = await prisma.projectCredential.findFirst({
          where: { id: data.requiredCredentialId, projectId }
        })
        if (!cred) {
          return badRequestResponse("Credential does not belong to this project")
        }
      }
      const options = {
        title: data.title,
        module: data.module || "General",
        moduleId: data.moduleId || null,
        featureId: data.featureId || null,
        componentId: data.componentId || null,
        priority: data.priority || "Medium",
        preconditions: data.preconditions || undefined,
        requiredCredentialId: data.requiredCredentialId || undefined,
        startUrl: data.startUrl,
        browserType: data.browserType || "Chromium",
        viewport: data.viewport || "Desktop",
        recordingMode: data.recordingMode || "Fast",
      }

      try {
        const result = await recorderWorkerRequest<{ session: unknown; testCase: unknown }>(
          "/sessions/start",
          {
            method: "POST",
            body: JSON.stringify({
              projectId,
              userId: auth.session!.user.id,
              options,
            }),
          }
        )
        return NextResponse.json(result, { status: 201 })
      } catch (err: any) {
        console.error("Error starting global recording session:", err)
        if (err instanceof RecorderWorkerError) {
          return NextResponse.json(
            {
              error: err.message,
              code: err.code,
              details: err.details,
              troubleshooting:
                err.code === "WORKER_OFFLINE"
                  ? "Start the recorder worker: npm run recorder-worker"
                  : undefined,
            },
            { status: err.status || 503 }
          )
        }
        return NextResponse.json(
          { error: err.message || "Failed to start recording session" },
          { status: 500 }
        )
      }
    }

    // 1. POST /api/recording/steps/[stepId]/expected-result
    if (matches(path, ["steps", "*", "expected-result"])) {
      const stepId = path[1]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const bodyResult = await readValidatedBody(request, expectedResultSchema)
      if (!bodyResult.ok) return bodyResult.response
      // Deliberately the raw body, not bodyResult.data — see readValidatedBody.
      const body = bodyResult.raw
      const step = await prisma.recordedStep.update({
        where: { id: stepId },
        data: { expectedResult: body.expectedResult }
      })
      return NextResponse.json({ step })
    }

    // 2. POST /api/recording/steps/[stepId]/assertion
    if (matches(path, ["steps", "*", "assertion"])) {
      const stepId = path[1]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const bodyResult = await readValidatedBody(request, assertionSchema)
      if (!bodyResult.ok) return bodyResult.response
      // Deliberately the raw body, not bodyResult.data — see readValidatedBody.
      const body = bodyResult.raw
      const step = await prisma.recordedStep.update({
        where: { id: stepId },
        data: {
          assertionType: body.assertionType,
          assertionValue: body.assertionValue,
          assertions: body.assertions || []
        }
      })
      return NextResponse.json({ step })
    }

    // 3. POST /api/recording/steps/[stepId]/screenshot
    if (matches(path, ["steps", "*", "screenshot"])) {
      const stepId = path[1]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const bodyResult = await readValidatedBody(request, screenshotSchema)
      if (!bodyResult.ok) return bodyResult.response
      // Deliberately the raw body, not bodyResult.data — see readValidatedBody.
      const body = bodyResult.raw
      const step = await prisma.recordedStep.update({
        where: { id: stepId },
        data: { screenshotAfter: body.screenshotPath }
      })
      return NextResponse.json({ step })
    }

    // 4. POST /api/recording/steps/[stepId]/bug
    if (matches(path, ["steps", "*", "bug"])) {
      const stepId = path[1]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const body = await request.json()
      const step = await prisma.recordedStep.findUnique({
        where: { id: stepId },
        include: { recordedTestCase: true }
      })
      if (!step) {
        return NextResponse.json({ error: "Step not found" }, { status: 404 })
      }
      const bug = await recorderWorkerRequest(`/sessions/${step.recordedTestCase.sessionId}/bug`, {
        method: "POST",
        body: JSON.stringify({
          ...body,
          screenshotPath: step.screenshotAfter || undefined,
        }),
      })
      return NextResponse.json({ bug })
    }

    // 5. POST /api/recording/steps/[stepId]/validate-locator
    if (matches(path, ["steps", "*", "validate-locator"])) {
      const stepId = path[1]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const result = await recorderWorkerRequest(`/steps/${stepId}/validate-locator`, {
        method: "POST",
        body: JSON.stringify({}),
      })
      return NextResponse.json(result)
    }

    // Dynamic session operations (firstArg is sessionId)
    const sessionId = firstArg

    if (matches(path, ["*", "pause"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      return withWorker(async () => {
        await recorderWorkerRequest(`/sessions/${sessionId}/pause`, { method: "POST", body: "{}" })
        await prisma.recordingSession.update({
          where: { id: sessionId },
          data: { status: "Paused" },
        })
        return NextResponse.json({ success: true })
      })
    }

    // 7. POST /api/recording/[sessionId]/resume
    if (matches(path, ["*", "resume"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      return withWorker(async () => {
        await recorderWorkerRequest(`/sessions/${sessionId}/resume`, { method: "POST", body: "{}" })
        await prisma.recordingSession.update({
          where: { id: sessionId },
          data: { status: "Active" },
        })
        return NextResponse.json({ success: true })
      })
    }

    // POST /api/recording/[sessionId]/step-recording — body: { enabled: boolean }
    // Live QA scenario recording start/stop (in-memory flag on the worker).
    // POST /api/recording/[sessionId]/manual-step — append a hand-written step.
    // The live view has always called this; there was never a route behind it,
    // so every manual step failed with "Invalid POST endpoint".
    if (matches(path, ["*", "manual-step"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard

      const parsed = z
        .object({
          actionDescription: z.string().min(1).max(2000),
          actionType: z.string().max(100).optional().nullable(),
          targetType: z.string().max(100).optional().nullable(),
          targetValue: z.string().max(2000).optional().nullable(),
          inputValue: z.string().max(2000).optional().nullable(),
          expectedResult: z.string().max(2000).optional().nullable(),
        })
        .safeParse(await request.json().catch(() => null))
      if (!parsed.success) return badRequestResponse("Invalid manual step payload")

      // pageUrl is required on RecordedStep; use wherever the session is now.
      const sess = await prisma.recordingSession.findUnique({
        where: { id: sessionId },
        select: { currentUrl: true, startUrl: true },
      })

      // Steps hang off the session's current draft case, newest last.
      const draft = await prisma.recordedTestCase.findFirst({
        where: { sessionId, status: "Draft" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
      if (!draft) return badRequestResponse("This session has no draft test case to append to")

      const last = await prisma.recordedStep.findFirst({
        where: { recordedTestCaseId: draft.id },
        orderBy: { stepNumber: "desc" },
        select: { stepNumber: true },
      })

      const step = await prisma.recordedStep.create({
        data: {
          recordedTestCaseId: draft.id,
          stepNumber: (last?.stepNumber ?? 0) + 1,
          pageUrl: sess?.currentUrl || sess?.startUrl || "",
          actionDescription: parsed.data.actionDescription,
          // The dropdowns are free-form strings; coerce to real enum members so
          // an unexpected value degrades instead of failing the whole request.
          actionType: (ACTION_TYPES.has(parsed.data.actionType as any)
            ? parsed.data.actionType
            : "custom_instruction") as any,
          targetType: (TARGET_TYPES.has(parsed.data.targetType as any)
            ? parsed.data.targetType
            : "none") as any,
          targetValue: parsed.data.targetValue || null,
          inputValue: parsed.data.inputValue || null,
          expectedResult: parsed.data.expectedResult || null,
          includeInFinalTestCase: true,
        },
      })
      return NextResponse.json({ step }, { status: 201 })
    }

    if (matches(path, ["*", "step-recording"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const body = await request.json().catch(() => ({}))
      return withWorker(async () => {
        const result = await recorderWorkerRequest<{ stepRecording: boolean }>(
          `/sessions/${sessionId}/step-recording`,
          { method: "POST", body: JSON.stringify({ enabled: body.enabled !== false }) }
        )
        return NextResponse.json({ success: true, stepRecording: result.stepRecording })
      })
    }

    // 8. POST /api/recording/[sessionId]/finish
    if (matches(path, ["*", "finish"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      try {
        try {
          await recorderWorkerRequest(`/sessions/${sessionId}/finish`, { method: "POST", body: "{}" })
        } catch {}

        // Mark session finished in DB
        await prisma.recordingSession.updateMany({
          where: { id: sessionId },
          data: { status: "Finished", finishedAt: new Date(), connectionStatus: "BrowserClosed" },
        })

        // Convert drafts into library test cases — but only drafts with real
        // steps. A draft holding just its opening "Open URL" step (every Live
        // QA session where step recording was never switched on) would become
        // a useless one-step test case.
        const recCases = await prisma.recordedTestCase.findMany({
          where: { sessionId, status: { not: "Discarded" } },
          select: {
            id: true,
            _count: { select: { steps: { where: { includeInFinalTestCase: true, actionType: { not: "open_url" } } } } },
          },
        })
        const testCases: { id: string; title: string }[] = []
        for (const c of recCases) {
          if (c._count.steps === 0) continue
          const tc = await saveRecordedCaseAsTestCase(c.id).catch(() => null)
          if (tc) testCases.push({ id: tc.id, title: tc.title })
        }

        return NextResponse.json({ success: true, testCases })
      } catch (err) {
        return workerErrorResponse(err)
      }
    }

    // 9. POST /api/recording/[sessionId]/cancel
    if (matches(path, ["*", "cancel"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard

      // Best-effort: ask the worker to close the browser. If the worker is offline
      // the browser is already gone — skip gracefully and clean up the DB anyway.
      let workerStopped = false
      try {
        await recorderWorkerRequest(`/sessions/${sessionId}/cancel`, { method: "POST", body: "{}" })
        workerStopped = true
      } catch {
        // Worker offline or session unknown — proceed to DB cleanup
      }

      // Always mark the session Cancelled so recoverActiveSession() won't resurface it
      await prisma.recordingSession.updateMany({
        where: { id: sessionId, status: { not: "Cancelled" } },
        data: { status: "Cancelled", finishedAt: new Date() },
      })

      return NextResponse.json({ success: true, workerStopped })
    }

    // POST /api/recording/[sessionId]/screenshot — body: { fullPage?: boolean }
    if (matches(path, ["*", "screenshot"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const body = await request.json().catch(() => ({}))
      return withWorker(async () => {
        const result = await recorderWorkerRequest<any>(`/sessions/${sessionId}/screenshot`, {
          method: "POST",
          body: JSON.stringify({ fullPage: !!body.fullPage }),
        })
        return NextResponse.json(result)
      })
    }

    // POST /api/recording/[sessionId]/screenshot/annotated — persist an
    // annotated screenshot (data URL from the in-app annotator). No worker
    // involvement: the image is saved straight to storage.
    if (matches(path, ["*", "screenshot", "annotated"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const body = await request.json().catch(() => ({}))
      const imageData: string = body.imageData || ""
      const match = imageData.match(/^data:image\/(png|jpeg);base64,(.+)$/)
      if (!match) return badRequestResponse("imageData must be a base64 PNG or JPEG data URL")
      const buffer = Buffer.from(match[2], "base64")
      if (buffer.length > 15 * 1024 * 1024) return badRequestResponse("Image exceeds 15MB limit")
      const screenshotPath = await saveFile(
        "screenshots",
        `annotated-${sessionId}-${Date.now()}.${match[1] === "jpeg" ? "jpg" : "png"}`,
        buffer
      )

      // This is the single persistence point for session screenshots —
      // captures are held in memory until the tester explicitly saves.
      // Lineage links to the raw capture when re-annotating a saved shot;
      // fresh captures carry their own pageUrl/fullPage metadata.
      let annotatedFromId: string | null = null
      let pageUrl: string | null = typeof body.pageUrl === "string" ? body.pageUrl : null
      if (typeof body.annotatedFromId === "string" && body.annotatedFromId) {
        const original = await prisma.sessionScreenshot.findFirst({
          where: { id: body.annotatedFromId, sessionId },
          select: { id: true, pageUrl: true },
        })
        if (original) {
          annotatedFromId = original.id
          pageUrl = original.pageUrl
        }
      }
      const screenshot = await prisma.sessionScreenshot.create({
        data: {
          sessionId,
          filePath: screenshotPath,
          annotatedFromId,
          pageUrl,
          fullPage: !!body.fullPage,
        },
      })
      return NextResponse.json({ screenshotPath, screenshot })
    }

    // POST /api/recording/[sessionId]/recordings — upload a MediaRecorder clip
    // (multipart: file + durationMs). Produces a SessionRecording row that is
    // playable/downloadable immediately, before the session ends.
    if (matches(path, ["*", "recordings"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const formData = await request.formData().catch(() => null)
      const file = formData?.get("file") as File | null
      if (!file) return badRequestResponse("No recording file uploaded")
      if (file.size > 200 * 1024 * 1024) return badRequestResponse("Recording exceeds 200MB limit")
      const durationMs = Number(formData?.get("durationMs")) || null

      const buffer = Buffer.from(await file.arrayBuffer())
      const filePath = await saveFile("videos", `liveqa-${sessionId}-${Date.now()}.webm`, buffer)
      const now = new Date()
      const recording = await prisma.sessionRecording.create({
        data: {
          sessionId,
          filePath,
          status: "Ready",
          startedAt: durationMs ? new Date(now.getTime() - durationMs) : now,
          endedAt: now,
          durationMs,
        },
      })
      return NextResponse.json({ recording }, { status: 201 })
    }

    // POST /api/recording/[sessionId]/stream-token — mint a one-time token for
    // the live-view WebSocket. Ownership is verified here; the browser then
    // connects to the worker directly (ws://…/sessions/:id/stream?token=…).
    if (matches(path, ["*", "stream-token"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      return withWorker(async () => {
        const result = await recorderWorkerRequest<{ token: string }>(
          `/sessions/${sessionId}/stream-token`,
          { method: "POST", body: "{}" }
        )
        const wsBase = RECORDER_WORKER_URL.replace(/^http/, "ws")
        return NextResponse.json({
          token: result.token,
          wsUrl: `${wsBase}/sessions/${sessionId}/stream?token=${result.token}`,
        })
      })
    }

    // POST /api/recording/[sessionId]/input — forward mouse/keyboard/navigation
    // events from the embedded live browser view to the controlled page.
    if (matches(path, ["*", "input"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const body = await request.json().catch(() => ({}))
      return withWorker(async () => {
        const result = await recorderWorkerRequest<any>(`/sessions/${sessionId}/input`, {
          method: "POST",
          body: JSON.stringify(body),
        })
        return NextResponse.json(result)
      })
    }

    // POST /api/recording/[sessionId]/upload-file
    if (matches(path, ["*", "upload-file"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const formData = await request.formData().catch(() => null)
      if (!formData) {
        return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
      }
      const file = formData.get("file") as File
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
      }
      return withWorker(async () => {
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const result = await recorderWorkerRequest<any>(`/sessions/${sessionId}/upload-file`, {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            contentBase64: buffer.toString("base64")
          })
        })
        return NextResponse.json(result)
      })
    }

    // POST /api/recording/[sessionId]/cancel-file
    if (matches(path, ["*", "cancel-file"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      return withWorker(async () => {
        const result = await recorderWorkerRequest<any>(`/sessions/${sessionId}/cancel-file`, {
          method: "POST"
        })
        return NextResponse.json(result)
      })
    }

    // 10. POST /api/recording/[sessionId]/test-case/start-new
    if (matches(path, ["*", "test-case", "start-new"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const body = await request.json()
      return withWorker(async () => {
        const data = await recorderWorkerRequest<{ testCase: unknown }>(
          `/sessions/${sessionId}/test-case/start-new`,
          { method: "POST", body: JSON.stringify(body) }
        )
        return NextResponse.json({ testCase: data.testCase })
      })
    }

    // 11. POST /api/recording/[sessionId]/test-case/save-current
    if (matches(path, ["*", "test-case", "save-current"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const bodyResult = await readValidatedBody(request, saveCurrentSchema)
      if (!bodyResult.ok) return bodyResult.response
      // Deliberately the raw body, not bodyResult.data — see readValidatedBody.
      const body = bodyResult.raw
      const { testCaseId } = body
      if (!testCaseId) {
        return NextResponse.json({ error: "testCaseId is required" }, { status: 400 })
      }
      try {
        const savedCase = await saveRecordedCaseAsTestCase(testCaseId)
        return NextResponse.json({ testCase: savedCase })
      } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to save test case" }, { status: 500 })
      }
    }

    // 12. POST /api/recording/[sessionId]/steps (append step manually)
    if (matches(path, ["*", "steps"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const bodyResult = await readValidatedBody(request, appendStepSchema)
      if (!bodyResult.ok) return bodyResult.response
      // Deliberately the raw body, not bodyResult.data — see readValidatedBody.
      const body = bodyResult.raw
      const activeCase = await prisma.recordedTestCase.findFirst({
        where: { sessionId, status: "Draft" },
        orderBy: { createdAt: "desc" }
      })
      if (!activeCase) {
        return NextResponse.json({ error: "No active test case draft in this session" }, { status: 400 })
      }
      const stepCount = await prisma.recordedStep.count({ where: { recordedTestCaseId: activeCase.id } })
      const step = await prisma.recordedStep.create({
        data: {
          recordedTestCaseId: activeCase.id,
          stepNumber: stepCount + 1,
          pageUrl: body.pageUrl || "",
          actionType: body.actionType,
          actionDescription: body.actionDescription,
          targetType: body.targetType || "none",
          targetValue: body.targetValue || null,
          inputValue: body.inputValue || null,
          recommendedSelector: body.recommendedSelector || null,
        }
      })
      return NextResponse.json({ step })
    }

    if (matches(path, ["*", "validate-flow"])) {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      return withWorker(async () => {
        const result = await recorderWorkerRequest(`/sessions/${sessionId}/validate-flow`, {
          method: "POST",
          body: JSON.stringify({ replay: true }),
        })
        return NextResponse.json(result)
      })
    }

    // 14. POST /api/recording/[sessionId]/steps/merge
    if (matches(path, ["*", "steps", "merge"])) {
      const bodyResult = await readValidatedBody(request, mergeStepsSchema)
      if (!bodyResult.ok) return bodyResult.response
      // Deliberately the raw body, not bodyResult.data — see readValidatedBody.
      const body = bodyResult.raw
      const { stepIds, mergedDescription, mergedActionType } = body
      if (!stepIds || stepIds.length < 2) {
        return NextResponse.json({ error: "At least two stepIds are required for merge" }, { status: 400 })
      }
      
      const steps = await prisma.recordedStep.findMany({
        where: { id: { in: stepIds } },
        orderBy: { stepNumber: "asc" }
      })
      
      if (steps.length === 0) {
        return NextResponse.json({ error: "No steps found" }, { status: 404 })
      }
      
      const guard = await verifyRecordedStep(steps[0].id, auth.session!.user.id)
      if (guard) return guard
      
      const firstStep = steps[0]
      const remainingSteps = steps.slice(1)
      const lastStep = steps[steps.length - 1]
      const combinedRawEvents = steps.flatMap(s => (s.rawEvents as any) || [])
      
      const updatedFirstStep = await prisma.recordedStep.update({
        where: { id: firstStep.id },
        data: {
          actionDescription: mergedDescription || firstStep.actionDescription,
          actionType: mergedActionType || firstStep.actionType,
          inputValue: lastStep.inputValue,
          targetValue: lastStep.targetValue,
          targetType: lastStep.targetType,
          recommendedSelector: lastStep.recommendedSelector,
          cssSelector: lastStep.cssSelector,
          xpathSelector: lastStep.xpathSelector,
          idSelector: lastStep.idSelector,
          testIdSelector: lastStep.testIdSelector,
          roleSelector: lastStep.roleSelector,
          labelSelector: lastStep.labelSelector,
          placeholderSelector: lastStep.placeholderSelector,
          rawEvents: combinedRawEvents,
          componentType: firstStep.componentType || lastStep.componentType,
        }
      })
      
      await prisma.recordedStep.deleteMany({
        where: { id: { in: remainingSteps.map(s => s.id) } }
      })
      
      const testCaseId = firstStep.recordedTestCaseId
      const allRemainingSteps = await prisma.recordedStep.findMany({
        where: { recordedTestCaseId: testCaseId },
        orderBy: { stepNumber: "asc" }
      })
      
      for (let i = 0; i < allRemainingSteps.length; i++) {
        await prisma.recordedStep.update({
          where: { id: allRemainingSteps[i].id },
          data: { stepNumber: i + 1 }
        })
      }
      
      return NextResponse.json({ success: true, mergedStep: updatedFirstStep })
    }

    // 15. POST /api/recording/[sessionId]/steps/[stepId]/split
    if (matches(path, ["*", "steps", "*", "split"])) {
      const stepId = path[2]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const bodyResult = await readValidatedBody(request, splitStepSchema)
      if (!bodyResult.ok) return bodyResult.response
      // Deliberately the raw body, not bodyResult.data — see readValidatedBody.
      const body = bodyResult.raw
      const { firstDescription, secondDescription, secondActionType, secondTargetValue, secondTargetType, secondInputValue } = body
      
      const step = await prisma.recordedStep.findUnique({
        where: { id: stepId }
      })
      if (!step) {
        return NextResponse.json({ error: "Step not found" }, { status: 404 })
      }
      
      await prisma.recordedStep.updateMany({
        where: {
          recordedTestCaseId: step.recordedTestCaseId,
          stepNumber: { gt: step.stepNumber }
        },
        data: {
          stepNumber: { increment: 1 }
        }
      })
      
      const updatedStep = await prisma.recordedStep.update({
        where: { id: stepId },
        data: {
          actionDescription: firstDescription || step.actionDescription
        }
      })
      
      const newStep = await prisma.recordedStep.create({
        data: {
          recordedTestCaseId: step.recordedTestCaseId,
          stepNumber: step.stepNumber + 1,
          pageUrl: step.pageUrl,
          actionType: secondActionType || step.actionType,
          actionDescription: secondDescription || "Second part of split action",
          targetType: secondTargetType || step.targetType,
          targetValue: secondTargetValue || step.targetValue,
          inputValue: secondInputValue || step.inputValue,
          recommendedSelector: step.recommendedSelector,
          cssSelector: step.cssSelector,
          xpathSelector: step.xpathSelector,
          idSelector: step.idSelector,
          testIdSelector: step.testIdSelector,
          roleSelector: step.roleSelector,
          labelSelector: step.labelSelector,
          placeholderSelector: step.placeholderSelector,
          componentType: step.componentType,
        }
      })
      
      return NextResponse.json({ success: true, updatedStep, newStep })
    }

  } catch (err: any) {
    console.error("Error in recording POST action:", err)
    return NextResponse.json({ error: err.message || "Failed to process request" }, { status: 500 })
  }

  return NextResponse.json({ error: "Invalid POST endpoint" }, { status: 400 })
}

export async function PUT(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const path = params.path
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }
  
  // 1. PUT /api/recording/steps/[stepId]
  if (matches(path, ["steps", "*"])) {
    const stepId = path[1]
    const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
    if (guard) return guard
    try {
      const body = await request.json()
      const updatedStep = await prisma.recordedStep.update({
        where: { id: stepId },
        data: body
      })
      return NextResponse.json({ step: updatedStep })
    } catch (err: any) {
      console.error("Error updating recorded step:", err)
      return NextResponse.json({ error: err.message || "Failed to update step" }, { status: 500 })
    }
  }

  // 2. PUT /api/recording/test-cases/[recordedTestCaseId]
  if (matches(path, ["test-cases", "*"])) {
    const caseId = path[1]
    const guard = await verifyRecordedTestCase(caseId, auth.session!.user.id)
    if (guard) return guard
    try {
      const body = await request.json()
      const updatedCase = await prisma.recordedTestCase.update({
        where: { id: caseId },
        data: body
      })
      return NextResponse.json({ testCase: updatedCase })
    } catch (err: any) {
      console.error("Error updating recorded test case metadata:", err)
      return NextResponse.json({ error: err.message || "Failed to update test case" }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Invalid PUT endpoint" }, { status: 400 })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { path: string[] } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const path = params.path

  // 1. DELETE /api/recording/steps/[stepId]
  if (matches(path, ["steps", "*"])) {
    const stepId = path[1]
    const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
    if (guard) return guard
    try {
      // Find step to re-adjust subsequent step numbers
      const stepToDelete = await prisma.recordedStep.findUnique({
        where: { id: stepId }
      })
      
      if (stepToDelete) {
        await prisma.recordedStep.delete({
          where: { id: stepId }
        })

        // Re-adjust numbers of subsequent steps
        await prisma.recordedStep.updateMany({
          where: {
            recordedTestCaseId: stepToDelete.recordedTestCaseId,
            stepNumber: { gt: stepToDelete.stepNumber }
          },
          data: {
            stepNumber: { decrement: 1 }
          }
        })
      }

      return NextResponse.json({ success: true })
    } catch (err: any) {
      console.error("Error deleting recorded step:", err)
      return NextResponse.json({ error: err.message || "Failed to delete step" }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Invalid DELETE endpoint" }, { status: 400 })
}

export async function PATCH(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const path = params.path
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  // PATCH /api/recording/steps/[stepId]/ignore
  // PATCH /api/recording/steps/[stepId]/restore
  if (path.length === 3 && path[0] === "steps" && (path[2] === "ignore" || path[2] === "restore")) {
    const stepId = path[1]
    const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
    if (guard) return guard
    const shouldIgnore = path[2] === "ignore"

    try {
      const updatedStep = await prisma.recordedStep.update({
        where: { id: stepId },
        data: { includeInFinalTestCase: !shouldIgnore }
      })
      return NextResponse.json({ success: true, step: updatedStep })
    } catch (err: any) {
      console.error("Error patching step:", err)
      return NextResponse.json({ error: err.message || "Failed to patch step" }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Invalid PATCH endpoint" }, { status: 400 })
}
