/**
 * syncRequirement / importUserStories — provider-agnostic two-way sync between
 * local Requirements (user stories) and the connected tracker.
 *
 *   Push:   syncRequirement(requirementId) — create/update a work item.
 *   Import: importUserStories(projectId) — pull story-type items into local
 *           Requirements, de-duplicated via ExternalSyncMapping.
 *
 * Replaces the OpenProject-only sync-requirement; works for OpenProject / Jira /
 * Azure DevOps / ClickUp via WorkItemProvider. Safe to call from workers.
 */
import { prisma } from "@/lib/db"
import { loadIntegration, type LoadedIntegration } from "./load-integration"
import type { WorkItemProvider } from "./provider"
import type { WorkItem } from "./types"
import { entityMarker } from "./types"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

const STORY_TYPE_HINTS = ["user story", "story", "feature", "requirement", "epic"]

/** Resolve the story type id: configured mapping, else a hinted instance type. */
async function resolveStoryTypeId(
  provider: WorkItemProvider,
  loaded: LoadedIntegration
): Promise<string | null> {
  if (loaded.typeMapping.userStory) return loaded.typeMapping.userStory
  try {
    const types = await provider.getTypes()
    for (const hint of STORY_TYPE_HINTS) {
      const match = types.find((t) => t.name.toLowerCase() === hint)
      if (match) return match.id
    }
  } catch {
    // fall through — create with the instance default type
  }
  return null
}

async function resolvePriorityId(
  provider: WorkItemProvider,
  priority: string
): Promise<string | null> {
  try {
    const priorities = await provider.getPriorities()
    if (!priorities.length) return null
    const aliases: Record<string, string[]> = {
      low: ["low"],
      medium: ["normal", "medium"],
      high: ["high"],
      critical: ["immediate", "critical", "urgent"],
    }
    const candidates = aliases[priority.toLowerCase()] || [priority.toLowerCase()]
    const match = priorities.find((p) => candidates.includes(p.name.toLowerCase()))
    return match ? match.id : null
  } catch {
    return null
  }
}

export type StorySyncResult =
  | { status: "created" | "updated"; externalId: string; externalUrl: string | null }
  | { status: "skipped"; reason: string }

export async function syncRequirement(requirementId: string): Promise<StorySyncResult> {
  const req = await prisma.requirement.findUnique({
    where: { id: requirementId },
    include: { testCases: { include: { testCase: { select: { title: true } } } } },
  })
  if (!req) throw new Error("Requirement not found")

  const loaded = await loadIntegration(req.projectId)
  if (!loaded) return { status: "skipped", reason: "No project-management integration configured" }
  const provider = loaded.getClient()

  const existingMapping = await prisma.externalSyncMapping.findUnique({
    where: {
      provider_localEntityType_localEntityId: {
        provider: loaded.provider as any,
        localEntityType: "Requirement",
        localEntityId: req.id,
      },
    },
  })

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
  description += `<!-- ${entityMarker("Requirement", req.id)} -->`

  const title = `[STORY] ${req.title}`
  const typeId = await resolveStoryTypeId(provider, loaded)
  const priorityId = await resolvePriorityId(provider, req.priority)

  const input = { title, description, typeId, priorityId }

  if (existingMapping) {
    await provider.updateWorkItem(existingMapping.externalId, input)
    await prisma.externalSyncMapping.update({
      where: { id: existingMapping.id },
      data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    })
    return { status: "updated", externalId: existingMapping.externalId, externalUrl: existingMapping.externalUrl }
  }

  const wp = await provider.createWorkItem(input)
  await prisma.externalSyncMapping.create({
    data: {
      projectId: req.projectId,
      provider: loaded.provider as any,
      localEntityType: "Requirement",
      localEntityId: req.id,
      externalId: wp.externalId,
      externalUrl: wp.url,
      externalType: "UserStory",
      lastSyncedAt: new Date(),
      lastSyncStatus: "success",
    },
  })
  return { status: "created", externalId: wp.externalId, externalUrl: wp.url }
}

function mapPriorityName(title: string | undefined | null): "Low" | "Medium" | "High" | "Critical" {
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

export async function importUserStories(projectId: string): Promise<StoryImportResult> {
  const loaded = await loadIntegration(projectId)
  if (!loaded) throw new Error("No project-management integration configured")
  const provider = loaded.getClient()

  if (!provider.searchByRole) {
    throw new Error(`${loaded.provider} does not support importing user stories`)
  }
  const items: WorkItem[] = await provider.searchByRole("userStory")
  const typeName = items.length > 0 ? items[0].typeName : null

  const mappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: loaded.provider as any, localEntityType: "Requirement" },
  })
  const byExternalId = new Map(mappings.map((m) => [m.externalId, m]))

  let imported = 0
  let updated = 0
  let skipped = 0

  for (const item of items) {
    const externalId = item.externalId
    const raw = item.description || ""
    const title = item.title.replace(/^\[STORY\]\s*/, "")
    const priority = mapPriorityName(item.priorityName)
    const existing = byExternalId.get(externalId)

    try {
      if (existing) {
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

      // Items pushed FROM this app carry our marker — skip re-importing our exports.
      const markerMatch = raw.match(/AI-Manual-QA-Tester:Requirement:([a-f0-9-]+)/)
      if (markerMatch) {
        const localReq = await prisma.requirement.findUnique({ where: { id: markerMatch[1] } })
        if (localReq) {
          skipped++
          continue
        }
      }

      const requirementKey = `${loaded.provider === "OpenProject" ? "OP" : "EXT"}-${externalId}`
      const requirement = await prisma.requirement.upsert({
        where: { projectId_requirementKey: { projectId, requirementKey } },
        create: {
          projectId,
          requirementKey,
          title,
          description: raw || null,
          priority,
          source: (loaded.provider === "Jira"
            ? "Jira"
            : loaded.provider === "AzureDevOps"
              ? "AzureDevOps"
              : loaded.provider === "OpenProject"
                ? "OpenProject"
                : "Manual") as any,
          externalSystem: loaded.provider,
          externalUrl: item.url,
        },
        update: { title, description: raw || undefined, priority },
      })

      await prisma.externalSyncMapping.create({
        data: {
          projectId,
          provider: loaded.provider as any,
          localEntityType: "Requirement",
          localEntityId: requirement.id,
          externalId,
          externalUrl: item.url,
          externalType: item.typeName || "UserStory",
          lastSyncedAt: new Date(),
          lastSyncStatus: "success",
        },
      })
      imported++
    } catch (err: any) {
      console.warn(`[sync-requirement] Import of item ${externalId} failed: ${err?.message}`)
      skipped++
    }
  }

  return { imported, updated, skipped, total: items.length, typeName }
}
