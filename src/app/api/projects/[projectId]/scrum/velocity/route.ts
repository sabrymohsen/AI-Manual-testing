import { NextResponse } from "next/server"
import { requireProjectMember } from "@/lib/api-guards"
import { getVelocity } from "@/lib/reports/analytics"

export const dynamic = "force-dynamic"

// GET — committed vs completed points per sprint and the average velocity,
// used by the backlog to warn when a sprint is planned beyond what the team
// usually finishes.
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json(await getVelocity(params.projectId))
}
