/**
 * onTestRunCompleted
 *
 * Central hook called after every test run reaches a terminal status.
 * Handles:
 *   1. Auto-create bug report on failure (with duplicate prevention via BugOccurrence)
 *   2. Sync result to OpenProject (comment + status update on linked work package)
 *   3. If OpenProject bug sync is enabled and run failed, create/update bug WP in OpenProject
 *
 * This must NEVER block or throw — test run completion is always preserved.
 */

import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

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
            moduleRelation: { select: { name: true } },
            feature: { select: { name: true } },
            component: { select: { name: true } },
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

    // ── Load dedicated OpenProject integration ────────────────────────────────
    let opIntegration: any = null
    try {
      opIntegration = await prisma.openProjectIntegration.findUnique({
        where: { projectId: testRun.projectId },
      })
    } catch {
      // Model might not exist yet — graceful
    }

    // ── Step 1: Auto-create/update bug report if failed ───────────────────────
    let autoBugId: string | null = null
    const shouldCreateBug = opIntegration
      ? opIntegration.autoCreateBugOnFailure
      : true // Default behavior if no dedicated integration

    if (isFailed && testRun.testCaseId && shouldCreateBug) {
      autoBugId = await autoCreateOrUpdateBug(testRun)
    }

    // ── Step 2: Sync to OpenProject if configured ─────────────────────────────
    if (opIntegration?.apiTokenEncrypted) {
      let token = ""
      try {
        token = decryptSecret({
          encrypted: opIntegration.apiTokenEncrypted,
          iv: opIntegration.apiTokenIv,
          authTag: opIntegration.apiTokenAuthTag,
          keyVersion: opIntegration.apiTokenKeyVersion,
        })
      } catch {
        console.error("[onTestRunCompleted] Token decrypt failed")
        return
      }

      // Check if we should sync results
      if (opIntegration.autoSyncResults !== false) {
        const client = new OpenProjectClient(
          opIntegration.baseUrl,
          opIntegration.openProjectProjectIdentifier,
          token
        )

        // Sync result comment to linked test-case work package
        if (testRun.testCaseId) {
          await syncRunResultToOpenProject(testRun, client, opIntegration)
        }

        // If failed and bug sync enabled, sync bug to OpenProject
        if (isFailed && autoBugId && opIntegration.autoSyncBugToOpenProject) {
          await syncBugToOpenProject(autoBugId, testRun, client, opIntegration)
        }
      }
    } else {
      // Fallback to legacy IntegrationConfig for non-OpenProject providers
      // (This path is for Jira/Azure DevOps — handled by legacyNotify in notifier.ts)
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
        moduleId: tc.moduleId || null,
        featureId: tc.featureId || null,
        componentId: tc.componentId || null,
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
//  SYNC TEST RUN RESULT → OPENPROJECT (comment + status update)
// ─────────────────────────────────────────────────────────────────────────────
async function syncRunResultToOpenProject(
  testRun: any,
  client: OpenProjectClient,
  integration: any
): Promise<void> {
  try {
    // Look up mapping for this test case
    const mapping = await prisma.externalSyncMapping.findUnique({
      where: {
        provider_localEntityType_localEntityId: {
          provider: "OpenProject",
          localEntityType: "TestCase",
          localEntityId: testRun.testCaseId,
        },
      },
    })

    if (!mapping) {
      // If autoSyncTestCases is enabled, we could sync it first
      // But for safety, just skip — user should sync test cases explicitly
      console.log(`[op-sync] No mapping for test case ${testRun.testCaseId} — skipping result sync`)
      return
    }

    const wpId = mapping.externalId
    const statusIcon = testRun.status === "Passed" ? "✅" : testRun.status === "Failed" ? "❌" : "⚠️"

    // Build comment body
    let commentBody = `## ${statusIcon} Test Execution Result\n\n`
    commentBody += `**Result:** ${testRun.status}\n`
    commentBody += `**Run ID:** \`${testRun.id}\`\n`
    commentBody += `**Executed At:** ${testRun.completedAt ? new Date(testRun.completedAt).toLocaleString() : "N/A"}\n`
    commentBody += `**Duration:** ${((testRun.durationMs || 0) / 1000).toFixed(2)}s\n`
    commentBody += `**Environment:** ${testRun.project?.environment || "N/A"}\n`
    commentBody += `**Browser:** ${testRun.browserType}\n`
    commentBody += `**Report:** [View Report](${APP_URL}/projects/${testRun.projectId}/test-runs/${testRun.id}/report)\n\n`

    // Steps summary
    const passedSteps = (testRun.stepResults || []).filter((s: any) => s.status === "Passed").length
    const failedSteps = (testRun.stepResults || []).filter((s: any) => s.status === "Failed").length
    commentBody += `### Summary\n- Steps Passed: ${passedSteps}\n- Steps Failed: ${failedSteps}\n\n`

    // Failed steps detail
    const failedStep = testRun.stepResults.find((s: any) => s.status === "Failed")
    if (failedStep) {
      commentBody += `### Failed Step\nStep ${failedStep.stepNumber}: ${failedStep.actionDescription}\n\n`
      commentBody += `**Expected:** ${failedStep.expectedResult || "N/A"}\n`
      commentBody += `**Actual:** ${failedStep.actualResult || failedStep.errorDetails || "N/A"}\n\n`
    }

    commentBody += `*Synced from AI Manual QA Tester*`

    // POST comment to work package
    const commentOk = await client.addWorkPackageComment(wpId, commentBody)

    if (commentOk) {
      console.log(`[op-sync] Commented on WP #${wpId} for run ${testRun.id}`)
    } else {
      console.error(`[op-sync] Comment failed on WP #${wpId}`)
    }

    // Update status if mapped
    const statusMap: Record<string, string | null> = {
      Passed: integration.passedStatusId,
      Failed: integration.failedStatusId,
      Blocked: integration.blockedStatusId,
      Running: integration.runningStatusId,
      Error: integration.failedStatusId, // Map Error to Failed status
    }
    const mappedStatusId = statusMap[testRun.status]

    if (mappedStatusId) {
      try {
        const wp = await client.getWorkPackage(wpId)
        await client.updateWorkPackage(
          wpId,
          { _links: { status: { href: client.statusHref(mappedStatusId) } } },
          wp.lockVersion
        )
        console.log(`[op-sync] Status updated on WP #${wpId} to ${mappedStatusId}`)
      } catch (statusErr: any) {
        // Status update failed but comment was posted — don't fail the whole sync
        console.warn(`[op-sync] Status update failed on WP #${wpId}: ${statusErr.message}`)
      }
    }

    // Update sync mapping timestamp
    await prisma.externalSyncMapping.update({
      where: { id: mapping.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: commentOk ? "success" : "failed",
        lastSyncError: commentOk ? null : "Comment post failed",
      },
    })
  } catch (err) {
    console.error("[op-sync] syncRunResultToOpenProject error:", err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SYNC BUG REPORT → OPENPROJECT (create/update work package for the bug)
// ─────────────────────────────────────────────────────────────────────────────
async function syncBugToOpenProject(
  bugId: string,
  testRun: any,
  client: OpenProjectClient,
  integration: any
): Promise<void> {
  try {
    const bug = await prisma.bugReport.findUnique({
      where: { id: bugId },
      include: { testCase: true },
    })
    if (!bug) return

    // Check if bug already has an OpenProject mapping
    const existing = await prisma.externalSyncMapping.findUnique({
      where: {
        provider_localEntityType_localEntityId: {
          provider: "OpenProject",
          localEntityType: "BugReport",
          localEntityId: bugId,
        },
      },
    })

    if (existing) {
      // Already synced — just add a comment about the new occurrence
      await client.addWorkPackageComment(
        existing.externalId,
        `## 🔁 Failure Recurrence\n\nRun ID: \`${testRun.id}\` — **${testRun.status}** at ${new Date().toLocaleString()}\n\n[View Run](${APP_URL}/projects/${testRun.projectId}/test-runs/${testRun.id}/report)`
      )
      return
    }

    // Build bug work package description
    const tc = bug.testCase
    let description = `## Auto-Created Bug from Failed Test\n\n`
    description += `**Bug ID:** \`${bug.bugKey}\`\n`
    description += `**Test Case:** ${tc?.title || "N/A"}\n`
    description += `**Test Run:** \`${testRun.id}\`\n`
    description += `**Failure Status:** ${testRun.status}\n`
    description += `**Severity:** ${bug.severity}\n`
    description += `**Environment:** ${testRun.project?.environment || "N/A"}\n`
    description += `**Browser:** ${testRun.browserType}\n\n`
    description += `## Steps to Reproduce\n${bug.stepsToReproduce}\n\n`
    description += `## Expected Result\n${bug.expectedResult}\n\n`
    description += `## Actual Result\n${bug.actualResult}\n\n`
    description += `[View Report](${APP_URL}/projects/${testRun.projectId}/test-runs/${testRun.id}/report)\n\n`
    description += `*Created automatically by AI Manual QA Tester*\n\n`
    description += `<!-- AI-Manual-QA-Tester:BugReport:${bug.id} -->`

    // Build _links
    const links: Record<string, { href: string }> = {}
    if (integration.bugTypeId) {
      links.type = { href: client.typeHref(integration.bugTypeId) }
    }

    const wp = await client.createWorkPackage({
      subject: `[BUG] ${bug.title}`,
      description: { format: "markdown", raw: description },
      _links: links,
    })

    const wpUrl = client.workPackageUrl(wp.id)

    // Save mapping
    await prisma.externalSyncMapping.create({
      data: {
        projectId: testRun.projectId,
        provider: "OpenProject",
        localEntityType: "BugReport",
        localEntityId: bugId,
        externalId: String(wp.id),
        externalUrl: wpUrl,
        externalType: "Bug",
        lastSyncedAt: new Date(),
        lastSyncStatus: "success",
      },
    })

    console.log(`[op-sync] Bug WP #${wp.id} created for bug ${bug.bugKey}`)
  } catch (err) {
    console.error("[op-sync] syncBugToOpenProject error:", err)
  }
}
