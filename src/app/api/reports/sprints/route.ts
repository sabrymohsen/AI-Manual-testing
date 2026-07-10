import { NextResponse } from "next/server"
import { z } from "zod"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { listSprints, getVelocity } from "@/lib/reports/analytics"

// GET /api/reports/sprints?projectId=[&velocity=1]
export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = z.object({ projectId: z.string().min(1), velocity: z.string().optional() }).safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 })

  const auth = await requireProjectOwner(parsed.data.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const [sprints, velocity] = await Promise.all([
    listSprints(parsed.data.projectId),
    parsed.data.velocity ? getVelocity(parsed.data.projectId) : Promise.resolve(null),
  ])
  return NextResponse.json({ ...sprints, velocity })
}
