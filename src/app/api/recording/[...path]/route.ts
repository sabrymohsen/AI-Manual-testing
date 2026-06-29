import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, notFoundResponse, badRequestResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { getSessionStats, saveRecordedCaseAsTestCase } from "@/lib/recording/session-store"
import { recorderWorkerRequest, RecorderWorkerError } from "@/lib/recording/worker-client"

async function verifyRecordingSession(sessionId: string, userId: string) {
  const rec = await prisma.recordingSession.findUnique({
    where: { id: sessionId },
    include: { project: { select: { userId: true } } }
  })
  if (!rec) return notFoundResponse("Recording session not found")
  if (rec.project.userId !== userId) return unauthorizedResponse("Access denied")
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
  if (path.length === 2 && path[0] === "sessions" && path[1] === "active") {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")
    if (!projectId) return badRequestResponse("projectId is required")

    // Verify owner
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: auth.session!.user.id }
    })
    if (!project) return unauthorizedResponse("Access denied")

    const session = await prisma.recordingSession.findFirst({
      where: {
        projectId,
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
  if (path.length === 2 && path[1] === "connection") {
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

  // 1. GET /api/recording/[sessionId]/stats
  if (path.length === 2 && path[1] === "stats") {
    const sessionId = path[0]
    const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
    if (guard) return guard
    const stats = await getSessionStats(sessionId)
    return NextResponse.json(stats)
  }

  // 1. GET /api/recording/[sessionId]/steps
  if (path.length === 2 && path[1] === "steps") {
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
    if (path.length === 2 && path[0] === "sessions" && path[1] === "start") {
      const rawBody = await request.json()
      const parseResult = startGlobalRecordingSchema.safeParse(rawBody)
      if (!parseResult.success) {
        return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
      }
      const data = parseResult.data
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
      if (data.moduleId) {
        const m = await prisma.projectModule.findFirst({
          where: { id: data.moduleId, projectId }
        })
        if (!m) {
          return badRequestResponse("Module does not belong to this project")
        }
      }
      if (data.featureId) {
        const f = await prisma.projectFeature.findFirst({
          where: { id: data.featureId, module: { projectId } }
        })
        if (!f) {
          return badRequestResponse("Feature does not belong to this project")
        }
      }
      if (data.componentId) {
        const c = await prisma.projectComponent.findFirst({
          where: { id: data.componentId, feature: { module: { projectId } } }
        })
        if (!c) {
          return badRequestResponse("Component does not belong to this project")
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
    if (path.length === 3 && firstArg === "steps" && path[2] === "expected-result") {
      const stepId = path[1]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const rawBody = await request.json()
      const parseResult = expectedResultSchema.safeParse(rawBody)
      if (!parseResult.success) {
        return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
      }
      const body = rawBody
      const step = await prisma.recordedStep.update({
        where: { id: stepId },
        data: { expectedResult: body.expectedResult }
      })
      return NextResponse.json({ step })
    }

    // 2. POST /api/recording/steps/[stepId]/assertion
    if (path.length === 3 && firstArg === "steps" && path[2] === "assertion") {
      const stepId = path[1]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const rawBody = await request.json()
      const parseResult = assertionSchema.safeParse(rawBody)
      if (!parseResult.success) {
        return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
      }
      const body = rawBody
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
    if (path.length === 3 && firstArg === "steps" && path[2] === "screenshot") {
      const stepId = path[1]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const rawBody = await request.json()
      const parseResult = screenshotSchema.safeParse(rawBody)
      if (!parseResult.success) {
        return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
      }
      const body = rawBody
      const step = await prisma.recordedStep.update({
        where: { id: stepId },
        data: { screenshotAfter: body.screenshotPath }
      })
      return NextResponse.json({ step })
    }

    // 4. POST /api/recording/steps/[stepId]/bug
    if (path.length === 3 && firstArg === "steps" && path[2] === "bug") {
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
    if (path.length === 3 && firstArg === "steps" && path[2] === "validate-locator") {
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

    if (path.length === 2 && path[1] === "pause") {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      try {
        await recorderWorkerRequest(`/sessions/${sessionId}/pause`, { method: "POST", body: "{}" })
        await prisma.recordingSession.update({
          where: { id: sessionId },
          data: { status: "Paused" },
        })
        return NextResponse.json({ success: true })
      } catch (err) {
        return workerErrorResponse(err)
      }
    }

    // 7. POST /api/recording/[sessionId]/resume
    if (path.length === 2 && path[1] === "resume") {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      try {
        await recorderWorkerRequest(`/sessions/${sessionId}/resume`, { method: "POST", body: "{}" })
        await prisma.recordingSession.update({
          where: { id: sessionId },
          data: { status: "Active" },
        })
        return NextResponse.json({ success: true })
      } catch (err) {
        return workerErrorResponse(err)
      }
    }

    // 8. POST /api/recording/[sessionId]/finish
    if (path.length === 2 && path[1] === "finish") {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      try {
        await recorderWorkerRequest(`/sessions/${sessionId}/finish`, { method: "POST", body: "{}" })
        return NextResponse.json({ success: true })
      } catch (err) {
        return workerErrorResponse(err)
      }
    }

    // 9. POST /api/recording/[sessionId]/cancel
    if (path.length === 2 && path[1] === "cancel") {
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

    // POST /api/recording/[sessionId]/screenshot
    if (path.length === 2 && path[1] === "screenshot") {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      try {
        const result = await recorderWorkerRequest<any>(`/sessions/${sessionId}/screenshot`, { method: "POST", body: "{}" })
        return NextResponse.json(result)
      } catch (err) {
        return workerErrorResponse(err)
      }
    }

    // POST /api/recording/[sessionId]/bug — create a bug report from the live session
    if (path.length === 2 && path[1] === "bug") {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const body = await request.json()
      try {
        const result = await recorderWorkerRequest<{ bug: unknown }>(`/sessions/${sessionId}/bug`, {
          method: "POST",
          body: JSON.stringify(body),
        })
        return NextResponse.json(result)
      } catch (err) {
        return workerErrorResponse(err)
      }
    }

    // 10. POST /api/recording/[sessionId]/test-case/start-new
    if (path.length === 3 && path[1] === "test-case" && path[2] === "start-new") {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const body = await request.json()
      try {
        const data = await recorderWorkerRequest<{ testCase: unknown }>(
          `/sessions/${sessionId}/test-case/start-new`,
          { method: "POST", body: JSON.stringify(body) }
        )
        return NextResponse.json({ testCase: data.testCase })
      } catch (err) {
        return workerErrorResponse(err)
      }
    }

    // 11. POST /api/recording/[sessionId]/test-case/save-current
    if (path.length === 3 && path[1] === "test-case" && path[2] === "save-current") {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const rawBody = await request.json()
      const parseResult = saveCurrentSchema.safeParse(rawBody)
      if (!parseResult.success) {
        return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
      }
      const body = rawBody
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
    if (path.length === 2 && path[1] === "steps") {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      const rawBody = await request.json()
      const parseResult = appendStepSchema.safeParse(rawBody)
      if (!parseResult.success) {
        return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
      }
      const body = rawBody
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

    if (path.length === 2 && path[1] === "validate-flow") {
      const guard = await verifyRecordingSession(sessionId, auth.session!.user.id)
      if (guard) return guard
      try {
        const result = await recorderWorkerRequest(`/sessions/${sessionId}/validate-flow`, {
          method: "POST",
          body: JSON.stringify({ replay: true }),
        })
        return NextResponse.json(result)
      } catch (err) {
        return workerErrorResponse(err)
      }
    }

    // 14. POST /api/recording/[sessionId]/steps/merge
    if (path.length === 3 && path[1] === "steps" && path[2] === "merge") {
      const rawBody = await request.json()
      const parseResult = mergeStepsSchema.safeParse(rawBody)
      if (!parseResult.success) {
        return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
      }
      const body = rawBody
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
    if (path.length === 4 && path[1] === "steps" && path[3] === "split") {
      const stepId = path[2]
      const guard = await verifyRecordedStep(stepId, auth.session!.user.id)
      if (guard) return guard
      const rawBody = await request.json()
      const parseResult = splitStepSchema.safeParse(rawBody)
      if (!parseResult.success) {
        return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
      }
      const body = rawBody
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
  if (path.length === 2 && path[0] === "steps") {
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
  if (path.length === 2 && path[0] === "test-cases") {
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
  if (path.length === 2 && path[0] === "steps") {
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
