/**
 * POST /api/projects/[projectId]/requirements/reorder
 *
 * Persists backlog ordering: receives the full ordered list of requirement ids
 * and renumbers backlogRank 0..n-1.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
})

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const parsed = reorderSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  }

  // Only rank requirements that belong to this project (ignore stray ids).
  const owned = await prisma.requirement.findMany({
    where: { projectId: params.projectId, id: { in: parsed.data.orderedIds } },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((r) => r.id))

  await prisma.$transaction(
    parsed.data.orderedIds
      .filter((id) => ownedIds.has(id))
      .map((id, index) =>
        prisma.requirement.update({ where: { id }, data: { backlogRank: index } })
      )
  )

  return NextResponse.json({ success: true })
}
