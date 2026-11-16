import { chromium, firefox, webkit, Browser, BrowserType as PlaywrightBrowserType, Page } from "playwright"
import { prisma } from "@/lib/db"
import { INJECTED_RECORDER_SCRIPT } from "./injected-recorder"
import { saveFile } from "@/lib/storage"
import { decryptSecret } from "@/lib/crypto"
import { handleLogin } from "@/lib/playwright/login-handler"
import { resolveLocatorString, executeStep } from "@/lib/playwright/step-executor"
import {
  getSessionStats,
  saveRecordedCaseAsTestCase,
} from "@/lib/recording/session-store"
import { syncBugReportToOpenProject } from "@/lib/integrations/openproject/sync-bug-report"

export { getSessionStats } from "@/lib/recording/session-store"

export interface ActiveSession {
  browser: Browser
  page: Page
  projectId: string
  currentTestCaseId: string
  sessionId: string
  consoleErrors: string[]
  networkErrors: string[]
  toolbarInjected: boolean
  connectionStatus: "Connected" | "Disconnected" | "Reconnecting" | "BrowserClosed" | "ToolbarNotInjected" | "WorkerOffline"
  // Session kind: "Recorder" (test studio) or "Workstation" (live exploratory QA)
  mode: "Recorder" | "Workstation"
  // Engine the session runs on — CDP screencast streaming is Chromium-only
  browserType: "Chromium" | "Firefox" | "WebKit"
  // Video is recorded at the context level but only retained on finish when the
  // user opted in. In Workstation mode this is driven by the toolbar; Recorder
  // mode keeps the legacy always-save behavior.
  videoEnabled: boolean
  videoEverEnabled: boolean
  // Whether browser interactions are captured as RecordedSteps. Recorder (Test
  // Studio) sessions record from the start (legacy behavior); Workstation (Live
  // QA) sessions start OFF so the tester can freely explore, then toggle step
  // recording on/off per scenario via setStepRecording().
  stepRecording: boolean
  // True while Validate replays the steps in a second tab of this context. The
  // recorder script runs there too, so without this the replay's own clicks
  // and typing were saved as new steps — every Validate doubled the test.
  replaying?: boolean
  activeFileChooser?: any
  onFileChooser?: (fileChooser: any) => void
}

export type SessionConnectionStatus = {
  connectionStatus: ActiveSession["connectionStatus"]
  browserOpen: boolean
  toolbarInjected: boolean
  sessionStatus: string
  lastError: string | null
}

const globalForRecording = global as unknown as {
  activeSessions: Map<string, ActiveSession>
}

export const activeSessions =
  globalForRecording.activeSessions || new Map<string, ActiveSession>()

if (process.env.NODE_ENV !== "production") {
  globalForRecording.activeSessions = activeSessions
}

function getPlaywrightBrowser(type: string): PlaywrightBrowserType {
  switch (type) {
    case "Firefox":
      return firefox
    case "WebKit":
      return webkit
    default:
      return chromium
  }
}

async function saveRecordingScreenshot(
  sessionId: string,
  caseId: string,
  stepNumber: number,
  buffer: Buffer
): Promise<string> {
  return saveFile(
    "recordings",
    `${sessionId}/${caseId}/step-${stepNumber}.png`,
    buffer
  )
}

function attachBrowserLifecycleHandlers(sessionId: string, browser: Browser, page: Page) {
  browser.on("disconnected", async () => {
    const activeSess = activeSessions.get(sessionId)
    if (activeSess) {
      activeSess.connectionStatus = "BrowserClosed"
    }
    await prisma.recordingSession.update({
      where: { id: sessionId },
      data: {
        connectionStatus: "BrowserClosed",
        lastError: "Recording browser was closed unexpectedly.",
      },
    }).catch(() => {})
    activeSessions.delete(sessionId)
  })

  page.on("close", async () => {
    const activeSess = activeSessions.get(sessionId)
    if (activeSess) {
      activeSess.connectionStatus = "BrowserClosed"
    }
    await prisma.recordingSession.update({
      where: { id: sessionId },
      data: {
        connectionStatus: "BrowserClosed",
        lastError: "Recording browser tab was closed.",
      },
    }).catch(() => {})
  })

  page.on("framenavigated", async () => {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {})
      const injected = await page.evaluate(() => !!(window as any).__qa_recorder_injected).catch(() => false)
      const activeSess = activeSessions.get(sessionId)
      if (activeSess) {
        activeSess.toolbarInjected = injected
        if (!injected) {
          activeSess.connectionStatus = "ToolbarNotInjected"
          await prisma.recordingSession.update({
            where: { id: sessionId },
            data: { connectionStatus: "ToolbarNotInjected" },
          }).catch(() => {})
        } else if (activeSess.connectionStatus === "ToolbarNotInjected") {
          activeSess.connectionStatus = "Connected"
          await prisma.recordingSession.update({
            where: { id: sessionId },
            data: { connectionStatus: "Connected", lastError: null },
          }).catch(() => {})
        }
      }
    } catch {
      // ignore navigation probe errors
    }
  })
}

export async function getSessionConnectionStatus(sessionId: string): Promise<SessionConnectionStatus> {
  const sessionDb = await prisma.recordingSession.findUnique({ where: { id: sessionId } })
  const activeSess = activeSessions.get(sessionId)

  if (!sessionDb) {
    return {
      connectionStatus: "WorkerOffline",
      browserOpen: false,
      toolbarInjected: false,
      sessionStatus: "Failed",
      lastError: "Session not found",
    }
  }

  if (!activeSess) {
    return {
      connectionStatus: (sessionDb.connectionStatus as SessionConnectionStatus["connectionStatus"]) || "WorkerOffline",
      browserOpen: false,
      toolbarInjected: false,
      sessionStatus: sessionDb.status,
      lastError: sessionDb.lastError,
    }
  }

  return {
    connectionStatus: activeSess.connectionStatus,
    browserOpen: !activeSess.page.isClosed(),
    toolbarInjected: activeSess.toolbarInjected,
    sessionStatus: sessionDb.status,
    lastError: sessionDb.lastError,
  }
}

