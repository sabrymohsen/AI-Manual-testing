import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { traceVisibleTo } from "@/lib/hub-access"
import { resolveTraceZip } from "@/lib/hub-traces"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/traces/{traceId}/download — download the raw shaft-trace.zip
export async function GET(
  request: NextRequest,
  { params }: { params: { traceId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  if (!(await traceVisibleTo(auth.session!.user.id, params.traceId))) {
    return NextResponse.json({ error: "Trace not found" }, { status: 404 })
  }

  try {
    const zip = resolveTraceZip(params.traceId)
    if (!zip) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 })
    }
    const buffer = fs.readFileSync(zip)
    const safeName = decodeURIComponent(params.traceId).replace(/[^a-zA-Z0-9._-]/g, "_")
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}-shaft-trace.zip"`
      }
    })
  } catch (err: any) {
    console.error("GET hub trace download error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
