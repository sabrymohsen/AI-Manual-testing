/**
 * POST /api/bug-reports/[bugId]/sync/openproject
 *
 * Sync/retry a bug report to OpenProject as a work package.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

export async function POST(
  _request: Request,
  { params }: { params: { bugId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const bug = await prisma.bugReport.findUnique({
    where: { id: params.bugId },
    include: {
      testCase: { select: { title: true } },
    },
  })

  if (!bug) {
    return NextResponse.json({ error: "Bug report not found" }, { status: 404 })
  }
  if (!bug.projectId) {
    return NextResponse.json({ error: "Bug report has no project" }, { status: 400 })
  }

  const integration = await prisma.openProjectIntegration.findUnique({
    where: { projectId: bug.projectId },
  })

  if (!integration?.apiTokenEncrypted) {
    return NextResponse.json({ error: "OpenProject integration not configured" }, { status: 400 })
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
    // Check for existing mapping
    const existingMapping = await prisma.externalSyncMapping.findUnique({
      where: {
        provider_localEntityType_localEntityId: {
          provider: "OpenProject",
          localEntityType: "BugReport",
          localEntityId: bug.id,
        },
      },
    })

    // Build description
    let description = `## Auto-Created Bug from Failed Test\n\n`
    description += `**Bug ID:** \`${bug.bugKey}\`\n`
    description += `**Test Case:** ${bug.testCase?.title || "N/A"}\n`
    description += `**Severity:** ${bug.severity}\n`
    description += `**Priority:** ${bug.priority}\n`
    description += `**Status:** ${bug.status}\n`
    if (bug.environment) description += `**Environment:** ${bug.environment}\n`
    if (bug.browser) description += `**Browser:** ${bug.browser}\n`
    description += `\n## Steps to Reproduce\n${bug.stepsToReproduce || "N/A"}\n\n`
    description += `## Expected Result\n${bug.expectedResult || "N/A"}\n\n`
    description += `## Actual Result\n${bug.actualResult || "N/A"}\n\n`
    description += `[View Bug Report](${APP_URL}/bug-reports?bug=${bug.id})\n\n`
    description += `*Created automatically by AI Manual QA Tester*\n\n`
    description += `<!-- AI-Manual-QA-Tester:BugReport:${bug.id} -->`

    const subject = `[BUG] ${bug.title}`

    // Build _links
    const links: Record<string, { href: string }> = {}
    if (integration.bugTypeId) {
      links.type = { href: client.typeHref(integration.bugTypeId) }
    }

    if (existingMapping) {
      // Update existing WP
      const wp = await client.getWorkPackage(existingMapping.externalId)
      await client.updateWorkPackage(
        existingMapping.externalId,
        {
          subject,
          description: { format: "markdown", raw: description },
          ...(Object.keys(links).length > 0 ? { _links: links } : {}),
        },
        wp.lockVersion
      )

      await prisma.externalSyncMapping.update({
        where: { id: existingMapping.id },
        data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
      })

      return NextResponse.json({
        action: "updated",
        externalId: existingMapping.externalId,
        externalUrl: existingMapping.externalUrl,
      })
    } else {
      // Create new bug WP
      const wp = await client.createWorkPackage({
        subject,
        description: { format: "markdown", raw: description },
        _links: links,
      })

      const wpUrl = client.workPackageUrl(wp.id)

      await prisma.externalSyncMapping.create({
        data: {
          projectId: bug.projectId!,
          provider: "OpenProject",
          localEntityType: "BugReport",
          localEntityId: bug.id,
          externalId: String(wp.id),
          externalUrl: wpUrl,
          externalType: "Bug",
          lastSyncedAt: new Date(),
          lastSyncStatus: "success",
        },
      })

      return NextResponse.json({
        action: "created",
        externalId: String(wp.id),
        externalUrl: wpUrl,
      })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Bug sync failed" }, { status: 500 })
  }
}
