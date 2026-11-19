import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { listRequirements } from "@/lib/reports/analytics"
import { parseList } from "@/lib/reports/api-params"

// GET /api/reports/requirements?projectId=&search=&status=&page=&limit=
export async function GET(req: Request) {
  const parsed = parseList(new URL(req.url))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const auth = await requireProjectMember(parsed.params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const result = await listRequirements(parsed.params)
  return NextResponse.json(result)
}
