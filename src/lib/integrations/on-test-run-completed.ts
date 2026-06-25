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

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

// ─── Host helpers ─────────────────────────────────────────────────────────────
function normalizeOpHost(raw: string): string {
  const match = raw.trim().match(/^(https?:\/\/[^\/\?#]+)/)
  let host = match ? match[1] : raw.trim()
  host = host.replace(/\/$/, "")
  if (!host.startsWith("http")) host = `https://${host}`
  return host
}
function normalizeOpKey(raw: string): string {
  const m = raw.trim().match(/\/projects\/([^\/\?#]+)/)
  return m ? m[1] : raw.replace(/[\/\?#].*/g, "").trim()
}

// ─── Resolve type href from OpenProject project types list ────────────────────
async function resolveOpType(
  opHost: string,
  opKey: string,
  auth: string,
  preferBug: boolean
): Promise<string> {
  try {
    const res = await fetch(`${opHost}/api/v3/projects/${opKey}/types`, {
      headers: { Authorization: auth, Accept: "application/json" },
    })
    if (!res.ok) return "/api/v3/types/1"
    const data = await res.json()
    const types: Array<{ id: number; name: string }> = data?._embedded?.elements || []
    if (preferBug) {
      const bug = types.find(t => /bug|defect|خطأ|عيب/i.test(t.name))
      if (bug) return `/api/v3/types/${bug.id}`
    }
    const task = types.find(t => /task|test|مهمة/i.test(t.name))
    if (task) return `/api/v3/types/${task.id}`
    return types.length > 0 ? `/api/v3/types/${types[0].id}` : "/api/v3/types/1"
  } catch {
    return "/api/v3/types/1"
  }
}

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
    const config = testRun.project.integrationConfig

    // ── Step 1: Auto-create/update bug report if failed ───────────────────────
    let autoBugId: string | null = null
    if (isFailed && testRun.testCaseId) {
      autoBugId = await autoCreateOrUpdateBug(testRun)
    }

    // ── Step 2: Sync to OpenProject if configured ─────────────────────────────
    if (config && config.enabled && config.provider === "openproject" && config.encryptedToken) {
      let token = ""
      try {
        token = decryptSecret({
          encrypted: config.encryptedToken,
          iv: config.encryptionIv || "",
          authTag: config.encryptionAuthTag || "",
          keyVersion: config.keyVersion || "v1",
        })
      } catch {
        console.error("[onTestRunCompleted] Token decrypt failed")
        return
      }

      const triggerOn = config.triggerOn || "Failed"
      if (triggerOn === "Failed" && !isFailed) {
        // Only trigger on failures — skip
      } else {
        const opHost = normalizeOpHost(config.host || "")
        const opKey = normalizeOpKey(config.projectKey || "")
        const auth = `Basic ${Buffer.from(`apikey:${token.trim()}`).toString("base64")}`

        // Sync result comment to linked test-case work package
        if (testRun.testCaseId) {
          await syncRunResultToOpenProject(testRun, opHost, opKey, auth)
        }

        // If failed, sync bug to OpenProject as a separate work package
        if (isFailed && autoBugId) {
          await syncBugToOpenProject(autoBugId, testRun, opHost, opKey, auth)
        }
      }
    }
  } catch (err) {
    // Never block test run completion
    console.error("[onTestRunCompleted] Unexpected error:", err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  AUTO-CREATE OR UPDATE BUG REPORT
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
//  SYNC TEST RUN RESULT → OPENPROJECT (comment on linked work package)
// ─────────────────────────────────────────────────────────────────────────────
async function syncRunResultToOpenProject(
  testRun: any,
  opHost: string,
  opKey: string,
  auth: string
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
      // No mapping — test case was never synced to OpenProject, nothing to update
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
    commentBody += `**Duration:** ${(testRun.durationMs / 1000).toFixed(2)}s\n`
    commentBody += `**Environment:** ${testRun.project?.environment || "N/A"}\n`
    commentBody += `**Browser:** ${testRun.browserType}\n`
    commentBody += `**Report:** [View Report](${APP_URL}/projects/${testRun.projectId}/test-runs/${testRun.id}/report)\n\n`
    commentBody += `### Steps\n`
    for (const sr of testRun.stepResults || []) {
      const icon = sr.status === "Passed" ? "✅" : sr.status === "Failed" ? "❌" : "⏳"
      commentBody += `${icon} **Step ${sr.stepNumber}:** ${sr.actionDescription} — *${sr.status}*\n`
      if (sr.errorDetails) {
        commentBody += `\n\`\`\`\n${sr.errorDetails}\n\`\`\`\n`
      }
    }

    // POST comment to work package
    const commentUrl = `${opHost}/api/v3/work_packages/${wpId}/activities`
    const commentRes = await fetch(commentUrl, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ comment: { format: "markdown", raw: commentBody } }),
    })

    if (commentRes.ok) {
      console.log(`[op-sync] Commented on WP #${wpId} for run ${testRun.id}`)
    } else {
      const text = await commentRes.text().catch(() => "")
      console.error(`[op-sync] Comment failed on WP #${wpId}: ${commentRes.status} — ${text.slice(0, 200)}`)
    }

    // Update sync mapping timestamp
    await prisma.externalSyncMapping.update({
      where: { id: mapping.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: commentRes.ok ? "success" : "failed",
        lastSyncError: commentRes.ok ? null : `HTTP ${commentRes.status}`,
      },
    })
  } catch (err) {
    console.error("[op-sync] syncRunResultToOpenProject error:", err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SYNC BUG REPORT → OPENPROJECT (create work package for the bug)
// ─────────────────────────────────────────────────────────────────────────────
async function syncBugToOpenProject(
  bugId: string,
  testRun: any,
  opHost: string,
  opKey: string,
  auth: string
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
      const commentUrl = `${opHost}/api/v3/work_packages/${existing.externalId}/activities`
      await fetch(commentUrl, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          comment: {
            format: "markdown",
            raw: `## 🔁 Failure Recurrence\n\nRun ID: \`${testRun.id}\` — **${testRun.status}** at ${new Date().toLocaleString()}\n\n[View Run](${APP_URL}/projects/${testRun.projectId}/test-runs/${testRun.id}/report)`,
          },
        }),
      }).catch(() => {})
      return
    }

    // Build bug work package description
    const tc = bug.testCase
    let description = `## Auto-Created Bug from Failed Test\n\n`
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
    description += `*Created automatically by AI Manual QA Tester*`

    const typeHref = await resolveOpType(opHost, opKey, auth, true)
    const wpUrl = `${opHost}/api/v3/projects/${opKey}/work_packages`

    const res = await fetch(wpUrl, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        subject: `[BUG] ${bug.title}`,
        description: { format: "markdown", raw: description },
        _links: { type: { href: typeHref } },
      }),
    })

    if (res.ok) {
      const data = await res.json()
      const wpId = String(data.id)
      const wpUrl2 = `${opHost}/work_packages/${wpId}`

      // Save mapping
      await prisma.externalSyncMapping.create({
        data: {
          projectId: testRun.projectId,
          provider: "OpenProject",
          localEntityType: "BugReport",
          localEntityId: bugId,
          externalId: wpId,
          externalUrl: wpUrl2,
          externalType: "Bug",
          lastSyncedAt: new Date(),
          lastSyncStatus: "success",
        },
      })

      console.log(`[op-sync] Bug WP #${wpId} created for bug ${bug.bugKey}`)
    } else {
      const text = await res.text().catch(() => "")
      console.error(`[op-sync] Bug WP creation failed: ${res.status} — ${text.slice(0, 200)}`)
    }
  } catch (err) {
    console.error("[op-sync] syncBugToOpenProject error:", err)
  }
}
