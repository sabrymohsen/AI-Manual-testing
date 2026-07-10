import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { getSprintBurndown } from "@/lib/reports/analytics"
import { rangeSchema } from "@/lib/reports/api-params"

// GET /api/reports/sprint-metrics?projectId=&sprintId=&from=&to=
export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = rangeSchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 })

  const auth = await requireProjectOwner(parsed.data.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const burndown = await getSprintBurndown(parsed.data.projectId, parsed.data.sprintId)
  return NextResponse.json({ burndown })
}
