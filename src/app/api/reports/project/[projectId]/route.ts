/**
 * GET /api/reports/project/[projectId]?from=&to=
 * Detailed per-project report.
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { getProjectReport } from "@/lib/reports/aggregate"

export async function GET(req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const url = new URL(req.url)
  try {
    const report = await getProjectReport(
      params.projectId,
      url.searchParams.get("from"),
      url.searchParams.get("to")
    )
    return NextResponse.json({ report })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to build report" }, { status: 500 })
  }
}
