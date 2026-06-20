import { prisma } from "@/lib/db"
import { chromium, Page, Browser, BrowserContext } from "playwright"
import { QAAgentSafetyLevel, QAAgentFindingType, Priority } from "@prisma/client"
import {
  resolveLocatorFromMemory,
  recordSuccessfulLocator,
  recordFailedLocator
} from "./memory"
import { executeStep } from "../playwright/step-executor"
import { decryptSecret } from "../crypto"
import { handleLogin } from "../playwright/login-handler"
import { saveFile } from "../storage"
import { checkActionSafety } from "./safety"
import { QAAgentPlan, QAAgentTest, QAAgentStep } from "./planner"
import { publishAgentBrainEvent, isQAAgentCancelSignalSet } from "../queue"

export interface ExecutorOptions {
  agentRunId: string
  projectId: string
  safetyLevel: QAAgentSafetyLevel
}

export async function executeQAAgentPlan(
  plan: QAAgentPlan,
  options: ExecutorOptions
): Promise<{ success: boolean; errorCount: number }> {
  const { agentRunId, projectId, safetyLevel } = options
  console.log(`[QAAgentExecutor] Starting execution for run: ${agentRunId}`)

  // Get project config for URL and credentials
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { credentials: true }
  })

  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null
  let stepCounter = 0
  let errorCount = 0

  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    })
    page = await context.newPage()

    for (const test of plan.tests) {
      console.log(`[QAAgentExecutor] Running test case: ${test.name}`)
      
      // Check cancellation signal
      await assertAgentRunNotCancelled(agentRunId, browser)

      // Resolve login credential if needed for Authentication module
      if (test.module === "Authentication" && project.credentials.length > 0) {
        const cred = project.credentials[0]
        const password = decryptSecret({
          encrypted: cred.encryptedPassword,
          iv: cred.encryptionIv,
          authTag: cred.encryptionAuthTag,
          keyVersion: cred.keyVersion,
        })
        const loginUrl = cred.loginUrl || project.webAppUrl
        try {
          await handleLogin(page, { url: loginUrl, username: cred.username, password })
        } catch (e: any) {
          console.warn("[QAAgentExecutor] Credentials login handler failed:", e.message)
        }
      } else {
        try {
          await page.goto(project.webAppUrl, { waitUntil: "domcontentloaded", timeout: 45000 })
          await page.waitForTimeout(1000)
        } catch (err: any) {
          throw new Error(`Target URL did not load within 45 seconds: ${err.message}`)
        }
      }

      for (const step of test.steps) {
        stepCounter++
        console.log(`[QAAgentExecutor] Step ${stepCounter}: ${step.action} - ${step.target}`)

        // Check cancellation signal
        await assertAgentRunNotCancelled(agentRunId, browser)

        const stepRecord = await prisma.qAAgentRunStep.create({
          data: {
            agentRunId,
            stepNumber: stepCounter,
            name: `${step.action} on ${step.target}`,
            type: step.action,
            status: "Running",
            startedAt: new Date()
          }
        })

        // A. Safety Check
        const safetyResult = checkActionSafety(
          step.action,
          `${step.action} on ${step.target}`,
          step.targetValue || null,
          step.value || null,
          safetyLevel
        )

        if (!safetyResult.isAllowed) {
          console.warn(`[QAAgentExecutor] Safety block triggered: ${safetyResult.reason}`)
          
          await prisma.qAAgentRunStep.update({
            where: { id: stepRecord.id },
            data: {
              status: "Skipped",
              error: safetyResult.reason,
              details: { blockedBySafety: true, reason: safetyResult.reason },
              completedAt: new Date()
            }
          })

          if (safetyResult.finding) {
            await prisma.qAAgentFinding.create({
              data: {
                agentRunId,
                type: QAAgentFindingType.Risk,
                severity: Priority.High,
                title: safetyResult.finding.title,
                description: safetyResult.finding.description,
                evidence: { action: step.action, target: step.target }
              }
            })
          }
          continue
        }

        // B. Resolve Locator Memory
        let targetValueToUse = step.targetValue || null
        let targetTypeToUse = step.targetType || "css"
        
        if (targetValueToUse) {
          const memoryRes = await resolveLocatorFromMemory(projectId, targetValueToUse)
          if (memoryRes.resolved) {
            targetValueToUse = memoryRes.resolved
            targetTypeToUse = "css"
          }
        }

        // C. Execute step
        let finalStatus = "Passed"
        let executionError: string | null = null
        let healingLogsText: string | null = null

        try {
          const stepPayload = {
            actionType: step.action,
            targetType: targetTypeToUse,
            targetValue: targetValueToUse,
            inputValue: step.value || "",
            timeoutMs: 30000,
            executionMode: "SelfHealing"
          }

          await executeStep(page, stepPayload as any)

          // Check if self-healing was triggered during execution
          if (stepPayload.executionMode === "SelfHealing" && (stepPayload as any).actionMetadata?.healingLogs) {
            const hLogs = (stepPayload as any).actionMetadata.healingLogs
            healingLogsText = Array.isArray(hLogs) ? hLogs.join("\n") : String(hLogs)
            finalStatus = "SelfHealed"
            
            // Record self-healed selector
            const healedSelector = (stepPayload as any).actionMetadata.healedLocator
            if (step.targetValue && healedSelector) {
              await recordSuccessfulLocator(projectId, step.targetValue, healedSelector)
            }
            
            // Log a finding for self-healing
            await prisma.qAAgentFinding.create({
              data: {
                agentRunId,
                type: QAAgentFindingType.LocatorHealed,
                severity: Priority.Low,
                title: `Locator Healed: ${step.target}`,
                description: `Successfully recovered locator mismatch for '${step.target}' using fallback locator: '${healedSelector}'.`,
                evidence: { healingLogs: healingLogsText }
              }
            })
          } else {
            // Succeeded without healing
            if (step.targetValue && targetValueToUse) {
              await recordSuccessfulLocator(projectId, step.targetValue, targetValueToUse)
            }
          }

        } catch (err: any) {
          finalStatus = "Failed"
          executionError = err.message || "Execution timeout or element not interactable."
          errorCount++

          // Record failure in memory
          if (step.targetValue && targetValueToUse) {
            await recordFailedLocator(projectId, step.targetValue, targetValueToUse)
          }

          // Log finding for failure
          await prisma.qAAgentFinding.create({
            data: {
              agentRunId,
              type: QAAgentFindingType.TestFailure,
              severity: Priority.High,
              title: `Step Failure: ${test.name}`,
              description: `Execution failed at step: "${step.action} on ${step.target}". Reason: ${executionError}`,
              evidence: { step: step.action, target: step.target, error: executionError }
            }
          })
        }

        // Capture Evidence Screenshot
        let screenshotPath: string | null = null
        try {
          const scr = await page.screenshot({ type: "png", timeout: 4000 })
          screenshotPath = await saveFile("screenshots", `qa-agent-step-${stepCounter}.png`, scr)
        } catch {}

        // Update step run record
        await prisma.qAAgentRunStep.update({
          where: { id: stepRecord.id },
          data: {
            status: finalStatus,
            error: executionError,
            screenshotPath,
            details: {
              expected: step.expected,
              healingLogs: healingLogsText,
              resolvedSelector: targetValueToUse
            },
            completedAt: new Date()
          }
        })

        // If a test fails, abort the remaining steps in the current test scenario
        if (finalStatus === "Failed") {
          console.warn(`[QAAgentExecutor] Scenario failed at step ${stepCounter}, skipping remaining steps.`)
          break
        }
      }
    }
  } catch (err: any) {
    if (err.message === "CANCELLED") {
      console.warn("[QAAgentExecutor] Execution was aborted safely by cancellation request.")
    } else {
      console.error("[QAAgentExecutor] Runtime error:", err)
      throw err
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }

  return { success: errorCount === 0, errorCount }
}

async function assertAgentRunNotCancelled(agentRunId: string, browser?: Browser) {
  const isCancelledInRedis = await isQAAgentCancelSignalSet(agentRunId)
  const currentRun = await prisma.qAAgentRun.findUnique({
    where: { id: agentRunId },
    select: { status: true }
  })
  if (isCancelledInRedis || currentRun?.status === "Cancelled") {
    if (browser) {
      await browser.close().catch(() => {})
    }
    throw new Error("CANCELLED")
  }
}
