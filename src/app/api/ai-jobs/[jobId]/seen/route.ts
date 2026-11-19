import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"

/** POST /api/ai-jobs/:jobId/seen — the user has been told the result. */
export async function POST(_req: Request, { params }: { params: { jobId: string } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  await prisma.aiJob.updateMany({
    where: { id: params.jobId, userId: auth.session!.user.id, status: { not: "running" } },
    data: { seen: true },
  })
  return NextResponse.json({ ok: true })
}
