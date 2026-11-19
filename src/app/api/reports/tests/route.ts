import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { listTests } from "@/lib/reports/analytics"
import { parseList } from "@/lib/reports/api-params"

// GET /api/reports/tests?projectId=&search=&status=&page=&limit=&sort=&order=
export async function GET(req: Request) {
  const parsed = parseList(new URL(req.url))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const auth = await requireProjectMember(parsed.params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const result = await listTests(parsed.params)
  return NextResponse.json(result)
}
