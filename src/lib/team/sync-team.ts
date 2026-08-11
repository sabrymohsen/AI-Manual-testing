/**
 * syncProjectTeam — pull the connected tracker's users into the project's
 * assignee pool (ProjectTeamMember).
 *
 * Extracted from the /team/sync route so the pool can also be filled lazily:
 * connecting an integration used to leave the pool empty until someone opened
 * the project's Team tab and pressed Sync, which is why every assignee dropdown
 * (bug form, test-case form) came up with no developers in it.
 *
 * Preserves any app-assigned role on re-sync and deactivates previously-synced
 * members the tool no longer returns. Manual members are never touched.
 */
import { prisma } from "@/lib/db"
import { loadIntegration } from "@/lib/integrations/core/load-integration"

export type SyncTeamResult =
  | { ok: true; synced: number; provider: string }
  | { ok: false; status: number; error: string }

export async function syncProjectTeam(projectId: string): Promise<SyncTeamResult> {
  const integration = await loadIntegration(projectId)
  if (!integration || !integration.enabled) {
    return {
      ok: false,
      status: 400,
      error: "No enabled management-tool integration is configured for this project.",
    }
  }

  const provider = integration.provider

  let members: { id: string; name: string }[]
  try {
    members = await integration.getClient().getMembers()
  } catch (err: any) {
    return { ok: false, status: 502, error: err?.message || `Failed to load members from ${provider}` }
  }

  const seenIds = members.map((m) => m.id)

  await prisma.$transaction([
    // Upsert each returned member, preserving role (update only name/active).
    ...members.map((m) =>
      prisma.projectTeamMember.upsert({
        where: {
          projectId_provider_externalId: { projectId, provider, externalId: m.id },
        },
        create: {
          projectId,
          source: "synced",
          provider,
          externalId: m.id,
          name: m.name,
          active: true,
        },
        update: { name: m.name, active: true },
      })
    ),
    // Deactivate synced members from this provider that are no longer present.
    prisma.projectTeamMember.updateMany({
      where: {
        projectId,
        source: "synced",
        provider,
        externalId: { notIn: seenIds.length ? seenIds : ["__none__"] },
      },
      data: { active: false },
    }),
  ])

  return { ok: true, synced: members.length, provider }
}
