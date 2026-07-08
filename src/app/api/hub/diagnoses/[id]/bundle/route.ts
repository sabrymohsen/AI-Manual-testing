import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { buildBundleInfo } from "@/lib/hub-diagnostics"

export const dynamic = "force-dynamic"

// GET /api/hub/diagnoses/{id}/bundle
// Diagnostics-bundle overview for a failure: zip entries, run metadata and the
// redaction/sensitive-data scan. File contents come from /bundle/file.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const diagnosis = await prisma.diagnosis.findUnique({ where: { id: params.id } })
    if (!diagnosis) {
      return NextResponse.json({ error: "Diagnosis not found" }, { status: 404 })
    }

    const bundle = await buildBundleInfo(diagnosis.testName)
    return NextResponse.json({ testName: diagnosis.testName, ...bundle })
  } catch (err: any) {
    console.error("GET diagnosis bundle error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
