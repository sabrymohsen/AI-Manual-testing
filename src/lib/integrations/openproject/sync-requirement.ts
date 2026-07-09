/**
 * Two-way sync between local Requirements (user stories) and OpenProject.
 *
 *   Push:   syncRequirementToOpenProject(requirementId)
 *           Creates/updates a work package for the story (same pattern as
 *           sync-bug-report.ts). Mapping stored in ExternalSyncMapping with
 *           localEntityType "Requirement".
 *
 *   Import: importUserStoriesFromOpenProject(projectId)
 *           Pulls work packages of the user-story type into local Requirements,
 *           de-duplicated via ExternalSyncMapping (updates already-imported ones).
 *
 * Never assumes a request context — safe to call from workers.
 */
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

/** Type names treated as "user story" when no explicit type is configured. */
const STORY_TYPE_HINTS = ["user story", "story", "feature", "requirement", "epic"]

async function getClientForProject(projectId: string): Promise<
  | { client: OpenProjectClient; integration: any }
  | { client: null; integration: null; reason: string }
> {
  const integration = await prisma.openProjectIntegration.findUnique({
    where: { projectId },
  })
  if (!integration?.apiTokenEncrypted) {
    return { client: null, integration: null, reason: "OpenProject integration not configured" }
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
  return { client, integration }
}

/**
 * Resolves the OpenProject type id to use for user stories: the configured
 * userStoryTypeId, else the first instance type matching STORY_TYPE_HINTS
 * (persisted back to the integration, best-effort).
 */
async function resolveStoryTypeId(
  client: OpenProjectClient,
  integration: { projectId: string; userStoryTypeId: string | null }
): Promise<string | null> {
  if (integration.userStoryTypeId) return integration.userStoryTypeId
  try {
    const types = await client.getTypes()
    for (const hint of STORY_TYPE_HINTS) {
      const match = types.find((t) => t.name.toLowerCase() === hint)
      if (match) {
        prisma.openProjectIntegration
          .update({
            where: { projectId: integration.projectId },
            data: { userStoryTypeId: String(match.id) },
          })
          .catch(() => {})
        return String(match.id)
      }
    }
  } catch {
    // fall through — create with the instance default type
  }
  return null
}

/** Maps a local Priority to the instance's native priority link, best-effort. */
async function priorityLink(
  client: OpenProjectClient,
  priority: string
): Promise<{ href: string } | null> {
  try {
    const priorities = await client.getPriorities()
    if (priorities.length === 0) return null
    const aliases: Record<string, string[]> = {
      low: ["low"],
      medium: ["normal", "medium"],
      high: ["high"],
      critical: ["immediate", "critical", "urgent"],
    }
    const candidates = aliases[priority.toLowerCase()] || [priority.toLowerCase()]
    const match = priorities.find((p) => candidates.includes(p.name.toLowerCase()))
    return match ? { href: client.priorityHref(match.id) } : null
  } catch {
    return null
  }
}

export type StorySyncResult =
  | { status: "created" | "updated"; externalId: string; externalUrl: string | null }
  | { status: "skipped"; reason: string }

export async function syncRequirementToOpenProject(
  requirementId: string
): Promise<StorySyncResult> {
  const req = await prisma.requirement.findUnique({
    where: { id: requirementId },
    include: {
      testCases: { include: { testCase: { select: { title: true } } } },
    },
  })
  if (!req) throw new Error("Requirement not found")

  const conn = await getClientForProject(req.projectId)
  if (!conn.client) return { status: "skipped", reason: conn.reason }
  const { client, integration } = conn

  const existingMapping = await prisma.externalSyncMapping.findUnique({
    where: {
      provider_localEntityType_localEntityId: {
        provider: "OpenProject",
        localEntityType: "Requirement",
        localEntityId: req.id,
      },
    },
  })

  // Build the work-package description from the story's fields.
  let description = `## User Story\n\n`
  description += `**Key:** \`${req.requirementKey}\`\n`
  description += `**Priority:** ${req.priority}\n`
  description += `**Status:** ${req.status}\n\n`
  if (req.description) description += `## Description\n${req.description}\n\n`
  if (req.acceptanceCriteria) description += `## Acceptance Criteria\n${req.acceptanceCriteria}\n\n`
  if (req.testCases.length > 0) {
    description += `## Linked Test Cases\n`
    for (const link of req.testCases) description += `- ${link.testCase.title}\n`
    description += `\n`
  }
  description += `[View User Story](${APP_URL}/projects/${req.projectId}/requirements/${req.id})\n\n`
  description += `*Synced by QA Engine*\n\n`
  description += `<!-- AI-Manual-QA-Tester:Requirement:${req.id} -->`

  const subject = `[STORY] ${req.title}`

  const links: Record<string, any> = {}
  const typeId = await resolveStoryTypeId(client, integration)
  if (typeId) links.type = { href: client.typeHref(typeId) }
  const prio = await priorityLink(client, req.priority)
  if (prio) links.priority = prio

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
      projectId: req.projectId,
      provider: "OpenProject",
      localEntityType: "Requirement",
      localEntityId: req.id,
      externalId: String(wp.id),
      externalUrl: wpUrl,
      externalType: "UserStory",
      lastSyncedAt: new Date(),
      lastSyncStatus: "success",
    },
  })

  return { status: "created", externalId: String(wp.id), externalUrl: wpUrl }
}

