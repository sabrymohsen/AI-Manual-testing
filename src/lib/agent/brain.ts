import { prisma } from "@/lib/db"
import { chromium, Browser } from "playwright"
import { QAAgentRunStatus, QAAgentMode } from "@prisma/client"
import { scanPage } from "./scanner"
import { generateTestPlan } from "./planner"
import { executeQAAgentPlan } from "./executor"
import { generateQAAgentMarkdown } from "./reporter"
import { isQAAgentCancelSignalSet } from "@/lib/queue"

export async function assertAgentRunNotCancelled(agentRunId: string, browser?: Browser) {
  const isCancelledInRedis = await isQAAgentCancelSignalSet(agentRunId)
  const currentRun = await prisma.qAAgentRun.findUnique({
    where: { id: agentRunId },
    select: { status: true }
  })
  if (isCancelledInRedis || currentRun?.status === QAAgentRunStatus.Cancelled) {
    if (browser) {
      await browser.close().catch(() => {})
    }
    throw new Error("CANCELLED")
  }
}

export async function updateRunProgress(
  runId: string,
  phase: string,
  status: QAAgentRunStatus | null,
  stepStatus: "Pending" | "Running" | "Completed" | "Failed" | "Skipped" | "Cancelled",
  message: string,
  details?: any,
  error?: string
) {
  const now = new Date()
  
  // Update QAAgentRun fields
  await prisma.qAAgentRun.update({
    where: { id: runId },
    data: {
      ...(status ? { status } : {}),
      currentPhase: phase,
      currentMessage: message,
      lastHeartbeatAt: now
    }
  })

  // Map phase name to stepNumber for steps rendering order
  const phaseOrder: Record<string, number> = {
    "Queued": 1,
    "WorkerStarted": 2,
    "LaunchingBrowser": 3,
    "OpeningTargetUrl": 4,
    "ScanningPage": 5,
    "PlanningTests": 6,
    "WaitingForApproval": 7,
    "ExecutingTests": 8,
    "GeneratingReport": 9,
    "Completed": 10,
    "Failed": 10,
    "Cancelled": 10
  }
  const stepNumber = phaseOrder[phase] || 99

  // Check if step exists
  const existingStep = await prisma.qAAgentRunStep.findFirst({
    where: { agentRunId: runId, name: phase }
  })

  if (existingStep) {
    await prisma.qAAgentRunStep.update({
      where: { id: existingStep.id },
      data: {
        status: stepStatus,
        details: details ? (details as any) : undefined,
        error: error || null,
        completedAt: (stepStatus === "Completed" || stepStatus === "Failed" || stepStatus === "Cancelled") ? now : undefined,
        updatedAt: now
      }
    })
  } else {
    await prisma.qAAgentRunStep.create({
      data: {
        agentRunId: runId,
        stepNumber,
        name: phase,
        type: phase,
        status: stepStatus,
        startedAt: now,
        completedAt: (stepStatus === "Completed" || stepStatus === "Failed" || stepStatus === "Cancelled") ? now : undefined,
        details: details ? (details as any) : undefined,
        error: error || null
      }
    })
  }
}

