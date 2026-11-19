import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { listAiJobs } from "@/lib/ai-jobs"

export const dynamic = "force-dynamic"

/** GET /api/ai-jobs — my running jobs and finished ones I haven't seen yet. */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const jobs = await listAiJobs(auth.session!.user.id)
  return NextResponse.json({ jobs })
}
