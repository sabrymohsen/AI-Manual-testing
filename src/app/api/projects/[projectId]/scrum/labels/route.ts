import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner } from "@/lib/api-guards"

// GET /api/projects/:projectId/scrum/labels
// Returns the distinct label / component / version values used across the
// project's tasks, for autocomplete in the detail drawer.
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const tasks = await prisma.task.findMany({
    where: { projectId: params.projectId },
    select: { labels: true, components: true, fixVersions: true, affectedVersions: true },
  })

  const uniq = (arrs: string[][]) =>
    [...new Set(arrs.flat().map((s) => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))

  return NextResponse.json({
    labels: uniq(tasks.map((t) => t.labels)),
    components: uniq(tasks.map((t) => t.components)),
    versions: uniq([...tasks.map((t) => t.fixVersions), ...tasks.map((t) => t.affectedVersions)]),
  })
}