function maskSensitiveInput(fieldName: string | null, value: string | null): string | null {
  if (!value) return value
  if (!fieldName) return value
  const key = fieldName.toLowerCase()
  if (
    key.includes("password") ||
    key.includes("token") ||
    key.includes("secret") ||
    key.includes("apikey") ||
    key.includes("auth") ||
    key.includes("credential")
  ) {
    return "***MASKED***"
  }
  return value
}

/**
 * Backup locators for a recorded step, in the format the step executor's
 * healing layer reads (`{ fallbackLocators: ["css=#id", "label=Email", …] }`).
 * Without them one stale or mis-derived primary locator fails the whole
 * replay even when the step also captured a working id or test id.
 */
export function buildLocatorCandidates(a: any): { fallbackLocators: string[] } | null {
  const primary = a?.targetType && a?.targetValue ? `${a.targetType === "test_id" ? "testid" : a.targetType}=${a.targetValue}` : null
  const out: string[] = []
  const add = (s: string | null | undefined) => {
    if (!s || s.length > 500 || s === primary || out.includes(s)) return
    out.push(s)
  }
  if (a?.testIdSelector) add(`css=${a.testIdSelector}`)
  if (a?.idSelector) add(`css=${String(a.idSelector).startsWith("#") ? a.idSelector : "#" + a.idSelector}`)
  if (a?.roleSelector && typeof a.roleSelector === "string" && a.roleSelector.includes(":")) {
    const i = a.roleSelector.indexOf(":")
    const role = a.roleSelector.slice(0, i)
    const name = a.roleSelector.slice(i + 1)
    if (role && name && !name.includes('"')) add(`role=${role}, name: "${name}"`)
  }
  if (a?.labelSelector) add(`label=${a.labelSelector}`)
  if (a?.placeholderSelector) add(`placeholder=${a.placeholderSelector}`)
  if (a?.cssSelector) add(`css=${a.cssSelector}`)
  if (a?.xpathSelector) add(`xpath=${a.xpathSelector}`)
  return out.length ? { fallbackLocators: out } : null
}