export async function runQAAgentPipeline(runId: string) {
  console.log(`[QAAgentBrain] Launching pipeline orchestrator for run: ${runId}`)
  const startTime = Date.now()

  // Fetch QAAgentRun details
  const run = await prisma.qAAgentRun.findUnique({
    where: { id: runId },
    include: { project: true }
  })

  if (!run) {
    throw new Error(`QAAgentRun ${runId} not found`)
  }

  // 1. Set up heartbeat timer every 5 seconds
  const heartbeatTimer = setInterval(async () => {
    try {
      const current = await prisma.qAAgentRun.findUnique({
        where: { id: runId },
        select: { status: true }
      })
      if (!current || ["Completed", "Failed", "Cancelled"].includes(current.status)) {
        clearInterval(heartbeatTimer)
        return
      }
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: { lastHeartbeatAt: new Date() }
      })
    } catch (err) {
      console.error("[QAAgentBrain] Heartbeat error:", err)
    }
  }, 5000)

  let browser: any = null

  // Configurable total timeout (default 10 minutes)
  const scopeData = run.scope as any
  const totalTimeoutMinutes = scopeData?.maxTime || scopeData?.totalTimeoutMinutes || 10
  const totalTimeoutMs = totalTimeoutMinutes * 60 * 1000

  // We wrap the main logic in a promise to allow race-timeout
  const runPromise = async () => {
    // A. Initialize future pipeline phases to Pending in the DB (for a clean visual timeline)
    const initialPhases = [
      { name: "WorkerStarted", stepNumber: 2 },
      { name: "LaunchingBrowser", stepNumber: 3 },
      { name: "OpeningTargetUrl", stepNumber: 4 },
      { name: "ScanningPage", stepNumber: 5 },
      { name: "PlanningTests", stepNumber: 6 },
      { name: "WaitingForApproval", stepNumber: 7 },
      { name: "ExecutingTests", stepNumber: 8 },
      { name: "GeneratingReport", stepNumber: 9 }
    ]
    for (const p of initialPhases) {
      const existing = await prisma.qAAgentRunStep.findFirst({
        where: { agentRunId: runId, name: p.name }
      })
      if (!existing) {
        await prisma.qAAgentRunStep.create({
          data: {
            agentRunId: runId,
            stepNumber: p.stepNumber,
            name: p.name,
            type: p.name,
            status: "Pending"
          }
        })
      }
    }

    // B. Worker Started phase
    await updateRunProgress(
      runId,
      "WorkerStarted",
      QAAgentRunStatus.Scanning,
      "Completed",
      "Worker picked the agent run. Starting browser..."
    )

    // C. Launching Browser phase
    await assertAgentRunNotCancelled(runId)
    await updateRunProgress(
      runId,
      "LaunchingBrowser",
      null,
      "Running",
      "Starting Playwright browser context..."
    )

    try {
      browser = await chromium.launch({ headless: true, timeout: 60000 })
    } catch (err: any) {
      throw new Error(`Browser launch timeout after 60 seconds: ${err.message}`)
    }

    await updateRunProgress(
      runId,
      "LaunchingBrowser",
      null,
      "Completed",
      "Browser launched successfully. Opening target URL..."
    )

    // D. Opening Target URL phase
    await assertAgentRunNotCancelled(runId, browser)
    const targetUrl = run.project.webAppUrl
    await updateRunProgress(
      runId,
      "OpeningTargetUrl",
      null,
      "Running",
      `Loading target URL: ${targetUrl}...`
    )

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    })
    const page = await context.newPage()

    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 })
      await page.waitForTimeout(1000)
    } catch (err: any) {
      throw new Error(`Target URL did not load within 45 seconds: ${err.message}`)
    }

    await updateRunProgress(
      runId,
      "OpeningTargetUrl",
      null,
      "Completed",
      "Target URL loaded. Scanning page elements..."
    )

    // E. Scanning Page phase
    await assertAgentRunNotCancelled(runId, browser)
    await updateRunProgress(
      runId,
      "ScanningPage",
      null,
      "Running",
      "Scanning page DOM and identifying elements..."
    )

    // Scanning timeout: 60s
    const scanResult = await Promise.race([
      scanPage(page, targetUrl),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Scanning timeout after 60 seconds.")), 60000))
    ])

    await updateRunProgress(
      runId,
      "ScanningPage",
      null,
      "Completed",
      `Page scanning completed successfully. Detected: ${scanResult.inputs.length} inputs, ${scanResult.buttons.length} buttons.`,
      { detectedInputs: scanResult.inputs.length, detectedButtons: scanResult.buttons.length }
    )

    // Save scan output
    await prisma.qAAgentRun.update({
      where: { id: runId },
      data: { scannerResult: scanResult as any }
    })

    await browser.close()
    browser = null

    // F. Planning Tests phase
    await assertAgentRunNotCancelled(runId)
    await updateRunProgress(
      runId,
      "PlanningTests",
      QAAgentRunStatus.Planning,
      "Running",
      "Generating test scenario plans..."
    )

    // Planning timeout: 30s
    const planResult = await Promise.race([
      Promise.resolve(generateTestPlan([scanResult])),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Planning timeout after 30 seconds.")), 30000))
    ])

    await updateRunProgress(
      runId,
      "PlanningTests",
      null,
      "Completed",
      `Test scenario plan generated. Planned ${planResult.tests.length} tests.`,
      { scenariosCount: planResult.tests.length }
    )

    // Save plan
    await prisma.qAAgentRun.update({
      where: { id: runId },
      data: { plan: planResult as any }
    })

    // G. Semi-Autonomous wait for approval
    if (run.mode === QAAgentMode.SemiAutonomous) {
      await updateRunProgress(
        runId,
        "WaitingForApproval",
        QAAgentRunStatus.WaitingForApproval,
        "Completed",
        "Waiting for user review and approval of the generated plan."
      )
      return
    }

    // H. Executing Tests phase
    await runQAAgentExecutionPipeline(runId)
  }

  // Promise.race between the run promise and the global run timeout
  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error(`Total run timeout after ${totalTimeoutMinutes} minutes.`)), totalTimeoutMs)
  )

  try {
    await Promise.race([runPromise(), timeoutPromise])
  } catch (err: any) {
    if (browser) {
      await browser.close().catch(() => {})
    }

    if (err.message === "CANCELLED") {
      console.warn(`[QAAgentBrain] Run ${runId} was cancelled successfully.`)
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: QAAgentRunStatus.Cancelled,
          completedAt: new Date(),
          currentPhase: "Cancelled",
          currentMessage: "Agent run was cancelled by the user."
        }
      })
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: { in: ["Pending", "Running"] } },
        data: { status: "Cancelled", completedAt: new Date() }
      })
    } else {
      console.error(`[QAAgentBrain] Pipeline error for run ${runId}:`, err)
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: QAAgentRunStatus.Failed,
          completedAt: new Date(),
          currentPhase: "Failed",
          currentMessage: `Agent run failed: ${err.message}`,
          failedReason: err.message,
          failedAt: new Date(),
          errorStack: err.stack || null
        }
      })
      // Mark current running steps as Failed, pending steps as Skipped
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: "Running" },
        data: { status: "Failed", error: err.message, completedAt: new Date() }
      })
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: "Pending" },
        data: { status: "Skipped", completedAt: new Date() }
      })

      // Add finding
      await prisma.qAAgentFinding.create({
        data: {
          agentRunId: runId,
          type: "Risk",
          severity: "High",
          title: "Agent execution failed",
          description: err.message,
          evidence: { error: err.message, stack: err.stack }
        }
      })
      throw err
    }
  } finally {
    clearInterval(heartbeatTimer)
  }
}

