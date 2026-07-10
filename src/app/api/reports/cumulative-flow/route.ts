import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { getCumulativeFlow } from "@/lib/reports/analytics"
import { rangeSchema } from "@/lib/reports/api-params"

// GET /api/reports/cumulative-flow?projectId=&from=&to=
export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = rangeSchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 })

  const auth = await requireProjectOwner(parsed.data.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const flow = await getCumulativeFlow(parsed.data.projectId, parsed.data.from, parsed.data.to)
  return NextResponse.json({ flow })
}
