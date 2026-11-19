import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { getExecutionFunnel } from "@/lib/reports/analytics"
import { rangeSchema } from "@/lib/reports/api-params"

// GET /api/reports/execution-funnel?projectId=&sprintId=
export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = rangeSchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 })

  const auth = await requireProjectMember(parsed.data.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const funnel = await getExecutionFunnel(parsed.data.projectId)
  return NextResponse.json({ funnel })
}