export async function startSession(
  projectId: string,
  userId: string,
  options: {
    title: string
    module: string
    priority: string
    preconditions?: string
    requiredCredentialId?: string
    startUrl: string
    browserType: string
    viewport: string
    recordingMode?: string
    moduleId?: string | null
    featureId?: string | null
    componentId?: string | null
    mode?: "Recorder" | "Workstation"
  }
) {
  const sessionMode: "Recorder" | "Workstation" = options.mode === "Workstation" ? "Workstation" : "Recorder"
  let roleUsed = "None"
  if (options.requiredCredentialId) {
    const cred = await prisma.projectCredential.findUnique({
      where: { id: options.requiredCredentialId },
    })
    if (cred) {
      roleUsed = cred.roleName
    }
  }

  const kind = sessionMode === "Workstation" ? "LiveQA" : "Studio"
  const existingActive = await prisma.recordingSession.findFirst({
    where: {
      projectId,
      kind,
      startedById: userId,
      status: { in: ["Starting", "Active", "Paused", "Saving"] },
    },
  })
  if (existingActive) {
    throw new Error(
      kind === "LiveQA"
        ? "You already have a Live QA session open in this project. End it before starting a new one."
        : "You already have a Recorder Studio session open in this project. Finish or cancel it before starting a new one."
    )
  }

  // Desktop defaults: Live QA uses 1512x778 so the streamed frame matches the
  // in-app live view area 1:1; Recorder Studio keeps a classic 1280x800 window.
  let width = sessionMode === "Workstation" ? 1512 : 1280
  let height = sessionMode === "Workstation" ? 778 : 800
  if (options.viewport === "Tablet") {
    width = 768
    height = 1024
  } else if (options.viewport === "Mobile") {
    width = 375
    height = 667
  }

  const dbSession = await prisma.recordingSession.create({
    data: {
      projectId,
      credentialId: options.requiredCredentialId || null,
      status: "Starting",
      browserType: options.browserType as any,
      viewport: options.viewport as any,
      startUrl: options.startUrl,
      currentUrl: options.startUrl,
      recordingMode: options.recordingMode || "Fast",
      connectionStatus: "Reconnecting",
      kind,
      startedById: userId,
    },
  })

  const sessionId = dbSession.id
  let browser: Browser
  let page: Page

  // Workstation sessions run headless: the browser is embedded in the web app
  // through the live view (frame streaming + input forwarding), so no external
  // window opens. Recorder Studio keeps a visible window with the injected
  // toolbar — but only where a display exists (macOS/Windows, or Linux with an
  // X server). In containers (Railway) there is no display, so a headed launch
  // crashes; the Studio UI streams frames regardless.
  const canRunHeaded = process.platform !== "linux" || !!process.env.DISPLAY
  // Retina (2x) capture makes the streamed frame sharp when scaled up —
  // including the Recorder Studio full-screen view. Apply it whenever the
  // session is consumed as a stream rather than a native window: Live QA
  // always, and Recorder Studio when it runs headless (no local display, e.g.
  // Railway). A native headed window keeps 1x so it isn't doubled in physical
  // size on the tester's screen. Forcing the scale factor at launch is
  // required — context deviceScaleFactor alone doesn't resize screencast
  // capture.
  const streamedChromium =
    options.browserType === "Chromium" && (sessionMode === "Workstation" || !canRunHeaded)

  try {
    const launcher = getPlaywrightBrowser(options.browserType)
    browser = await launcher.launch({
      headless: sessionMode === "Workstation" || !canRunHeaded,
      ...(streamedChromium ? { args: ["--force-device-scale-factor=2"] } : {}),
    })
  } catch (err: any) {
    console.error("[RECORDER] Playwright browser launch failed. Actual error:", err.message, err.stack)
    const actualError = err.message || "Unknown browser launch error"
    await prisma.recordingSession.update({
      where: { id: sessionId },
      data: {
        status: "Failed",
        connectionStatus: "WorkerOffline",
        lastError: `Browser launch failed: ${actualError}`,
        finishedAt: new Date(),
      },
    })
    throw new Error(
      `Recorder failed to start because Playwright browser could not launch: ${actualError}`
    )
  }

  // Studio keeps Playwright's whole-session recordVideo (finalized on close).
  // Live QA records on demand client-side (MediaRecorder on the live view),
  // so its contexts skip recordVideo entirely.
  const context = await browser.newContext({
    viewport: { width, height },
    // Render at 2x (retina) so frames stay ultra crisp and high-definition
    deviceScaleFactor: 2,
    bypassCSP: true,
    ...(sessionMode === "Workstation"
      ? {}
      : {
          recordVideo: {
            dir: "public/videos/raw",
            size: { width, height },
          },
        }),
  })

  // Set up automatic content script injection on context before creating any page.
  if (sessionMode === "Workstation") {
    await context.addInitScript("window.__QA_WORKSTATION_MODE = true;")
  }
  await context.addInitScript(INJECTED_RECORDER_SCRIPT)

  page = await context.newPage()
  attachBrowserLifecycleHandlers(sessionId, browser, page)

  // 2. Setup error collectors
  const consoleErrors: string[] = []
  const networkErrors: string[] = []

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text()
      // Mask authorization/credentials if they appear in logs
      if (!text.toLowerCase().includes("authorization") && !text.toLowerCase().includes("cookie")) {
        consoleErrors.push(text)
      }
    }
  })

  page.on("pageerror", (err) => {
    consoleErrors.push(err.message)
  })

  page.on("response", (res) => {
    const status = res.status()
    if (status >= 400) {
      networkErrors.push(`Failed to load resource: the server responded with a status of ${status} (${res.url()})`)
    }
  })

  // 3. Create RecordingSession in DB (already created above with Starting status)

  // 4. Create initial draft RecordedTestCase in DB
  const dbCase = await prisma.recordedTestCase.create({
    data: {
      sessionId: dbSession.id,
      title: options.title,
      priority: (options.priority as any) || "Medium",
      preconditions: options.preconditions || null,
      requiredCredentialId: options.requiredCredentialId || null,
      status: "Draft",
    },
  })

  // 5. Save to global sessions list
  activeSessions.set(sessionId, {
    browser,
    page,
    projectId,
    currentTestCaseId: dbCase.id,
    sessionId,
    consoleErrors,
    networkErrors,
    toolbarInjected: false,
    connectionStatus: "Connected",
    mode: sessionMode,
    browserType: (options.browserType as "Chromium" | "Firefox" | "WebKit") || "Chromium",
    videoEnabled: false,
    videoEverEnabled: false,
    // Test Studio records every action; Live QA waits for an explicit Start.
    stepRecording: sessionMode === "Recorder",
  })

  page.on("filechooser", (fileChooser) => {
    const sess = activeSessions.get(sessionId)
    if (sess) {
      sess.activeFileChooser = fileChooser
      sess.onFileChooser?.(fileChooser)
    }
  })

  await prisma.recordingSession.update({
    where: { id: sessionId },
    data: {
      currentRecordedTestCaseId: dbCase.id,
      status: "Active",
      connectionStatus: "Connected",
    },
  })

  // 6. Expose action listener callback
  await context.exposeFunction("qaRecordAction", async (actionData: any) => {
    // The injected recorder sends its own candidates (primary + fallbacks +
    // container context); build them server-side only when it didn't.
    if (actionData && typeof actionData === "object" && !actionData.locatorCandidates?.fallbackLocators?.length) {
      actionData.locatorCandidates = buildLocatorCandidates(actionData)
    }
    console.log(`[BACKEND RECORDER CALLBACK] Received action: ${actionData.actionType} for session: ${sessionId}`)
    try {
      const activeSess = activeSessions.get(sessionId)
      if (!activeSess) {
        console.log(`[BACKEND RECORDER CALLBACK] Active session not found in activeSessions map!`)
        return { success: false }
      }

      // Handle toolbar special actions
      if (actionData.actionType === "finish_recording") {
        if (!actionData.confirmed) {
          return { success: false, error: "Explicit confirmation is required to end the session." }
        }
        if (actionData.saveDraft) {
          try {
            await saveCurrentRecordedTestCase(sessionId, activeSess.currentTestCaseId)
          } catch (err: any) {
            console.error("Error saving draft on finish:", err)
            return { success: false, error: err.message || "Failed to save draft" }
          }
        } else {
          // Discard current draft - update status to Discarded
          if (activeSess.currentTestCaseId) {
            try {
              await prisma.recordedTestCase.update({
                where: { id: activeSess.currentTestCaseId },
                data: { status: "Discarded" }
              })
            } catch (err: any) {
              console.error("Error discarding draft on finish:", err)
            }
          }
        }
        setTimeout(async () => {
          try {
            await finishSession(sessionId)
          } catch (err) {
            console.error("Error in async finishSession:", err)
          }
        }, 1000)
        return { success: true }
      }

      if (actionData.actionType === "delete_step") {
        const { stepId } = actionData
        try {
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
            return { success: true }
          }
          return { success: false, error: "Step not found" }
        } catch (err: any) {
          console.error("Error deleting step:", err)
          return { success: false, error: err.message || "Failed to delete step" }
        }
      }

      if (actionData.actionType === "ignore_step") {
        const { stepId } = actionData
        try {
          const step = await prisma.recordedStep.update({
            where: { id: stepId },
            data: { includeInFinalTestCase: false }
          })
          return { success: true, step }
        } catch (err: any) {
          console.error("Error ignoring step:", err)
          return { success: false, error: err.message || "Failed to ignore step" }
        }
      }

      if (actionData.actionType === "restore_step") {
        const { stepId } = actionData
        try {
          const step = await prisma.recordedStep.update({
            where: { id: stepId },
            data: { includeInFinalTestCase: true }
          })
          return { success: true, step }
        } catch (err: any) {
          console.error("Error restoring step:", err)
          return { success: false, error: err.message || "Failed to restore step" }
        }
      }

      if (actionData.actionType === "cancel_recording") {
        setTimeout(async () => {
          try {
            await cancelSession(sessionId)
          } catch (err) {
            console.error("Error in async cancelSession:", err)
          }
        }, 100)
        return { success: true }
      }

      if (actionData.actionType === "pause_recording") {
        await pauseSession(sessionId)
        return { success: true, status: "Paused" }
      }

      if (actionData.actionType === "get_status") {
        const activeCase = await prisma.recordedTestCase.findUnique({
          where: { id: activeSess.currentTestCaseId }
        })
        const sessionDb = await prisma.recordingSession.findUnique({
          where: { id: sessionId }
        })
        const stepCount = await prisma.recordedStep.count({
          where: { recordedTestCaseId: activeSess.currentTestCaseId }
        })
        const lastSteps = await prisma.recordedStep.findMany({
          where: { recordedTestCaseId: activeSess.currentTestCaseId, includeInFinalTestCase: true },
          orderBy: { stepNumber: "desc" },
          take: 5,
          select: { stepNumber: true, actionType: true, actionDescription: true }
        })
        lastSteps.reverse()
        return {
          success: true,
          caseTitle: activeCase?.title || "",
          casePriority: activeCase?.priority || "Medium",
          sessionStatus: sessionDb?.status || "Active",
          consoleErrorsCount: activeSess.consoleErrors.length,
          networkErrorsCount: activeSess.networkErrors.length,
          currentStepCount: stepCount,
          lastSteps
        }
      }

      if (actionData.actionType === "get_stats") {
        const stats = await getSessionStats(sessionId)
        return {
          success: true,
          ...stats
        }
      }

      if (actionData.actionType === "get_recorded_steps") {
        const steps = await prisma.recordedStep.findMany({
          where: { recordedTestCaseId: activeSess.currentTestCaseId },
          orderBy: { stepNumber: "asc" }
        })
        return {
          success: true,
          steps
        }
      }

      if (actionData.actionType === "resume_recording") {
        await resumeSession(sessionId)
        return { success: true, status: "Active" }
      }

      if (actionData.actionType === "new_test_case") {
        const newCase = await startNewRecordedTestCase(sessionId, {
          title: actionData.title,
          module: actionData.module || "General",
          moduleId: actionData.moduleId,
          featureId: actionData.featureId,
          componentId: actionData.componentId,
          priority: actionData.priority || "Medium",
          preconditions: actionData.preconditions,
        })
        return { success: true, testCase: newCase }
      }

      if (actionData.actionType === "save_current_case") {
        const savedCase = await saveCurrentRecordedTestCase(sessionId, activeSess.currentTestCaseId)
        return { success: true, testCase: savedCase }
      }

      if (actionData.actionType === "take_screenshot") {
        let screenshotPath: string | null = null
        try {
          const screenshotBuffer = await page.screenshot({ type: "png", fullPage: !!actionData.fullPage })
          screenshotPath = await saveFile("screenshots", `record-${sessionId}-${Date.now()}.png`, screenshotBuffer)
        } catch (err) {
          console.error("Manual screenshot error:", err)
        }
        return { success: true, screenshotPath }
      }

      if (actionData.actionType === "create_bug") {
        const bug = await createBugFromSession(sessionId, actionData)
        return { success: true, bug }
      }

      // Toolbar-driven video recording (Workstation). Playwright records at the
      // context level, so these toggle whether the clip is retained on finish.
      if (actionData.actionType === "video_start") {
        activeSess.videoEnabled = true
        activeSess.videoEverEnabled = true
        return { success: true, videoEnabled: true }
      }
      if (actionData.actionType === "video_stop") {
        activeSess.videoEnabled = false
        return { success: true, videoEnabled: false }
      }

      if (actionData.actionType === "add_note") {
        const note = await prisma.recordingSessionNote.create({
          data: {
            sessionId,
            note: actionData.note,
            pageUrl: page.url(),
            screenshotPath: actionData.screenshotPath || null,
          }
        })
        return { success: true, note }
      }

      // Verify session is active
      const sessionDb = await prisma.recordingSession.findUnique({
        where: { id: sessionId },
      })
      if (!sessionDb || sessionDb.status !== "Active") {
        console.log(`[BACKEND RECORDER CALLBACK] Session in DB is not Active! status: ${sessionDb?.status}`)
        return { success: false, error: "Session is not active" }
      }

      // Step recording gate: when off (Live QA before the tester hits Start, or
      // after Stop), interactions still drive the live page but are NOT saved as
      // steps. The tester explores freely, then records only the scenario.
      if (!activeSess.stepRecording || activeSess.replaying) {
        return {
          success: true,
          skipped: true,
          consoleErrorsCount: activeSess.consoleErrors.length,
          networkErrorsCount: activeSess.networkErrors.length,
        }
      }

      const stepCount = await prisma.recordedStep.count({
        where: { recordedTestCaseId: activeSess.currentTestCaseId },
      })

      // Auto-wait for the DOM to settle (e.g. when the action triggered a navigation) before
      // snapshotting the step, so the captured screenshot/url reflect the loaded page. Best-effort:
      // every wait is capped and swallowed so a slow page never blocks recording.
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 5000 })
        await page.waitForLoadState("networkidle", { timeout: 3000 })
      } catch { /* already loaded or still busy — proceed with capture */ }

      // Take screenshot after the action is registered with a 1500ms safety timeout to prevent hanging during navigations
      let screenshotPath: string | null = null
      try {
        const screenshotPromise = page.screenshot({ type: "png" })
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Screenshot timeout")), 1500)
        )
        const screenshotBuffer = await Promise.race([screenshotPromise, timeoutPromise])
        screenshotPath = await saveRecordingScreenshot(
          sessionId,
          activeSess.currentTestCaseId,
          stepCount + 1,
          screenshotBuffer
        )
      } catch (err) {
        console.error("Screenshot error during recording:", err)
      }

      // Mask sensitive values before saving to database
      const safeInputValue = maskSensitiveInput(
        actionData.recommendedSelector || actionData.cssSelector || actionData.tagName, 
        actionData.inputValue
      )

      // Find the last recorded step to de-duplicate or update consecutive fill/duplicate steps
      const lastStep = await prisma.recordedStep.findFirst({
        where: { recordedTestCaseId: activeSess.currentTestCaseId },
        orderBy: { stepNumber: "desc" },
      })

      if (lastStep) {
        // Rule A: If it's the exact same consecutive action, target, and value, skip it
        if (
          lastStep.actionType === actionData.actionType &&
          (lastStep.cssSelector === actionData.cssSelector || lastStep.recommendedSelector === actionData.recommendedSelector) &&
          lastStep.inputValue === safeInputValue
        ) {
          console.log(`[BACKEND RECORDER CALLBACK] Skipping identical consecutive step: ${actionData.actionType}`)
          return { success: true, consoleErrorsCount: activeSess.consoleErrors.length, networkErrorsCount: activeSess.networkErrors.length }
        }

        // Rule B: If it's a consecutive fill on the same input, update the value instead of creating a new step
        if (
          lastStep.actionType === "fill" &&
          actionData.actionType === "fill" &&
          (lastStep.cssSelector === actionData.cssSelector || lastStep.recommendedSelector === actionData.recommendedSelector)
        ) {
          console.log(`[BACKEND RECORDER CALLBACK] Updating existing fill step on selector: ${actionData.cssSelector || lastStep.recommendedSelector}`)
          await prisma.recordedStep.update({
            where: { id: lastStep.id },
            data: {
              inputValue: safeInputValue,
              actionDescription: actionData.actionDescription,
              screenshotAfter: screenshotPath || lastStep.screenshotAfter,
              attributes: actionData.attributes || {},
              alternativeLocators: actionData.alternativeLocators || {},
              locatorCandidates: actionData.locatorCandidates ?? undefined,
            }
          })
          return { success: true, consoleErrorsCount: activeSess.consoleErrors.length, networkErrorsCount: activeSess.networkErrors.length }
        }
      }

      // Create RecordedStep in database
      await prisma.recordedStep.create({
        data: {
          recordedTestCaseId: activeSess.currentTestCaseId,
          stepNumber: stepCount + 1,
          pageUrl: actionData.pageUrl || page.url(),
          actionType: actionData.actionType,
          actionDescription: actionData.actionDescription,
          targetType: actionData.targetType || "none",
          targetValue: actionData.targetValue || null,
          inputValue: safeInputValue,
          tagName: actionData.tagName || null,
          visibleText: actionData.visibleText || null,
          recommendedSelector: actionData.recommendedSelector || null,
          cssSelector: actionData.cssSelector || null,
          xpathSelector: actionData.xpathSelector || null,
          idSelector: actionData.idSelector || null,
          testIdSelector: actionData.testIdSelector || null,
          roleSelector: actionData.roleSelector || null,
          labelSelector: actionData.labelSelector || null,
          placeholderSelector: actionData.placeholderSelector || null,
          reliabilityScore: actionData.reliabilityScore || 0,
          attributes: actionData.attributes || {},
          alternativeLocators: actionData.alternativeLocators || {},
          locatorCandidates: actionData.locatorCandidates ?? undefined,
          screenshotAfter: screenshotPath,
          assertionType: actionData.assertionType || null,
          assertionValue: actionData.assertionValue || null,
          assertions: actionData.assertions || [],
        },
      })

      // Update current url in session
      await prisma.recordingSession.update({
        where: { id: sessionId },
        data: { currentUrl: page.url() },
      })

      return {
        success: true,
        consoleErrorsCount: activeSess.consoleErrors.length,
        networkErrorsCount: activeSess.networkErrors.length
      }
    } catch (err) {
      console.error("Failed to persist recorded browser action:", err)
      return { success: false, error: "Database save error" }
    }
  })

  // 8. Auto-login if credentials selected
  if (options.requiredCredentialId) {
    const cred = await prisma.projectCredential.findUnique({
      where: { id: options.requiredCredentialId },
    })
    if (cred) {
      const decryptedPassword = decryptSecret({
        encrypted: cred.encryptedPassword,
        iv: cred.encryptionIv,
        authTag: cred.encryptionAuthTag,
        keyVersion: cred.keyVersion,
      })

      const loginUrl = cred.loginUrl || options.startUrl

      try {
        await handleLogin(page, {
          url: loginUrl,
          username: cred.username,
          password: decryptedPassword,
        })
      } catch (err) {
        console.error("Auto login error inside recorder:", err)
      }

      // Log credential usage audit
      await prisma.auditLog.create({
        data: {
          userId,
          projectId,
          credentialId: cred.id,
          action: "USE_CREDENTIAL_FOR_RECORDING",
          details: `Credential role "${roleUsed}" auto-loaded during recording session initialization.`,
        },
      })
    }
  }

  // 9. Go to starting page
  try {
    await page.goto(options.startUrl, { waitUntil: "load", timeout: 60000 })

    const toolbarInjected = await page
      .waitForFunction(() => !!(window as any).__qa_recorder_injected, { timeout: 10000 })
      .then(() => true)
      .catch(() => false)

    const activeSess = activeSessions.get(sessionId)
    if (activeSess) {
      activeSess.toolbarInjected = toolbarInjected
      if (!toolbarInjected) {
        activeSess.connectionStatus = "ToolbarNotInjected"
        await prisma.recordingSession.update({
          where: { id: sessionId },
          data: {
            connectionStatus: "ToolbarNotInjected",
            lastError: "Recorder toolbar could not be injected on the target page.",
          },
        })
      }
    }

    // Check if there are already steps for this test case
    const stepCount = await prisma.recordedStep.count({
      where: { recordedTestCaseId: dbCase.id },
    })

    if (stepCount === 0) {
      let screenshotPath: string | null = null
      try {
        const screenshotBuffer = await page.screenshot({ type: "png" })
        screenshotPath = await saveRecordingScreenshot(sessionId, dbCase.id, 1, screenshotBuffer)
      } catch (err) {
        console.error("Screenshot error during initial navigation:", err)
      }

      await prisma.recordedStep.create({
        data: {
          recordedTestCaseId: dbCase.id,
          stepNumber: 1,
          pageUrl: options.startUrl,
          actionType: "open_url",
          actionDescription: `Open URL: ${options.startUrl}`,
          targetType: "url",
          targetValue: options.startUrl,
          screenshotAfter: screenshotPath,
        },
      })

      // Update current url
      await prisma.recordingSession.update({
        where: { id: sessionId },
        data: { currentUrl: options.startUrl },
      })
    }
  } catch (err: any) {
    console.error("Initial navigation failed:", err)
    await prisma.recordingSession.update({
      where: { id: sessionId },
      data: {
        status: "Failed",
        connectionStatus: "Disconnected",
        lastError: `Target URL could not be opened: ${err.message || options.startUrl}`,
        finishedAt: new Date(),
      },
    })
    try {
      await browser.close()
    } catch {
      // ignore
    }
    activeSessions.delete(sessionId)
    throw new Error(`Target URL could not be opened: ${options.startUrl}`)
  }

  return { session: await prisma.recordingSession.findUnique({ where: { id: sessionId } }), testCase: dbCase }
}

