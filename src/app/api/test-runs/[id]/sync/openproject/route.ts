/**
 * POST /api/test-runs/[testRunId]/sync/openproject
 *
 * Retry sync for a specific test run result to OpenProject.
 * Adds a comment with execution result and optionally updates status.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const testRun = await prisma.testRun.findUnique({
    where: { id: params.id },
    include: {
      testCase: { select: { id: true, title: true } },
      stepResults: { orderBy: { stepNumber: "asc" } },
      project: { select: { id: true, name: true, environment: true } },
    },
  })

  if (!testRun) {
    return NextResponse.json({ error: "Test run not found" }, { status: 404 })
  }

  const integration = await prisma.openProjectIntegration.findUnique({
    where: { projectId: testRun.projectId },
  })

  if (!integration?.apiTokenEncrypted) {
    return NextResponse.json({ error: "OpenProject integration not configured" }, { status: 400 })
  }

  // Find test case mapping
  const mapping = testRun.testCaseId
    ? await prisma.externalSyncMapping.findUnique({
        where: {
          provider_localEntityType_localEntityId: {
            provider: "OpenProject",
            localEntityType: "TestCase",
            localEntityId: testRun.testCaseId,
          },
        },
      })
    : null

  if (!mapping) {
    return NextResponse.json(
      { error: "Test case is not synced to OpenProject. Sync the test case first." },
      { status: 400 }
    )
  }

  let token: string
  try {
    token = decryptSecret({
      encrypted: integration.apiTokenEncrypted,
      iv: integration.apiTokenIv,
      authTag: integration.apiTokenAuthTag,
      keyVersion: integration.apiTokenKeyVersion,
    })
  } catch {
    return NextResponse.json({ error: "Failed to decrypt API token" }, { status: 500 })
  }

  const client = new OpenProjectClient(
    integration.baseUrl,
    integration.openProjectProjectIdentifier,
    token
  )

  try {
    // Build comment
    const statusIcon = testRun.status === "Passed" ? "✅" : testRun.status === "Failed" ? "❌" : "⚠️"
    let commentBody = `## ${statusIcon} Test Execution Result\n\n`
    commentBody += `**Result:** ${testRun.status}\n`
    commentBody += `**Run ID:** \`${testRun.id}\`\n`
    commentBody += `**Executed At:** ${testRun.completedAt ? new Date(testRun.completedAt).toLocaleString() : "N/A"}\n`
    commentBody += `**Duration:** ${((testRun.durationMs || 0) / 1000).toFixed(2)}s\n`
    commentBody += `**Environment:** ${(testRun.project as any)?.environment || "N/A"}\n`
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
    commentBody += `\n*Synced from QA Engine*`

    // Post comment
    const commentOk = await client.addWorkPackageComment(mapping.externalId, commentBody)

    // Update status if mapped
    let statusUpdated = false
    const statusMap: Record<string, string | null> = {
      Passed: integration.passedStatusId,
      Failed: integration.failedStatusId,
      Blocked: integration.blockedStatusId,
      Running: integration.runningStatusId,
    }
    const mappedStatusId = statusMap[testRun.status]
    if (mappedStatusId) {
      try {
        const wp = await client.getWorkPackage(mapping.externalId)
        await client.updateWorkPackage(
          mapping.externalId,
          { _links: { status: { href: client.statusHref(mappedStatusId) } } },
          wp.lockVersion
        )
        statusUpdated = true
      } catch {
        // Status update failed but comment was posted
      }
    }

    // Update mapping sync status
    await prisma.externalSyncMapping.update({
      where: { id: mapping.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: commentOk ? "success" : "failed",
        lastSyncError: commentOk ? null : "Comment post failed",
      },
    })

    return NextResponse.json({
      success: commentOk,
      commentPosted: commentOk,
      statusUpdated,
      externalId: mapping.externalId,
      externalUrl: mapping.externalUrl,
    })
  } catch (err: any) {
    await prisma.externalSyncMapping.update({
      where: { id: mapping.id },
      data: { lastSyncStatus: "failed", lastSyncError: err.message },
    }).catch(() => {})

    return NextResponse.json({ error: err.message || "Result sync failed" }, { status: 500 })
  }
}
