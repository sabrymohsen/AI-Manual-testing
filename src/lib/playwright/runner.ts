import { chromium, Browser, BrowserContext, Page } from "playwright"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { saveFile } from "@/lib/storage"
import { sanitizeUrl, sanitizeHeaders, sanitizeBody, sanitizeLogMessage } from "@/lib/sanitize"
import { executeStep } from "./step-executor"
import { runAssertions } from "./assertion-runner"
import { handleLogin } from "./login-handler"
import { notifyIntegrations } from "@/lib/integrations/notifier"
import { isCancelSignalSet, publishTestRunEvent } from "@/lib/queue"

interface RunOptions {
  testRunId: string
  headless?: boolean
}

export async function runTestCase({ testRunId, headless = true }: RunOptions) {
  const testRun = await prisma.testRun.findUnique({
    where: { id: testRunId },
    include: {
      testCase: {
        include: {
          steps: { orderBy: { stepNumber: "asc" } },
        },
      },
      credential: true,
      project: true,
      autonomousAgentRun: true,
    },
  })

  if (!testRun?.testCase) {
    await prisma.testRun.update({
      where: { id: testRunId },
      data: { status: "Failed", completedAt: new Date() },
    })
    await publishTestRunEvent(testRunId, "test_run.completed", { status: "Failed", error: "Test case not found" })
    return
  }

  const startTime = Date.now()

  // 1. Initial Cancellation Check
  if (await isCancelSignalSet(testRunId)) {
    await prisma.testRun.update({
      where: { id: testRunId },
      data: { status: "Cancelled", completedAt: new Date() },
    })
    await publishTestRunEvent(testRunId, "test_run.completed", { status: "Cancelled" })
    return
  }

  await prisma.testRun.update({
    where: { id: testRunId },
    data: { status: "Running", startedAt: new Date() },
  })
  await publishTestRunEvent(testRunId, "test_run.started", { status: "Running" })

  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null
  let decryptedPassword = ""

  try {
    browser = await chromium.launch({ headless })
    context = await browser.newContext({
      viewport: testRun.viewportWidth && testRun.viewportHeight
        ? { width: testRun.viewportWidth, height: testRun.viewportHeight }
        : { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    })

    page = await context.newPage()

    const logs: any[] = []
    const networkLogs: any[] = []

    page.on("console", (msg) => {
      logs.push({
        source: "browser",
        level: msg.type() as any,
        message: sanitizeLogMessage(msg.text()),
        timestamp: new Date().toISOString(),
      })
    })

    page.on("pageerror", (err) => {
      logs.push({
        source: "browser",
        level: "error",
        message: sanitizeLogMessage(err.message),
        timestamp: new Date().toISOString(),
      })
    })

    page.on("request", (request) => {
      networkLogs.push({
        url: sanitizeUrl(request.url()),
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: new Date().toISOString(),
        requestStart: Date.now(),
        requestHeaders: sanitizeHeaders(request.headers() as Record<string, string>),
      })
    })

    page.on("response", (response) => {
      const url = sanitizeUrl(response.url())
      const entries = networkLogs.filter((l) => l.url === url && l.status === undefined)
      if (entries.length > 0) {
        const entry = entries.sort((a, b) => b.requestStart - a.requestStart)[0]
        entry.status = response.status()
        entry.responseHeaders = sanitizeHeaders(response.headers() as Record<string, string>)
        entry.durationMs = Date.now() - entry.requestStart
      }
    })

    page.on("requestfailed", (request) => {
      const url = sanitizeUrl(request.url())
      const entries = networkLogs.filter((l) => l.url === url && l.error === undefined)
      if (entries.length > 0) {
        const entry = entries.sort((a, b) => b.requestStart - a.requestStart)[0]
        entry.error = request.failure()?.errorText || "Request failed"
        entry.status = 0
      }
    })

    // Handle login if credential is selected
    if (testRun.credential) {
      decryptedPassword = decryptSecret({
        encrypted: testRun.credential.encryptedPassword,
        iv: testRun.credential.encryptionIv,
        authTag: testRun.credential.encryptionAuthTag,
        keyVersion: testRun.credential.keyVersion,
      })

      const hasRecordedLoginSteps = testRun.testCase.steps.some(
        (s) => s.inputValue === "***MASKED***"
      )

      if (!hasRecordedLoginSteps) {
        const loginUrl = testRun.credential.loginUrl || testRun.project.webAppUrl
        try {
          await handleLogin(page, {
            url: loginUrl,
            username: testRun.credential.username,
            password: decryptedPassword,
          })
        } catch (loginError: any) {
          console.error("[runner.ts] Login handler failed:", loginError)
          await prisma.testRun.update({
            where: { id: testRunId },
            data: {
              status: "Blocked",
              completedAt: new Date(),
              durationMs: Date.now() - startTime,
            },
          })
          await publishTestRunEvent(testRunId, "test_run.completed", { status: "Blocked", error: `Login failed: ${loginError.message}` })
          await notifyIntegrations(testRunId)
          return
        }
      }
    }

    let hasFailed = false
    let isCancelled = false

    // Execute steps
    for (const step of testRun.testCase.steps) {
      // 2. Cancellation Check between steps
      if (await isCancelSignalSet(testRunId)) {
        isCancelled = true
        break
      }

      const stepStartTime = Date.now()

      // Find or create step result
      const existingStepResult = await prisma.testStepResult.findFirst({
        where: {
          testRunId,
          testStepId: step.id,
        },
      })

      let stepResultId = ""
      if (existingStepResult) {
        stepResultId = existingStepResult.id
        await prisma.testStepResult.update({
          where: { id: stepResultId },
          data: { status: "Running" },
        })
      } else {
        const stepResult = await prisma.testStepResult.create({
          data: {
            testRunId,
            testStepId: step.id,
            stepNumber: step.stepNumber,
            actionDescription: step.actionDescription,
            expectedResult: step.expectedResult,
            status: "Running",
          },
        })
        stepResultId = stepResult.id
      }

      await publishTestRunEvent(testRunId, "test_run.step_started", {
        stepId: step.id,
        stepNumber: step.stepNumber,
        actionDescription: step.actionDescription,
      })

      // Screenshot before
      let screenshotBeforePath: string | null = null
      try {
        const screenshotBefore = page ? await page.screenshot({ type: "png", timeout: 5000 }) : null
        if (screenshotBefore) {
          screenshotBeforePath = await saveFile("screenshots", `step-${step.stepNumber}-before.png`, screenshotBefore)
        }
      } catch (e) {
        console.warn(`[runner.ts] Failed to capture screenshot before step ${step.stepNumber}:`, e instanceof Error ? e.message : e)
      }

      let stepToExecute: any = {
        ...step,
        executionMode: testRun.executionMode,
      }
      if (step.inputValue === "***MASKED***" && decryptedPassword) {
        stepToExecute.inputValue = decryptedPassword
      }

      let actualResult = ""
      let status: string = "Passed"
      let errorDetails: string | null = null
      let attempts = 0
      const maxAttempts = 3 // 1 initial + 2 retries

      // Destructive Action Safety Check
      let isSafetyBlocked = false
      if ((testRun as any).autonomousAgentRun && (testRun as any).autonomousAgentRun.safetyDoNotDelete) {
        const destructiveRegexp = /\b(delete|destroy|wipe|purge|pay|purchase|payment|terminate_account|cancel_account)\b/i
        const checkStr = `${step.actionDescription} ${step.actionType} ${step.targetValue || ""} ${step.inputValue || ""}`
        if (destructiveRegexp.test(checkStr)) {
          isSafetyBlocked = true
          status = "Skipped"
          actualResult = "Step skipped due to Autonomous Agent safety rules: destructive action detected."
          errorDetails = "Safety Check Blocked: Destructive action filter matched."
          logs.push({
            source: "playwright",
            level: "Warning",
            message: `Safety Block: Step ${step.stepNumber} was skipped because it matched destructive keywords (delete/payment).`,
            timestamp: new Date().toISOString()
          })
          console.warn(`[runner.ts] Safety Block on step ${step.stepNumber}: destructive action detected.`)
        }
      }

      while (attempts < maxAttempts && !isSafetyBlocked) {
        try {
          if (page) {
            await executeStep(page, stepToExecute)
          }

          if (page && step.assertions) {
            const assertionResults = await runAssertions(page, step.assertions as any[], logs)
            const failed = assertionResults.filter((r) => !r.passed)
            if (failed.length > 0) {
              status = "Failed"
              errorDetails = failed.map((f) => `${f.message}: ${f.expected} vs ${f.actual}`).join("; ")
              actualResult = errorDetails
              break // Assertion failure - do NOT retry
            }
          }

          status = "Passed"
          if (stepToExecute.actionMetadata?.healed) {
            status = "SelfHealed"
            const confidence = stepToExecute.actionMetadata.confidence || 100
            const healMsg = `HEALED: Primary locator failed. Strategy: ${stepToExecute.actionMetadata.healingMethod || "fallback_locator"}, New: ${stepToExecute.actionMetadata.newLocator}, Confidence: ${confidence}%`
            logs.push({
              source: "playwright",
              level: "Warning",
              message: healMsg,
              timestamp: new Date().toISOString()
            })
            actualResult = healMsg
            console.log(`[runner.ts] ${healMsg}`)
          } else {
            actualResult = "Step completed successfully"
          }

          // Push healing attempts/resolution log if any
          if (stepToExecute.actionMetadata?.healingLogs) {
            for (const logMsg of stepToExecute.actionMetadata.healingLogs) {
              logs.push({
                source: "playwright",
                level: stepToExecute.actionMetadata.healed ? "Warning" : "Error",
                message: logMsg,
                timestamp: new Date().toISOString()
              })
            }
          }
          break // Success - break retry loop
        } catch (error: any) {
          attempts++
          const errorMessage = error.message || ""
          const isTransient = errorMessage.includes("timeout") || 
                              errorMessage.includes("locator") || 
                              errorMessage.includes("waiting") || 
                              errorMessage.includes("element")

          if (attempts < maxAttempts && isTransient) {
            console.log(`[runner.ts] Transient error on step ${step.stepNumber}. Retrying (${attempts}/${maxAttempts - 1})...`)
            await publishTestRunEvent(testRunId, "test_run.retrying", {
              stepId: step.id,
              stepNumber: step.stepNumber,
              attempt: attempts,
              error: errorMessage,
            })
            if (page) await page.waitForTimeout(1000)
          } else {
            status = "Failed"
            errorDetails = `${errorMessage}. Suggestion: Manual re-recording of this step may be required.`
            actualResult = errorDetails || "Unknown error"
            
            // Push healing attempts/resolution log if any
            if (stepToExecute.actionMetadata?.healingLogs) {
              for (const logMsg of stepToExecute.actionMetadata.healingLogs) {
                logs.push({
                  source: "playwright",
                  level: "Error",
                  message: logMsg,
                  timestamp: new Date().toISOString()
                })
              }
            }
            break
          }
        }
      }

      // Screenshot after
      let screenshotAfterPath: string | null = null
      try {
        const screenshotAfter = page ? await page.screenshot({ type: "png", timeout: 5000 }) : null
        if (screenshotAfter) {
          screenshotAfterPath = await saveFile("screenshots", `step-${step.stepNumber}-after.png`, screenshotAfter)
        }
      } catch (e) {
        console.warn(`[runner.ts] Failed to capture screenshot after step ${step.stepNumber}:`, e instanceof Error ? e.message : e)
      }

      // DOM snapshot on failure
      let domSnapshotPath: string | null = null
      if (status === "Failed" && page) {
        try {
          const domHtml = await page.content()
          domSnapshotPath = await saveFile("dom_snapshots", `step-${step.stepNumber}-dom.html`, Buffer.from(domHtml))
          console.log(`[runner.ts] Saved DOM snapshot on failure to: ${domSnapshotPath}`)
          
          if (!stepToExecute.actionMetadata) {
            stepToExecute.actionMetadata = {}
          }
          stepToExecute.actionMetadata.domSnapshotPath = domSnapshotPath
          stepToExecute.actionMetadata.suggestManualRerecord = true
        } catch (e) {
          console.warn(`[runner.ts] Failed to capture DOM snapshot:`, e instanceof Error ? e.message : e)
        }
      }

      const stepDuration = Date.now() - stepStartTime

      await prisma.testStepResult.update({
        where: { id: stepResultId },
        data: {
          status: status as any,
          actualResult,
          screenshotBefore: screenshotBeforePath,
          screenshotAfter: screenshotAfterPath,
          errorDetails,
          durationMs: stepDuration,
          actionMetadata: stepToExecute.actionMetadata || null,
        },
      })

      // Save logs for this step
      const stepLogs = logs.splice(0)
      if (stepLogs.length > 0) {
        await prisma.log.createMany({
          data: stepLogs.map((log) => ({
            testRunId,
            testStepResultId: stepResultId,
            source: log.source,
            level: log.level,
            message: log.message,
            raw: log.raw,
            timestamp: new Date(log.timestamp),
          })),
        })
      }

      // Save network logs for this step
      const stepNetworkLogs = networkLogs.splice(0)
      if (stepNetworkLogs.length > 0) {
        await prisma.networkLog.createMany({
          data: stepNetworkLogs.map((nl) => ({
            testRunId,
            testStepResultId: stepResultId,
            url: nl.url,
            method: nl.method,
            status: nl.status || null,
            error: nl.error || null,
            resourceType: nl.resourceType || null,
            durationMs: nl.durationMs || 0,
            requestHeaders: nl.requestHeaders,
            responseHeaders: nl.responseHeaders,
            timestamp: new Date(nl.timestamp),
          })),
        })
      }

      if (status === "Failed") {
        hasFailed = true
        await publishTestRunEvent(testRunId, "test_run.step_failed", {
          stepId: step.id,
          stepNumber: step.stepNumber,
          status: "Failed",
          error: errorDetails,
          durationMs: stepDuration,
        })
        break
      } else {
        await publishTestRunEvent(testRunId, "test_run.step_completed", {
          stepId: step.id,
          stepNumber: step.stepNumber,
          status: "Passed",
          durationMs: stepDuration,
        })
      }
    }

    const totalDuration = Date.now() - startTime

    if (isCancelled) {
      await prisma.testRun.update({
        where: { id: testRunId },
        data: {
          status: "Cancelled",
          completedAt: new Date(),
          durationMs: totalDuration,
        },
      })
      await publishTestRunEvent(testRunId, "test_run.completed", { status: "Cancelled", durationMs: totalDuration })
    } else {
      const finalStatus = hasFailed ? "Failed" : "Passed"
      await prisma.testRun.update({
        where: { id: testRunId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          durationMs: totalDuration,
        },
      })
      await publishTestRunEvent(testRunId, "test_run.completed", { status: finalStatus, durationMs: totalDuration })
    }

    await notifyIntegrations(testRunId)
    if (decryptedPassword) {
      decryptedPassword = ""
    }
  } catch (error) {
    console.error("[runner.ts] Error during test run execution:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        status: "Failed",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    })
    await publishTestRunEvent(testRunId, "test_run.completed", { status: "Failed", error: message })
    await notifyIntegrations(testRunId)
  } finally {
    if (decryptedPassword) {
      decryptedPassword = ""
    }
    if (context) await context.close()
    if (browser) await browser.close()
  }
}
