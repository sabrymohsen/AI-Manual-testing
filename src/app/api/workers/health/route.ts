import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { getActiveWorkers } from "@/lib/queue"

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const workers = await getActiveWorkers()
    return NextResponse.json({ success: true, workers })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch workers health" }, { status: 500 })
  }
}
