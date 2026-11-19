import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { listBugs } from "@/lib/reports/analytics"
import { parseList } from "@/lib/reports/api-params"

// GET /api/reports/bugs?projectId=&search=&severity=&status=&page=&limit=&sort=&order=
export async function GET(req: Request) {
  const parsed = parseList(new URL(req.url))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const auth = await requireProjectMember(parsed.params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const result = await listBugs(parsed.params)
  return NextResponse.json(result)
}