export async function pauseSession(sessionId: string) {
  await prisma.recordingSession.update({
    where: { id: sessionId },
    data: { status: "Paused" },
  })
}

export async function resumeSession(sessionId: string) {
  await prisma.recordingSession.update({
    where: { id: sessionId },
    data: { status: "Active" },
  })
}

// Toggle whether browser interactions are captured as RecordedSteps (Live QA
// scenario recording start/stop). In-memory only — the flag lives on the active
// session in the worker process; returns the resulting state.
/**
 * Live console / network errors for an in-flight session.
 *
 * The collectors have always existed, but only their *counts* were ever
 * exposed, so the Logs panel had nothing to show. Returns empty arrays once the
 * session ends and its in-memory state is gone — the text is persisted onto the
 * bug/test case at that point.
 */
export function getSessionLogs(sessionId: string): {
  consoleErrors: string[]
  networkErrors: string[]
} {
  const sess = activeSessions.get(sessionId)
  return {
    consoleErrors: sess?.consoleErrors ?? [],
    networkErrors: sess?.networkErrors ?? [],
  }
}

export function setStepRecording(sessionId: string, enabled: boolean): { stepRecording: boolean } {
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) throw new Error("Active session not found")
  activeSess.stepRecording = enabled
  return { stepRecording: enabled }
}

