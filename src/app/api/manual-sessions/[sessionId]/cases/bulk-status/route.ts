/**
 * POST /api/manual-sessions/[sessionId]/cases/bulk-status
 *
 * Bulk-update the status of multiple ManualSessionCases in one session
 * (e.g. mark several test cases as Passed at once). Also updates each case's
 * step results so derived UI state and completion stats stay consistent.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"

const bodySchema = z.object({
  sessionCaseIds: z.array(z.string()).min(1, "At least one case is required"),
  status: z.enum(["Passed", "Failed", "Blocked", "Skipped", "Pending"]),
})

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join(", ") },
      { status: 400 }
    )
  }
  const { sessionCaseIds, status } = parsed.data

  // Verify the session belongs to the authenticated user's project
  const session = await prisma.manualTestSession.findUnique({
    where: { id: params.sessionId },
    include: { project: { select: { userId: true } } },
  })
  if (!session) return notFoundResponse("Manual session not found")
  if (session.project.userId !== auth.session!.user.id) {
    return unauthorizedResponse("Access denied")
  }

  // Restrict to cases that actually belong to this session
  const cases = await prisma.manualSessionCase.findMany({
    where: { id: { in: sessionCaseIds }, sessionId: params.sessionId },
    select: { id: true },
  })
  const validIds = cases.map((c) => c.id)
  if (validIds.length === 0) {
    return NextResponse.json({ error: "No matching cases in this session" }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.manualStepResult.updateMany({
      where: { sessionCaseId: { in: validIds } },
      data: { status: status as any },
    }),
    prisma.manualSessionCase.updateMany({
      where: { id: { in: validIds } },
      data: { status: status as any },
    }),
  ])

  return NextResponse.json({ success: true, count: validIds.length, status })
}
