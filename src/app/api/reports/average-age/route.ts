import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { getAverageAge } from "@/lib/reports/analytics"
import { z } from "zod"

const schema = z.object({ projectId: z.string().min(1) })

// GET /api/reports/average-age?projectId=
export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 })

  const auth = await requireProjectMember(parsed.data.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const rows = await getAverageAge(parsed.data.projectId)
  return NextResponse.json({ rows })
}
