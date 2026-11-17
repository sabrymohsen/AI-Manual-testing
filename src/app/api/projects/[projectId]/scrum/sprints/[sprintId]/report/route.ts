import { NextResponse } from "next/server"
import { requireProjectMember } from "@/lib/api-guards"
import { getSprintBurndown, getVelocity } from "@/lib/reports/analytics"

export const dynamic = "force-dynamic"

// GET /api/projects/{projectId}/scrum/sprints/{sprintId}/report
// Burndown for this sprint plus the project's velocity, for the board's
// "Sprint report" panel. Same numbers as the Reports page.
export async function GET(_req: Request, { params }: { params: { projectId: string; sprintId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const [burndown, velocity] = await Promise.all([
    getSprintBurndown(params.projectId, params.sprintId),
    getVelocity(params.projectId),
  ])
  if (!burndown.sprint) return NextResponse.json({ error: "Sprint not found" }, { status: 404 })
  return NextResponse.json({ burndown, velocity })
}
