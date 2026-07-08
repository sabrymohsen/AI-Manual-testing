import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { listTraces } from "@/lib/hub-traces"

export const dynamic = "force-dynamic"

// GET /api/hub/traces — list available SHAFT trace bundles (newest first)
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const traces = await listTraces()
    return NextResponse.json({ traces })
  } catch (err: any) {
    console.error("GET hub traces error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