/** Maps an OpenProject priority title to the local Priority enum. */
function mapOpPriority(title: string | undefined): "Low" | "Medium" | "High" | "Critical" {
  const t = (title || "").toLowerCase()
  if (t.includes("immediate") || t.includes("critical") || t.includes("urgent")) return "Critical"
  if (t.includes("high")) return "High"
  if (t.includes("low")) return "Low"
  return "Medium"
}

export interface StoryImportResult {
  imported: number
  updated: number
  skipped: number
  total: number
  typeName: string | null
}

export async function importUserStoriesFromOpenProject(
  projectId: string
): Promise<StoryImportResult> {
  const conn = await getClientForProject(projectId)
  if (!conn.client) throw new Error(conn.reason)
  const { client, integration } = conn

  // Restrict to the user-story type when one is known; otherwise import all
  // work packages whose type name matches a story hint.
  const typeId = await resolveStoryTypeId(client, integration)
  let workPackages
  let typeName: string | null = null
  if (typeId) {
    workPackages = await client.searchWorkPackages([
      { type: { operator: "=", values: [typeId] } },
    ])
  } else {
    const all = await client.searchWorkPackages([])
    workPackages = all.filter((wp) => {
      const t = (wp._links?.type?.title || "").toLowerCase()
      return STORY_TYPE_HINTS.some((h) => t === h)
    })
  }
  if (workPackages.length > 0) {
    typeName = workPackages[0]._links?.type?.title || null
  }

  // Existing mappings let us update instead of duplicate; also skip stories that
  // were pushed FROM this app (their WP carries our marker) to avoid re-importing
  // our own exports as copies.
  const mappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: "OpenProject", localEntityType: "Requirement" },
  })
  const byExternalId = new Map(mappings.map((m) => [m.externalId, m]))

  let imported = 0
  let updated = 0
  let skipped = 0

  for (const wp of workPackages) {
    const externalId = String(wp.id)
    const raw = wp.description?.raw || ""
    const title = wp.subject.replace(/^\[STORY\]\s*/, "")
    const priority = mapOpPriority(wp._links?.priority?.title)
    const existing = byExternalId.get(externalId)

    try {
      if (existing) {
        // Already linked to a local story — refresh its content from OpenProject.
        await prisma.requirement.update({
          where: { id: existing.localEntityId },
          data: { title, description: raw || undefined, priority },
        })
        await prisma.externalSyncMapping.update({
          where: { id: existing.id },
          data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
        })
        updated++
        continue
      }

      // A WP created by our own push sync carries the marker — link it instead of
      // creating a duplicate story. (Mapping may be missing if it was deleted.)
      const markerMatch = raw.match(/AI-Manual-QA-Tester:Requirement:([a-f0-9-]+)/)
      if (markerMatch) {
        const localReq = await prisma.requirement.findUnique({ where: { id: markerMatch[1] } })
        if (localReq) {
          skipped++
          continue
        }
      }

      const requirementKey = `OP-${externalId}`
      const requirement = await prisma.requirement.upsert({
        where: { projectId_requirementKey: { projectId, requirementKey } },
        create: {
          projectId,
          requirementKey,
          title,
          description: raw || null,
          priority,
          source: "OpenProject",
          externalSystem: "OpenProject",
          externalUrl: client.workPackageUrl(wp.id),
        },
        update: { title, description: raw || undefined, priority },
      })

      await prisma.externalSyncMapping.create({
        data: {
          projectId,
          provider: "OpenProject",
          localEntityType: "Requirement",
          localEntityId: requirement.id,
          externalId,
          externalUrl: client.workPackageUrl(wp.id),
          externalType: wp._links?.type?.title || "UserStory",
          lastSyncedAt: new Date(),
          lastSyncStatus: "success",
        },
      })
      imported++
    } catch (err: any) {
      console.warn(`[sync-requirement] Import of WP #${externalId} failed: ${err?.message}`)
      skipped++
    }
  }

  return { imported, updated, skipped, total: workPackages.length, typeName }
}
