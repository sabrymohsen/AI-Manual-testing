import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { findTraceForTest, resolveTraceZip, unzipEntry } from "@/lib/hub-traces"
import { previewKindFor } from "@/lib/hub-diagnostics"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/diagnoses/{id}/bundle/file?name=<entry>[&download=1]
//   - name omitted or "__zip__"  → download the whole shaft-trace.zip
//   - download=1                 → download the single entry as an attachment
//   - otherwise                  → return the entry inline for preview
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const diagnosis = await prisma.diagnosis.findUnique({ where: { id: params.id } })
    if (!diagnosis) return NextResponse.json({ error: "Diagnosis not found" }, { status: 404 })

    const traceId = findTraceForTest(diagnosis.testName)
    const zip = traceId ? resolveTraceZip(traceId) : null
    if (!zip) return NextResponse.json({ error: "No diagnostics bundle for this diagnosis" }, { status: 404 })

    const sp = request.nextUrl.searchParams
    const name = sp.get("name")
    const download = sp.get("download") === "1"

    // Whole zip
    if (!name || name === "__zip__") {
      const buffer = fs.readFileSync(zip)
      const safe = (traceId || "diagnostics").replace(/[^a-zA-Z0-9._-]/g, "_")
      return new NextResponse(buffer as any, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${safe}-diagnostics.zip"`
        }
      })
    }

    // Guard the requested entry name
    if (name.includes("/") || name.includes("..") || name.includes("\\")) {
      return NextResponse.json({ error: "Invalid entry" }, { status: 400 })
    }

    const kind = previewKindFor(name)
    const content = await unzipEntry(zip, name)

    const contentType =
      kind === "html"
        ? "text/html; charset=utf-8"
        : kind === "json" || kind === "har"
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8"

    const headers: Record<string, string> = { "Content-Type": contentType }
    if (download) {
      const safe = name.replace(/[^a-zA-Z0-9._ -]/g, "_")
      headers["Content-Disposition"] = `attachment; filename="${safe}"`
    }
    return new NextResponse(content, { headers })
  } catch (err: any) {
    console.error("GET diagnosis bundle file error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
