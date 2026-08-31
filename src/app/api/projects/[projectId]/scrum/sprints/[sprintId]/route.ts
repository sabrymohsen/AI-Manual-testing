/**
 * GET /api/projects/[projectId]/scrum/sprints/[sprintId]
 *
 * One sprint with the tasks it holds. The dashboard's sprint-health card and
 * the sprint report both read this to total story points — they were already
 * calling this path, but only the collection route above it existed, so every
 * call 404'd and both surfaces silently showed a sprint with zero points.
 *
 * The sibling route at /api/scrum/sprints/[sprintId] is not the same thing: it
 * carries PATCH and DELETE for the board, has no GET, and is keyed only by
 * sprint id. This one is project-scoped, so the sprint is verified to belong
 * to the project whose membership was just checked.
 *
 * Only the task fields those two callers use are selected; a sprint late in a
 * project can hold hundreds of tasks, and neither surface renders more.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"

export async function GET(
  _req: Request,
  { params }: { params: { projectId: string; sprintId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const sprint = await prisma.scrumSprint.findFirst({
    // Both ids in the filter: a sprint id from another project must read as
    // "not found" here, never as someone else's sprint.
    where: { id: params.sprintId, projectId: params.projectId },
    include: {
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          storyPoints: true,
          type: true,
          priority: true,
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { tasks: true } },
    },
  })

  if (!sprint) return NextResponse.json({ error: "Sprint not found" }, { status: 404 })

  return NextResponse.json({ sprint })
}
