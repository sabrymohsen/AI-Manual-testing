import { chromium, Browser, Page } from "playwright"
import { prisma } from "@/lib/db"
import { INJECTED_RECORDER_SCRIPT } from "./injected-recorder"
import { saveFile } from "@/lib/storage"
import { decryptSecret } from "@/lib/crypto"
import { handleLogin } from "@/lib/playwright/login-handler"

export interface ActiveSession {
  browser: Browser
  page: Page
  projectId: string
  currentTestCaseId: string
  sessionId: string
}

const globalForRecording = global as unknown as {
  activeSessions: Map<string, ActiveSession>
}

export const activeSessions =
  globalForRecording.activeSessions || new Map<string, ActiveSession>()

if (process.env.NODE_ENV !== "production") {
  globalForRecording.activeSessions = activeSessions
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
    moduleId?: string | null
    featureId?: string | null
    componentId?: string | null
  }
) {
  let roleUsed = "None"
  if (options.requiredCredentialId) {
    const cred = await prisma.projectCredential.findUnique({
      where: { id: options.requiredCredentialId },
    })
    if (cred) {
      roleUsed = cred.roleName
    }
  }

  // 1. Launch Playwright browser (non-headless)
  const browser = await chromium.launch({ headless: false })
  
  let width = 1280
  let height = 800
  if (options.viewport === "Tablet") {
    width = 768
    height = 1024
  } else if (options.viewport === "Mobile") {
    width = 375
    height = 667
  }

  const context = await browser.newContext({
    viewport: { width, height },
    bypassCSP: true,
  })

  const page = await context.newPage()

  // 2. Create RecordingSession in DB
  const dbSession = await prisma.recordingSession.create({
    data: {
      projectId,
      credentialId: options.requiredCredentialId || null,
      status: "Active",
      browserType: options.browserType as any,
      viewport: options.viewport as any,
      startUrl: options.startUrl,
      currentUrl: options.startUrl,
    },
  })

  let resolvedModuleName = options.module || "General"
  if (options.moduleId) {
    const m = await prisma.projectModule.findUnique({ where: { id: options.moduleId } })
    if (m) {
      resolvedModuleName = m.name
    }
  }

  // 3. Create initial draft RecordedTestCase in DB
  const dbCase = await prisma.recordedTestCase.create({
    data: {
      sessionId: dbSession.id,
      title: options.title,
      module: resolvedModuleName,
      moduleId: options.moduleId || null,
      featureId: options.featureId || null,
      componentId: options.componentId || null,
      priority: (options.priority as any) || "Medium",
      preconditions: options.preconditions || null,
      requiredCredentialId: options.requiredCredentialId || null,
      status: "Draft",
    },
  })

  const sessionId = dbSession.id

  // 4. Save to global sessions list
  activeSessions.set(sessionId, {
    browser,
    page,
    projectId,
    currentTestCaseId: dbCase.id,
    sessionId,
  })

  // 5. Expose action listener callback
  await context.exposeFunction("qaRecordAction", async (actionData: any) => {
    console.log(`[BACKEND RECORDER CALLBACK] Received action: ${actionData.actionType} for session: ${sessionId}`)
    try {
      const activeSess = activeSessions.get(sessionId)
      if (!activeSess) {
        console.log(`[BACKEND RECORDER CALLBACK] Active session not found in activeSessions map!`)
        return
      }

      // Handle toolbar special actions
      if (actionData.actionType === "finish_recording") {
        await saveCurrentRecordedTestCase(sessionId, activeSess.currentTestCaseId)
        setTimeout(async () => {
          try {
            await finishSession(sessionId)
          } catch (err) {
            console.error("Error in async finishSession:", err)
          }
        }, 100)
        return { success: true }
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

      // Verify session is active
      const sessionDb = await prisma.recordingSession.findUnique({
        where: { id: sessionId },
      })
      if (!sessionDb || sessionDb.status !== "Active") {
        console.log(`[BACKEND RECORDER CALLBACK] Session in DB is not Active! status: ${sessionDb?.status}`)
        return
      }

      // Take screenshot after the action is registered with a 1500ms safety timeout to prevent hanging during navigations
      let screenshotPath: string | null = null
      try {
        const screenshotPromise = page.screenshot({ type: "png" })
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Screenshot timeout")), 1500)
        )
        const screenshotBuffer = await Promise.race([screenshotPromise, timeoutPromise])
        screenshotPath = await saveFile("screenshots", `record-${sessionId}-${Date.now()}.png`, screenshotBuffer)
      } catch (err) {
        console.error("Screenshot error during recording:", err)
      }

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
          lastStep.inputValue === actionData.inputValue
        ) {
          console.log(`[BACKEND RECORDER CALLBACK] Skipping identical consecutive step: ${actionData.actionType}`)
          return
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
              inputValue: actionData.inputValue || null,
              actionDescription: actionData.actionDescription,
              screenshotAfter: screenshotPath || lastStep.screenshotAfter,
              attributes: actionData.attributes || {},
              alternativeLocators: actionData.alternativeLocators || {},
            }
          })
          return
        }
      }

      // Count step number
      const stepCount = await prisma.recordedStep.count({
        where: { recordedTestCaseId: activeSess.currentTestCaseId },
      })

      // Create RecordedStep in database
      await prisma.recordedStep.create({
        data: {
          recordedTestCaseId: activeSess.currentTestCaseId,
          stepNumber: stepCount + 1,
          pageUrl: actionData.pageUrl || page.url(),
          actionType: actionData.actionType,
          actionDescription: actionData.actionDescription,
          targetType: actionData.targetType,
          targetValue: actionData.targetValue || null,
          inputValue: actionData.inputValue || null,
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
          screenshotAfter: screenshotPath,
        },
      })

      // Update current url
      await prisma.recordingSession.update({
        where: { id: sessionId },
        data: { currentUrl: page.url() },
      })
    } catch (err) {
      console.error("Failed to persist recorded browser action:", err)
    }
  })

  // 6. Set up automatic content script injection on reloads/navigations
  await page.addInitScript(INJECTED_RECORDER_SCRIPT)

  // 7. Auto-login if credentials selected
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

  // 8. Go to starting page
  try {
    await page.goto(options.startUrl, { waitUntil: "load" })

    // Check if there are already steps for this test case
    const stepCount = await prisma.recordedStep.count({
      where: { recordedTestCaseId: dbCase.id },
    })

    if (stepCount === 0) {
      let screenshotPath: string | null = null
      try {
        const screenshotBuffer = await page.screenshot({ type: "png" })
        screenshotPath = await saveFile("screenshots", `record-${sessionId}-${Date.now()}.png`, screenshotBuffer)
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
  } catch (err) {
    console.error("Initial navigation failed:", err)
  }

  return { session: dbSession, testCase: dbCase }
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

export async function finishSession(sessionId: string) {
  const activeSess = activeSessions.get(sessionId)
  if (activeSess) {
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
      finishedAt: new Date()
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

  let resolvedModuleName = metadata.module || "General"
  if (metadata.moduleId) {
    const m = await prisma.projectModule.findUnique({ where: { id: metadata.moduleId } })
    if (m) {
      resolvedModuleName = m.name
    }
  }

  const dbCase = await prisma.recordedTestCase.create({
    data: {
      sessionId,
      title: metadata.title,
      module: resolvedModuleName,
      moduleId: metadata.moduleId || null,
      featureId: metadata.featureId || null,
      componentId: metadata.componentId || null,
      priority: (metadata.priority as any) || "Medium",
      preconditions: metadata.preconditions || null,
      requiredCredentialId: metadata.requiredCredentialId || sessionDb.credentialId || null,
      status: "Draft",
    },
  })

  // Update in-memory session current test case ID pointer
  activeSess.currentTestCaseId = dbCase.id

  return dbCase
}

export async function saveCurrentRecordedTestCase(
  sessionId: string,
  recordedTestCaseId: string
) {
  const draft = await prisma.recordedTestCase.findUnique({
    where: { id: recordedTestCaseId },
    include: {
      steps: {
        where: { includeInFinalTestCase: true },
        orderBy: { stepNumber: "asc" },
      },
      session: true,
    },
  })

  if (!draft) throw new Error("Draft recorded test case not found")

  // Create real structured test case
  const realTestCase = await prisma.testCase.create({
    data: {
      projectId: draft.session.projectId,
      title: draft.title,
      module: draft.module,
      moduleId: draft.moduleId,
      featureId: draft.featureId,
      componentId: draft.componentId,
      priority: draft.priority,
      preconditions: draft.preconditions,
      requiredCredentialId: draft.requiredCredentialId,
      source: "Manual",
      steps: {
        create: draft.steps.map((step, idx) => ({
          stepNumber: idx + 1,
          actionDescription: step.actionDescription,
          expectedResult: step.expectedResult || "Action completes successfully",
          actionType: step.actionType,
          targetType: step.targetType,
          targetValue: step.targetValue,
          inputValue: step.inputValue,
          timeoutMs: 10000,
          assertions: step.assertions || [],
        })),
      },
    },
  })

  // Update draft status
  await prisma.recordedTestCase.update({
    where: { id: recordedTestCaseId },
    data: {
      status: "SavedAsTestCase",
      finalTestCaseId: realTestCase.id,
    },
  })

  return realTestCase
}