export async function finishSession(sessionId: string) {
  await prisma.recordingSession.update({
    where: { id: sessionId },
    data: { status: "Saving" },
  })

  const activeSess = activeSessions.get(sessionId)
  if (activeSess) {
    // Recorder/Test Studio keeps the legacy always-save behavior. Workstation
    // only retains the clip when the tester turned recording on via the toolbar.
    const shouldSaveVideo =
      activeSess.mode === "Workstation" ? activeSess.videoEverEnabled : true
    try {
      const video = activeSess.page.video()
      if (video && shouldSaveVideo) {
        const videoPath = await video.path()
        const fs = await import("node:fs/promises")
        await fs.mkdir("public/videos", { recursive: true }).catch(() => {})
        await fs.copyFile(videoPath, `public/videos/${sessionId}.webm`).catch((err) => {
          console.error("Error copying session video:", err)
        })
      }
    } catch (err) {
      console.error("Error capturing video:", err)
    }

    try {
      await activeSess.browser.close()
    } catch (err) {
      console.error("Error closing browser on finish:", err)
    }
    activeSessions.delete(sessionId)
  }

  await prisma.recordingSession.update({
    where: { id: sessionId },
    data: {
      status: "Finished",
      finishedAt: new Date(),
      connectionStatus: "BrowserClosed",
      lastError: null,
    },
  })
}

