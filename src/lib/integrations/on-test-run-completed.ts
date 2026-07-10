/**
 * onTestRunCompleted
 *
 * Central hook called after every test run reaches a terminal status.
 * Handles (provider-agnostic — OpenProject / Jira / Azure DevOps / ClickUp):
 *   1. Auto-create bug report on failure (with duplicate prevention via BugOccurrence)
 *   2. Sync result to the connected tracker (comment + status on the linked test-case item)
 *   3. If bug sync is enabled and the run failed, create/update the bug in the tracker
 *
 * This must NEVER block or throw — test run completion is always preserved.
 */

import { prisma } from "@/lib/db"
import { loadIntegration, type LoadedIntegration } from "@/lib/integrations/core/load-integration"
import { syncBugReport } from "@/lib/integrations/core/sync-bug-report"
import type { WorkItemProvider } from "@/lib/integrations/core/provider"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

// ─── Auto-generate a sequential bug key ──────────────────────────────────────
async function nextBugKey(projectId: string): Promise<string> {
  const count = await prisma.bugReport.count({ where: { projectId } })
  return `BUG-${String(count + 1).padStart(4, "0")}`
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN HOOK
// ─────────────────────────────────────────────────────────────────────────────
export async function onTestRunCompleted(testRunId: string): Promise<void> {
  try {
    // ── Load full test run data ───────────────────────────────────────────────
    const testRun = await prisma.testRun.findUnique({
      where: { id: testRunId },
      include: {
        project: { include: { integrationConfig: true } },
        testCase: {
          include: {
            steps: { orderBy: { stepNumber: "asc" } },
          },
        },
        stepResults: { orderBy: { stepNumber: "asc" } },
      },
    })

    if (!testRun || !testRun.project) {
      console.warn(`[onTestRunCompleted] Run ${testRunId} not found`)
      return
    }

    const isFailed = testRun.status === "Failed"

    // ── Load the connected integration (unified, or legacy OpenProject) ───────
    let loaded: LoadedIntegration | null = null
    try {
      loaded = await loadIntegration(testRun.projectId)
    } catch {
      // Model might not exist yet — graceful
    }

    // ── Step 1: Auto-create/update bug report if failed ───────────────────────
    let autoBugId: string | null = null
    const shouldCreateBug = loaded ? loaded.autoCreateBugOnFailure : true

    if (isFailed && testRun.testCaseId && shouldCreateBug) {
      autoBugId = await autoCreateOrUpdateBug(testRun)
    }

    // ── Step 2: Sync to the connected tracker if configured ───────────────────
    if (loaded && loaded.autoSyncResults) {
      const provider = loaded.getClient()

      // Sync result comment + status to the linked test-case item
      if (testRun.testCaseId) {
        await syncRunResult(testRun, provider, loaded)
      }

      // If failed and bug sync enabled, sync the bug to the tracker via the
      // provider-agnostic engine (handles create/update + attachments + board).
      if (isFailed && autoBugId && loaded.autoSyncBugToTracker) {
        try {
          await syncBugReport(autoBugId, { requireAutoFlag: true })
        } catch (err: any) {
          console.error("[onTestRunCompleted] bug sync failed:", err?.message)
        }
      }
    }
  } catch (err) {
    // Never block test run completion
    console.error("[onTestRunCompleted] Unexpected error:", err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  AUTO-CREATE OR UPDATE BUG REPORT (idempotent)
// ─────────────────────────────────────────────────────────────────────────────
async function autoCreateOrUpdateBug(testRun: any): Promise<string | null> {
  try {
    const tc = testRun.testCase
    if (!tc) return null

    // Find the first failed step
    const failedStep = testRun.stepResults.find(
      (s: any) => s.status === "Failed" || s.status === "Blocked"
    )
    const failedStepNumber = failedStep?.stepNumber ?? null
    const errorMessage = failedStep?.errorDetails || failedStep?.actualResult || "Test run failed"

    // ── Duplicate check: same testCase + same failed step + open bug ──────────
    const existingBug = await prisma.bugReport.findFirst({
      where: {
        projectId: testRun.projectId,
        testCaseId: testRun.testCaseId,
        status: { notIn: ["Closed", "Resolved", "Rejected"] },
        // Match on stepsToReproduce containing the failed step number
        ...(failedStepNumber
          ? { stepsToReproduce: { contains: `Step ${failedStepNumber}:` } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    })

    if (existingBug) {
      // Add new occurrence instead of creating duplicate
      await prisma.bugOccurrence.create({
        data: {
          bugReportId: existingBug.id,
          testRunId: testRun.id,
          evidence: {
            screenshot: failedStep?.screenshotAfter || null,
            errorDetails: errorMessage,
            runStatus: testRun.status,
          },
        },
      })
      // Update the bug to point to the latest run
      await prisma.bugReport.update({
        where: { id: existingBug.id },
        data: { testRunId: testRun.id, updatedAt: new Date() },
      })
      console.log(`[bug-auto] Duplicate prevented — added occurrence to bug ${existingBug.bugKey}`)
      return existingBug.id
    }

    // ── Build steps to reproduce from step results ────────────────────────────
    let stepsToReproduce = ""
    for (const sr of testRun.stepResults) {
      stepsToReproduce += `Step ${sr.stepNumber}: ${sr.actionDescription}\n`
      if (sr.status === "Failed" && sr.errorDetails) {
        stepsToReproduce += `  → Error: ${sr.errorDetails}\n`
      }
    }

    const bugKey = await nextBugKey(testRun.projectId)
    const title = `[Auto Bug] ${tc.title} failed${failedStepNumber ? ` at Step ${failedStepNumber}` : ""}`

    const newBug = await prisma.bugReport.create({
      data: {
        bugKey,
        title,
        projectId: testRun.projectId,
        testCaseId: testRun.testCaseId,
        testRunId: testRun.id,
        severity: tc.priority || "High",
        priority: tc.priority || "High",
        status: "Open",
        environment: testRun.project?.environment || null,
        browser: testRun.browserType || null,
        viewport: testRun.viewport || null,
        stepsToReproduce: stepsToReproduce || "Automated test run failed — see linked run for details",
        expectedResult: failedStep?.expectedResult || "Test case should pass all steps",
        actualResult: errorMessage,
        screenshotPath: failedStep?.screenshotAfter || null,
      },
    })

    console.log(`[bug-auto] Created bug ${newBug.bugKey} for run ${testRun.id}`)
    return newBug.id
  } catch (err) {
    console.error("[bug-auto] Failed to create bug:", err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SYNC TEST RUN RESULT → TRACKER (comment + status update, provider-agnostic)
// ─────────────────────────────────────────────────────────────────────────────
async function syncRunResult(
  testRun: any,
  provider: WorkItemProvider,
  loaded: LoadedIntegration
): Promise<void> {
  try {
    // Look up the mapping for this test case under the connected provider.
    const mapping = await prisma.externalSyncMapping.findUnique({
      where: {
        provider_localEntityType_localEntityId: {
          provider: loaded.provider as any,
          localEntityType: "TestCase",
          localEntityId: testRun.testCaseId,
        },
      },
    })

    if (!mapping) {
      console.log(`[result-sync] No mapping for test case ${testRun.testCaseId} — skipping result sync`)
      return
    }

    const externalId = mapping.externalId
    const statusIcon = testRun.status === "Passed" ? "✅" : testRun.status === "Failed" ? "❌" : "⚠️"

    let commentBody = `## ${statusIcon} Test Execution Result\n\n`
    commentBody += `**Result:** ${testRun.status}\n`
    commentBody += `**Run ID:** \`${testRun.id}\`\n`
    commentBody += `**Executed At:** ${testRun.completedAt ? new Date(testRun.completedAt).toLocaleString() : "N/A"}\n`
    commentBody += `**Duration:** ${((testRun.durationMs || 0) / 1000).toFixed(2)}s\n`
    commentBody += `**Environment:** ${testRun.project?.environment || "N/A"}\n`
    commentBody += `**Browser:** ${testRun.browserType}\n`
    commentBody += `**Report:** [View Report](${APP_URL}/projects/${testRun.projectId}/test-runs/${testRun.id}/report)\n\n`

    const passedSteps = (testRun.stepResults || []).filter((s: any) => s.status === "Passed").length
    const failedSteps = (testRun.stepResults || []).filter((s: any) => s.status === "Failed").length
    commentBody += `### Summary\n- Steps Passed: ${passedSteps}\n- Steps Failed: ${failedSteps}\n\n`

    const failedStep = testRun.stepResults.find((s: any) => s.status === "Failed")
    if (failedStep) {
      commentBody += `### Failed Step\nStep ${failedStep.stepNumber}: ${failedStep.actionDescription}\n\n`
      commentBody += `**Expected:** ${failedStep.expectedResult || "N/A"}\n`
      commentBody += `**Actual:** ${failedStep.actualResult || failedStep.errorDetails || "N/A"}\n\n`
    }
    commentBody += `*Synced from QA Engine*`

    let commentOk = false
    try {
      commentOk = await provider.addComment(externalId, commentBody)
    } catch (err: any) {
      console.error(`[result-sync] Comment failed on ${externalId}: ${err?.message}`)
    }

    // Update status if mapped for this run status.
    const sm = loaded.statusMapping
    const statusMap: Record<string, string | null | undefined> = {
      Passed: sm.passed,
      Failed: sm.failed,
      Blocked: sm.blocked,
      Running: sm.running,
      Error: sm.failed, // Map Error to Failed status
    }
    const mappedStatusId = statusMap[testRun.status]
    if (mappedStatusId) {
      try {
        await provider.updateWorkItem(externalId, { statusId: mappedStatusId })
      } catch (statusErr: any) {
        console.warn(`[result-sync] Status update failed on ${externalId}: ${statusErr.message}`)
      }
    }

    await prisma.externalSyncMapping.update({
      where: { id: mapping.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: commentOk ? "success" : "failed",
        lastSyncError: commentOk ? null : "Comment post failed",
      },
    })
  } catch (err) {
    console.error("[result-sync] syncRunResult error:", err)
  }
}
