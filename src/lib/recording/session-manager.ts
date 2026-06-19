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
  consoleErrors: string[]
  networkErrors: string[]
}

const globalForRecording = global as unknown as {
  activeSessions: Map<string, ActiveSession>
}

export const activeSessions =
  globalForRecording.activeSessions || new Map<string, ActiveSession>()

if (process.env.NODE_ENV !== "production") {
  globalForRecording.activeSessions = activeSessions
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

  // 3. Create RecordingSession in DB
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

  // 4. Create initial draft RecordedTestCase in DB
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

  // 5. Save to global sessions list
  activeSessions.set(sessionId, {
    browser,
    page,
    projectId,
    currentTestCaseId: dbCase.id,
    sessionId,
    consoleErrors,
    networkErrors,
  })

  // 6. Expose action listener callback
  await context.exposeFunction("qaRecordAction", async (actionData: any) => {
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
        return {
          success: true,
          caseTitle: activeCase?.title || "",
          casePriority: activeCase?.priority || "Medium",
          sessionStatus: sessionDb?.status || "Active",
          consoleErrorsCount: activeSess.consoleErrors.length,
          networkErrorsCount: activeSess.networkErrors.length,
          currentStepCount: await prisma.recordedStep.count({ where: { recordedTestCaseId: activeSess.currentTestCaseId } })
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
            }
          })
          return { success: true, consoleErrorsCount: activeSess.consoleErrors.length, networkErrorsCount: activeSess.networkErrors.length }
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

  // 7. Set up automatic content script injection on reloads/navigations
  await page.addInitScript(INJECTED_RECORDER_SCRIPT)

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
      module: draft.module || "General",
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
          componentType: step.componentType,
          groupId: step.groupId,
          rawEvents: step.rawEvents || undefined,
          actionMetadata: step.actionMetadata || undefined,
          locatorCandidates: step.locatorCandidates || undefined,
          selectedOptionText: step.selectedOptionText,
          selectedOptionValue: step.selectedOptionValue,
          validationStatus: step.validationStatus,
          validationMessage: step.validationMessage,
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
      savedAt: new Date()
    },
  })

  return realTestCase
}

export async function validateStepLocator(stepId: string): Promise<{ success: boolean; matches: number }> {
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

  try {
    const el = await activeSess.page.$(selector)
    return { success: true, matches: el ? 1 : 0 }
  } catch {
    return { success: false, matches: 0 }
  }
}

export async function createBugFromSession(sessionId: string, bugData: any) {
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) throw new Error("Active session not found")

  const draftCase = await prisma.recordedTestCase.findUnique({
    where: { id: activeSess.currentTestCaseId },
    include: { steps: { orderBy: { stepNumber: "asc" } } }
  })
  if (!draftCase) throw new Error("Active test case not found")

  // Generate bugKey
  const count = await prisma.bugReport.count({ where: { projectId: activeSess.projectId } })
  const bugKey = `BUG-${String(count + 1).padStart(4, "0")}`

  // Format steps to reproduce
  const stepsText = draftCase.steps
    .map(s => `${s.stepNumber}. ${s.actionDescription}`)
    .join("\n")

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

  // Create BugReport
  const bug = await prisma.bugReport.create({
    data: {
      bugKey,
      title: bugData.title || `Bug in test case: ${draftCase.title}`,
      projectId: activeSess.projectId,
      moduleId: draftCase.moduleId || null,
      featureId: draftCase.featureId || null,
      componentId: draftCase.componentId || null,
      recordedTestCaseId: draftCase.id,
      severity: bugData.severity || "Medium",
      priority: bugData.priority || "Medium",
      status: "Open",
      environment: "Dev",
      roleUsed: "None",
      browser: "Chromium",
      viewport: "Desktop",
      stepsToReproduce: stepsText || "No steps recorded yet.",
      expectedResult: "Application operates correctly.",
      actualResult: bugData.actualResult || "Error occurred during execution.",
      screenshotPath: finalScreenshot,
      consoleLogs: activeSess.consoleErrors.join("\n") || null,
      networkErrors: activeSess.networkErrors.join("\n") || null,
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

  return bug
}

export interface FlowValidationReport {
  success: boolean
  steps: {
    stepId: string
    stepNumber: number
    validationStatus: string
    validationMessage: string
  }[]
}

export async function validateRecordedFlow(sessionId: string): Promise<FlowValidationReport> {
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) {
    throw new Error("Active session not found")
  }

  const steps = await prisma.recordedStep.findMany({
    where: { 
      recordedTestCaseId: activeSess.currentTestCaseId,
    },
    orderBy: { stepNumber: "asc" }
  })

  const reportSteps: {
    stepId: string
    stepNumber: number
    validationStatus: string
    validationMessage: string
  }[] = []

  let overallSuccess = true

  for (const step of steps) {
    let status = "Passed"
    let message = "Locator resolved successfully"

    const isUrlAction = ["open_url", "wait_for_url", "assert_url"].includes(step.actionType)
    const isCustomAction = step.actionType === "custom_instruction"

    if (!isUrlAction && !isCustomAction) {
      const selector = step.recommendedSelector || step.cssSelector
      if (!selector) {
        status = "Failed"
        message = "No locator configured for this action"
      } else {
        try {
          const element = await activeSess.page.$(selector)
          if (!element) {
            status = "Failed"
            message = `Element with locator '${selector}' not found on active page`
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
        validationMessage: message
      }
    })

    reportSteps.push({
      stepId: step.id,
      stepNumber: step.stepNumber,
      validationStatus: status,
      validationMessage: message
    })
  }

  return {
    success: overallSuccess,
    steps: reportSteps
  }
}

export async function getSessionStats(sessionId: string) {
  const cases = await prisma.recordedTestCase.findMany({
    where: { sessionId },
    include: { steps: true }
  })
  
  const savedCount = cases.filter(c => c.status === "SavedAsTestCase").length
  const draftCases = cases.filter(c => c.status === "Draft")
  const draftCount = draftCases.length
  const draftStepCount = draftCases.reduce((acc, c) => acc + c.steps.length, 0)
  
  return {
    savedCount,
    draftCount,
    draftStepCount
  }
}

