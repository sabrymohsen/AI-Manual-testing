/**
 * syncBugReportToOpenProject
 *
 * Shared logic to create/update an OpenProject work package for a BugReport.
 * Used by:
 *   - Manual retry route (POST /api/bug-reports/[bugId]/sync/openproject)
 *   - Live Testing Workstation session bugs (createBugFromSession), best-effort
 *
 * Never assumes a request context — safe to call from the recorder worker.
 */
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

export type BugSyncResult =
  | { status: "created" | "updated"; externalId: string; externalUrl: string | null }
  | { status: "skipped"; reason: string }

/**
 * @param bugId            BugReport id to sync.
 * @param opts.requireAutoFlag  When true (auto-sync callers), skip unless the
 *                              project's autoSyncBugToOpenProject toggle is on.
 * Throws on unexpected errors (token decrypt / OpenProject API failures) so the
 * manual route can surface them; returns a "skipped" result for benign no-ops.
 */
export async function syncBugReportToOpenProject(
  bugId: string,
  opts: { requireAutoFlag?: boolean } = {}
): Promise<BugSyncResult> {
  const bug = await prisma.bugReport.findUnique({
    where: { id: bugId },
    include: { testCase: { select: { title: true } } },
  })

  if (!bug) throw new Error("Bug report not found")
  if (!bug.projectId) throw new Error("Bug report has no project")

  const integration = await prisma.openProjectIntegration.findUnique({
    where: { projectId: bug.projectId },
  })

  if (!integration?.apiTokenEncrypted) {
    return { status: "skipped", reason: "OpenProject integration not configured" }
  }
  if (opts.requireAutoFlag && !integration.autoSyncBugToOpenProject) {
    return { status: "skipped", reason: "Auto-sync of bugs to OpenProject is disabled" }
  }

  const token = decryptSecret({
    encrypted: integration.apiTokenEncrypted,
    iv: integration.apiTokenIv,
    authTag: integration.apiTokenAuthTag,
    keyVersion: integration.apiTokenKeyVersion,
  })

  const client = new OpenProjectClient(
    integration.baseUrl,
    integration.openProjectProjectIdentifier,
    token
  )

  const existingMapping = await prisma.externalSyncMapping.findUnique({
    where: {
      provider_localEntityType_localEntityId: {
        provider: "OpenProject",
        localEntityType: "BugReport",
        localEntityId: bug.id,
      },
    },
  })

  // Build description (includes auto-captured live-session context when present)
  let description = `## Bug Report\n\n`
  description += `**Bug ID:** \`${bug.bugKey}\`\n`
  description += `**Test Case:** ${bug.testCase?.title || "N/A"}\n`
  description += `**Severity:** ${bug.severity}\n`
  description += `**Priority:** ${bug.priority}\n`
  description += `**Status:** ${bug.status}\n`
  if (bug.environment) description += `**Environment:** ${bug.environment}\n`
  if (bug.browser) description += `**Browser:** ${bug.browser}\n`
  if (bug.viewport) description += `**Viewport:** ${bug.viewport}\n`
  if (bug.osInfo) description += `**OS:** ${bug.osInfo}\n`
  if (bug.screenResolution) description += `**Screen Resolution:** ${bug.screenResolution}\n`
  if (bug.pageUrl) description += `**Page URL:** ${bug.pageUrl}\n`
  description += `\n## Steps to Reproduce\n${bug.stepsToReproduce || "N/A"}\n\n`
  description += `## Expected Result\n${bug.expectedResult || "N/A"}\n\n`
  description += `## Actual Result\n${bug.actualResult || "N/A"}\n\n`
  if (bug.consoleLogs) description += `## Console Logs\n\`\`\`\n${bug.consoleLogs}\n\`\`\`\n\n`
  if (bug.networkErrors) description += `## Network Errors\n\`\`\`\n${bug.networkErrors}\n\`\`\`\n\n`
  if (bug.videoUrl) description += `**Session Recording:** ${APP_URL}${bug.videoUrl}\n\n`
  description += `[View Bug Report](${APP_URL}/bug-reports?bug=${bug.id})\n\n`
  description += `*Created automatically by AI Manual QA Tester*\n\n`
  description += `<!-- AI-Manual-QA-Tester:BugReport:${bug.id} -->`

  const subject = `[BUG] ${bug.title}`

  const links: Record<string, { href: string }> = {}
  if (integration.bugTypeId) {
    links.type = { href: client.typeHref(integration.bugTypeId) }
  }

  if (existingMapping) {
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

    return {
      status: "updated",
      externalId: existingMapping.externalId,
      externalUrl: existingMapping.externalUrl,
    }
  }

  const wp = await client.createWorkPackage({
    subject,
    description: { format: "markdown", raw: description },
    _links: links,
  })

  const wpUrl = client.workPackageUrl(wp.id)

  await prisma.externalSyncMapping.create({
    data: {
      projectId: bug.projectId,
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

  return { status: "created", externalId: String(wp.id), externalUrl: wpUrl }
}