export async function cancelSession(sessionId: string) {
  const activeSess = activeSessions.get(sessionId)
  if (activeSess) {
    try {
      await activeSess.browser.close()
    } catch (err) {
      console.error("Error closing browser on cancel:", err)
    }
    activeSessions.delete(sessionId)
  }

  await prisma.recordingSession.update({
    where: { id: sessionId },
    data: { 
      status: "Cancelled",
      finishedAt: new Date()
    },
  })

  // Discard draft test cases and steps
  await prisma.recordedTestCase.updateMany({
    where: { sessionId, status: "Draft" },
    data: { status: "Discarded" },
  })
}

export async function startNewRecordedTestCase(
  sessionId: string,
  metadata: {
    title: string
    module: string
    priority: string
    preconditions?: string
    requiredCredentialId?: string
    moduleId?: string | null
    featureId?: string | null
    componentId?: string | null
  }
) {
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) throw new Error("Active recording session not found")

  const sessionDb = await prisma.recordingSession.findUnique({
    where: { id: sessionId },
  })
  if (!sessionDb) throw new Error("Session database record not found")

  const dbCase = await prisma.recordedTestCase.create({
    data: {
      sessionId,
      title: metadata.title,
      priority: (metadata.priority as any) || "Medium",
      preconditions: metadata.preconditions || null,
      requiredCredentialId: metadata.requiredCredentialId || sessionDb.credentialId || null,
      status: "Draft",
    },
  })

  // Update in-memory session current test case ID pointer
  activeSess.currentTestCaseId = dbCase.id

  await prisma.recordingSession.update({
    where: { id: sessionId },
    data: { currentRecordedTestCaseId: dbCase.id },
  })

  // Navigate Playwright browser to project startUrl or clear state if starting fresh
  // We keep page open on current URL by default, which matches "Start new test case from current page"
  // If the starting URL is requested to reload, we do it:
  // But by default, we just add the opening step for the new case at current URL
  const currentUrl = activeSess.page.url()
  await prisma.recordedStep.create({
    data: {
      recordedTestCaseId: dbCase.id,
      stepNumber: 1,
      pageUrl: currentUrl,
      actionType: "open_url",
      actionDescription: `Continue recording from: ${currentUrl}`,
      targetType: "url",
      targetValue: currentUrl,
    }
  })

  return dbCase
}

