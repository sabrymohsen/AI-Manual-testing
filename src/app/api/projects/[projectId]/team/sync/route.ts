import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { loadIntegration } from "@/lib/integrations/core/load-integration"

/**
 * POST /api/projects/:projectId/team/sync
 * Pulls the connected management tool's users via the unified provider
 * getMembers() and upserts them into the assignee pool. Preserves any
 * app-assigned role on re-sync, and deactivates previously-synced members that
 * the tool no longer returns (manual members are never touched).
 */
export async function POST(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const integration = await loadIntegration(params.projectId)
  if (!integration || !integration.enabled) {
    return NextResponse.json(
      { error: "No enabled management-tool integration is configured for this project." },
      { status: 400 }
    )
  }

  const provider = integration.provider

  let members: { id: string; name: string }[]
  try {
    members = await integration.getClient().getMembers()
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || `Failed to load members from ${provider}` },
      { status: 502 }
    )
  }

  const seenIds = members.map((m) => m.id)

  await prisma.$transaction([
    // Upsert each returned member, preserving role (update only name/active).
    ...members.map((m) =>
      prisma.projectTeamMember.upsert({
        where: {
          projectId_provider_externalId: {
            projectId: params.projectId,
            provider,
            externalId: m.id,
          },
        },
        create: {
          projectId: params.projectId,
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
        projectId: params.projectId,
        source: "synced",
        provider,
        externalId: { notIn: seenIds.length ? seenIds : ["__none__"] },
      },
      data: { active: false },
    }),
  ])

  const all = await prisma.projectTeamMember.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  })
  return NextResponse.json({ synced: members.length, provider, members: all })
}
