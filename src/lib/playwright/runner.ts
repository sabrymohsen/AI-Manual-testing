import { chromium, Browser, BrowserContext, Page } from "playwright"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { saveFile } from "@/lib/storage"
import { sanitizeUrl, sanitizeHeaders, sanitizeBody, sanitizeLogMessage } from "@/lib/sanitize"
import { executeStep } from "./step-executor"
import { runAssertions } from "./assertion-runner"
import { handleLogin } from "./login-handler"
import { notifyIntegrations } from "@/lib/integrations/notifier"

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
    },
  })

  if (!testRun?.testCase) {
    await prisma.testRun.update({
      where: { id: testRunId },
      data: { status: "Failed", completedAt: new Date() },
    })
    return
  }

  const startTime = Date.now()

  await prisma.testRun.update({
    where: { id: testRunId },
    data: { status: "Running", startedAt: new Date() },
  })

  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null

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
        requestHeaders: sanitizeHeaders(request.headers() as Record<string, string>),
      })
    })

    page.on("response", (response) => {
      const entry = networkLogs.find((l) => l.url === sanitizeUrl(response.url()) && !l.status)
      if (entry) {
        entry.status = response.status()
        entry.responseHeaders = sanitizeHeaders(response.headers() as Record<string, string>)
        entry.durationMs = 0
      }
    })

    page.on("requestfailed", (request) => {
      const entry = networkLogs.find((l) => l.url === sanitizeUrl(request.url()) && !l.error)
      if (entry) {
        entry.error = request.failure()?.errorText || "Request failed"
        entry.status = 0
      }
    })

    let decryptedPassword = ""

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
        await handleLogin(page, {
          url: loginUrl,
          username: testRun.credential.username,
          password: decryptedPassword,
        })
      }
    }

    let hasFailed = false

    // Execute steps
    for (const step of testRun.testCase.steps) {
      const stepStartTime = Date.now()

      // Find the existing step result created by the API route
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

      let actualResult = ""
      let status: string = "Passed"
      let errorDetails: string | null = null

      try {
        if (page) {
          let stepToExecute = step
          if (step.inputValue === "***MASKED***" && decryptedPassword) {
            stepToExecute = {
              ...step,
              inputValue: decryptedPassword,
            }
          }
          await executeStep(page, stepToExecute)
        }

        if (page && step.assertions) {
          const assertionResults = await runAssertions(page, step.assertions as any[])
          const failed = assertionResults.filter((r) => !r.passed)
          if (failed.length > 0) {
            status = "Failed"
            errorDetails = failed.map((f) => `${f.message}: ${f.expected} vs ${f.actual}`).join("; ")
          }
        }

        actualResult = "Step completed successfully"
      } catch (error) {
        status = "Failed"
        errorDetails = error instanceof Error ? error.message : "Unknown error"
        actualResult = errorDetails
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

      // Stop on failure
      if (status === "Failed") {
        hasFailed = true
        break
      }
    }

    const totalDuration = Date.now() - startTime
    await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        status: hasFailed ? "Failed" : "Passed",
        completedAt: new Date(),
        durationMs: totalDuration,
      },
    })
    await notifyIntegrations(testRunId)
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
    await notifyIntegrations(testRunId)
  } finally {
    if (context) await context.close()
    if (browser) await browser.close()
  }
}