export async function saveCurrentRecordedTestCase(
  sessionId: string,
  recordedTestCaseId: string
) {
  return saveRecordedCaseAsTestCase(recordedTestCaseId)
}

export async function validateStepLocator(
  stepId: string
): Promise<{ success: boolean; matches: number; healed?: boolean; healedSelector?: string }> {
  const step = await prisma.recordedStep.findUnique({
    where: { id: stepId },
    include: {
      recordedTestCase: {
        include: { session: true }
      }
    }
  })
  if (!step) return { success: false, matches: 0 }
  
  const sessionId = step.recordedTestCase.session.id
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) return { success: false, matches: 0 }

  const selector = step.recommendedSelector || step.cssSelector
  if (!selector) return { success: false, matches: 0 }

  // 1. Try primary locator
  try {
    const el = await activeSess.page.$(selector)
    if (el) {
      await prisma.recordedStep.update({
        where: { id: stepId },
        data: {
          validationStatus: "Passed",
          validationMessage: "Primary selector resolved successfully"
        }
      })
      return { success: true, matches: 1 }
    }
  } catch (err) {
    console.warn(`[validateStepLocator] Primary selector failed:`, err)
  }

  // 2. Try fallbacks for auto-healing validation
  let candidatesObj = step.locatorCandidates as any
  if (typeof candidatesObj === "string") {
    try {
      candidatesObj = JSON.parse(candidatesObj)
    } catch {
      candidatesObj = null
    }
  }

  if (candidatesObj && Array.isArray(candidatesObj.fallbackLocators)) {
    console.log(`[validateStepLocator] Primary locator failed. Evaluating ${candidatesObj.fallbackLocators.length} fallback candidates...`)
    for (const fallback of candidatesObj.fallbackLocators) {
      try {
        const locator = resolveLocatorString(activeSess.page, fallback)
        if (await locator.count() > 0) {
          console.log(`[validateStepLocator] HEALED: fallback locator "${fallback}" found a matching element!`)
          
          const eqIndex = fallback.indexOf("=")
          const fallbackVal = eqIndex === -1 ? fallback : fallback.substring(eqIndex + 1)
          const fallbackType = eqIndex === -1 ? "css" : fallback.substring(0, eqIndex)

          await prisma.recordedStep.update({
            where: { id: stepId },
            data: {
              recommendedSelector: fallbackVal,
              targetType: (fallbackType === "testid" ? "test_id" : fallbackType) as any,
              targetValue: fallbackVal,
              validationStatus: "Passed",
              validationMessage: `Primary selector failed. Auto-healed with fallback: ${fallback}`
            }
          })

          return { success: true, matches: 1, healed: true, healedSelector: fallback }
        }
      } catch (err: any) {
        console.warn(`[validateStepLocator] Fallback candidate "${fallback}" failed check:`, err.message)
      }
    }
  }

  await prisma.recordedStep.update({
    where: { id: stepId },
    data: {
      validationStatus: "Failed",
      validationMessage: "Element not found. Primary and fallback locators both failed to locate the element."
    }
  })

  return { success: false, matches: 0 }
}

export async function createBugFromSession(sessionId: string, bugData: any) {
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) throw new Error("Active session not found")

  const draftCase = await prisma.recordedTestCase.findUnique({
    where: { id: activeSess.currentTestCaseId },
    include: { steps: { orderBy: { stepNumber: "asc" } } }
  })
  if (!draftCase) throw new Error("Active test case not found")

  // Load the session record for real browser / viewport / URL metadata
  const sessionRecord = await prisma.recordingSession.findUnique({
    where: { id: sessionId },
  })

  // Generate bugKey
  const count = await prisma.bugReport.count({ where: { projectId: activeSess.projectId } })
  const bugKey = `BUG-${String(count + 1).padStart(4, "0")}`

  // Steps to reproduce — prefer tester-edited text, else auto-build from recorded steps
  const autoStepsText = draftCase.steps
    .map(s => `${s.stepNumber}. ${s.actionDescription}`)
    .join("\n")
  const stepsText = (bugData.stepsToReproduce && String(bugData.stepsToReproduce).trim())
    ? String(bugData.stepsToReproduce).trim()
    : autoStepsText

  // Save screenshot if screenshotPath is provided or take viewport screenshot
  let finalScreenshot: string | null = bugData.screenshotPath || null
  if (!finalScreenshot) {
    try {
      const screenshotBuffer = await activeSess.page.screenshot({ type: "png" })
      finalScreenshot = await saveFile("screenshots", `bug-${sessionId}-${Date.now()}.png`, screenshotBuffer)
    } catch (err) {
      console.error("Bug screenshot error:", err)
    }
  }

  // Resolve current URL — live page wins, then client-reported, then session record
  let currentUrl: string | null = null
  try {
    currentUrl = activeSess.page.url()
  } catch {}
  currentUrl = currentUrl || bugData.clientContext?.url || sessionRecord?.currentUrl || sessionRecord?.startUrl || null

  // Best-effort link to the in-progress session video (finalized on finish)
  let videoUrl: string | null = null
  try {
    const fs = await import("node:fs/promises")
    await fs.access(`public/videos/${sessionId}.webm`)
    videoUrl = `/videos/${sessionId}.webm`
  } catch {}

  // Auto-captured environment context (spec §3 "AUTO-FILLED DATA"), stored as
  // first-class columns so they are filterable and displayable in the bug UI.
  const ctx = bugData.clientContext || {}
  const screenResolution: string | null = ctx.screenResolution
    ? (ctx.viewportSize ? `${ctx.screenResolution} (viewport ${ctx.viewportSize})` : ctx.screenResolution)
    : null

  // Create BugReport
  const bug = await prisma.bugReport.create({
    data: {
      bugKey,
      title: bugData.title || `Bug in test case: ${draftCase.title}`,
      projectId: activeSess.projectId,
      recordedTestCaseId: draftCase.id,
      severity: bugData.severity || "Medium",
      priority: bugData.priority || "Medium",
      status: "Open",
      environment: "Dev",
      roleUsed: "None",
      browser: sessionRecord?.browserType || "Chromium",
      viewport: sessionRecord?.viewport || "Desktop",
      stepsToReproduce: stepsText || "No steps recorded yet.",
      expectedResult: (bugData.expectedResult && String(bugData.expectedResult).trim())
        || "Application operates correctly.",
      actualResult: bugData.actualResult || "Error occurred during execution.",
      screenshotPath: finalScreenshot,
      consoleLogs: activeSess.consoleErrors.join("\n") || null,
      networkErrors: activeSess.networkErrors.join("\n") || null,
      pageUrl: currentUrl,
      osInfo: ctx.os || null,
      screenResolution,
      videoUrl,
    }
  })

  // Create BugActivity
  await prisma.bugActivity.create({
    data: {
      bugId: bug.id,
      action: "CREATE_FROM_RECORDER",
      details: `Manual bug report created inside recorder workspace. ID: ${bugKey}.`
    }
  })

  // Best-effort: auto-sync to OpenProject when the project has it enabled.
  // Fire-and-forget so the toolbar response is never blocked by an external call.
  void syncBugReportToOpenProject(bug.id, { requireAutoFlag: true })
    .then(async (r) => {
      if (r.status === "skipped") return
      console.log(`[op-sync] session bug ${bugKey} ${r.status} → WP ${r.externalId}`)
      await prisma.bugActivity.create({
        data: {
          bugId: bug.id,
          action: "SYNC_OPENPROJECT",
          details: `Auto-synced to OpenProject work package #${r.externalId} (${r.status}).`,
        },
      }).catch(() => {})
    })
    .catch((err) => console.error("[op-sync] session bug auto-sync failed:", err))

  return bug
}

