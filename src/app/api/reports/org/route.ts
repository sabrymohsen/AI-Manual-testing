/**
 * GET /api/reports/org?from=&to=
 * Cross-project roll-up report for the signed-in user's projects.
 */
import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { getOrgReport } from "@/lib/reports/aggregate"

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.session?.user?.id) return unauthorizedResponse(auth.error || "Unauthorized")

  const url = new URL(req.url)
  try {
    const report = await getOrgReport(
      auth.session.user.id,
      url.searchParams.get("from"),
      url.searchParams.get("to")
    )
    return NextResponse.json({ report })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to build report" }, { status: 500 })
  }
}