export async function runQAAgentExecutionPipeline(runId: string) {
  const startTime = Date.now()
  const run = await prisma.qAAgentRun.findUnique({
    where: { id: runId }
  })
  if (!run) throw new Error("QAAgentRun not found")

  try {
    console.log("[QAAgentBrain] Starting Phase: Running execution")
    await assertAgentRunNotCancelled(runId)
    await updateRunProgress(
      runId,
      "ExecutingTests",
      QAAgentRunStatus.Running,
      "Running",
      "Executing planned test scenarios..."
    )

    const executorOptions = {
      agentRunId: runId,
      projectId: run.projectId,
      safetyLevel: run.safetyLevel
    }

    const { success, errorCount } = await executeQAAgentPlan(run.plan as any, executorOptions)

    await assertAgentRunNotCancelled(runId)
    
    await updateRunProgress(
      runId,
      "ExecutingTests",
      null,
      "Completed",
      `Executed planned test scenarios. Success: ${success}. Errors: ${errorCount}.`
    )

    // Phase 5: Reporting
    console.log("[QAAgentBrain] Starting Phase: Reporting summaries")
    await updateRunProgress(
      runId,
      "GeneratingReport",
      QAAgentRunStatus.Reporting,
      "Running",
      "Generating report summaries and exporting files..."
    )

    const markdownSummary = await generateQAAgentMarkdown(runId)
    const duration = Date.now() - (run.startedAt ? run.startedAt.getTime() : startTime)

    await updateRunProgress(
      runId,
      "GeneratingReport",
      null,
      "Completed",
      "Report generated successfully."
    )

    // Complete the run
    await prisma.qAAgentRun.update({
      where: { id: runId },
      data: {
        status: QAAgentRunStatus.Completed,
        completedAt: new Date(),
        durationMs: duration,
        currentPhase: "Completed",
        currentMessage: "QA Agent run completed successfully.",
        summary: {
          success,
          errorCount,
          markdownSummary
        }
      }
    })
    
    // Set Completed step
    await prisma.qAAgentRunStep.create({
      data: {
        agentRunId: runId,
        stepNumber: 10,
        name: "Completed",
        type: "Completed",
        status: "Completed",
        startedAt: new Date(),
        completedAt: new Date()
      }
    })

    console.log(`[QAAgentBrain] Run ${runId} finished successfully.`)

  } catch (err: any) {
    if (err.message === "CANCELLED") {
      console.warn(`[QAAgentBrain] Execution run ${runId} was aborted by cancellation.`)
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: QAAgentRunStatus.Cancelled,
          completedAt: new Date(),
          currentPhase: "Cancelled",
          currentMessage: "Agent run execution cancelled by user."
        }
      })
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: { in: ["Pending", "Running"] } },
        data: { status: "Cancelled", completedAt: new Date() }
      })
    } else {
      console.error(`[QAAgentBrain] Execution error for run ${runId}:`, err)
      await prisma.qAAgentRun.update({
        where: { id: runId },
        data: {
          status: QAAgentRunStatus.Failed,
          completedAt: new Date(),
          currentPhase: "Failed",
          currentMessage: `Agent execution failed: ${err.message}`,
          failedReason: err.message,
          failedAt: new Date(),
          errorStack: err.stack || null
        }
      })
      // Mark current running steps as Failed, pending steps as Skipped
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: "Running" },
        data: { status: "Failed", error: err.message, completedAt: new Date() }
      })
      await prisma.qAAgentRunStep.updateMany({
        where: { agentRunId: runId, status: "Pending" },
        data: { status: "Skipped", completedAt: new Date() }
      })

      // Add finding
      await prisma.qAAgentFinding.create({
        data: {
          agentRunId: runId,
          type: "Risk",
          severity: "High",
          title: "Agent execution failed",
          description: err.message,
          evidence: { error: err.message, stack: err.stack }
        }
      })
      throw err
    }
  }
}