export interface FlowValidationReport {
  success: boolean
  overallStatus: "Passed" | "Failed" | "NeedsReview"
  steps: {
    stepId: string
    stepNumber: number
    validationStatus: string
    validationMessage: string
    screenshotPath?: string | null
    suggestedFix?: string | null
  }[]
}

export async function validateRecordedFlow(
  sessionId: string,
  options: { replay?: boolean } = {}
): Promise<FlowValidationReport> {
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) {
    throw new Error("Active session not found. Ensure the recorder browser is still open.")
  }

  const steps = await prisma.recordedStep.findMany({
    where: {
      recordedTestCaseId: activeSess.currentTestCaseId,
      includeInFinalTestCase: true,
    },
    orderBy: { stepNumber: "asc" },
  })

  const reportSteps: FlowValidationReport["steps"] = []
  let overallSuccess = true
  let replayPage: Page | null = null

  if (options.replay !== false) {
    try {
      const context = activeSess.page.context()
      // The context already injects the recorder into every page; adding it
      // again here ran it twice. Its events are ignored while replaying.
      activeSess.replaying = true
      replayPage = await context.newPage()
    } catch (err) {
      console.warn("[validateRecordedFlow] Could not create replay page, falling back to locator-only validation", err)
    }
  }

  try {
    for (const step of steps) {
      let status = "Passed"
      let message = "Step validated successfully"
      let screenshotPath: string | null = null
      let suggestedFix: string | null = null

      const isUrlAction = ["open_url", "wait_for_url", "assert_url"].includes(step.actionType)
      const isCustomAction = step.actionType === "custom_instruction"

      if (replayPage && !isCustomAction) {
        try {
          await executeStep(replayPage, {
            actionType: step.actionType,
            targetType: step.targetType,
            targetValue: step.targetValue,
            inputValue: step.inputValue,
            timeoutMs: 10000,
            locatorCandidates: step.locatorCandidates,
          })
          message = "Replay executed successfully"
        } catch (err: any) {
          status = "Failed"
          message = err.message || "Replay execution failed"
          suggestedFix = step.recommendedSelector
            ? `Try validating locator "${step.recommendedSelector}" or add a data-testid`
            : "Add a stronger locator such as data-testid or role+name"
          try {
            screenshotPath = await saveRecordingScreenshot(
              sessionId,
              activeSess.currentTestCaseId,
              step.stepNumber,
              await replayPage.screenshot({ type: "png" })
            )
          } catch {
            // ignore screenshot errors
          }
        }
      } else if (!isUrlAction && !isCustomAction) {
        const selector = step.recommendedSelector || step.cssSelector
        if (!selector) {
          status = "Failed"
          message = "No locator configured for this action"
          suggestedFix = "Pick element again or add data-testid on the target element"
        } else {
          try {
            const element = await activeSess.page.$(selector)
            if (!element) {
              status = "Failed"
              message = `Element with locator '${selector}' not found on active page`
              suggestedFix = "Re-record this step or validate locator with fallback healing"
            }
          } catch (err: any) {
            status = "Failed"
            message = `Error resolving locator: ${err.message || err}`
          }
        }
      }

      if (status === "Failed") {
        overallSuccess = false
      }

      await prisma.recordedStep.update({
        where: { id: step.id },
        data: {
          validationStatus: status,
          validationMessage: message,
        },
      })

      reportSteps.push({
        stepId: step.id,
        stepNumber: step.stepNumber,
        validationStatus: status,
        validationMessage: message,
        screenshotPath,
        suggestedFix,
      })
    }

  } finally {
    activeSess.replaying = false
    if (replayPage) {
      try {
        await replayPage.close()
      } catch {
        // ignore
      }
    }
  }

  const overallStatus: FlowValidationReport["overallStatus"] = overallSuccess
    ? "Passed"
    : reportSteps.some((s) => s.validationStatus === "Failed")
      ? "Failed"
      : "NeedsReview"

  return {
    success: overallSuccess,
    overallStatus,
    steps: reportSteps,
  }
}

