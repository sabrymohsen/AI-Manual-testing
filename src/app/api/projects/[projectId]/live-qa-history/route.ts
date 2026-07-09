/**
 * GET /api/projects/[projectId]/live-qa-history
 *
 * Lists this project's ended Live QA (kind="LiveQA") sessions for the Session
 * History page, with per-session counts (bugs / screenshots / recordings).
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"

// Sessions that are done (not live / mid-save).
const ENDED_STATUSES = ["Finished", "Cancelled", "Failed"] as const

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const sessions = await prisma.recordingSession.findMany({
    where: {
      projectId: params.projectId,
      kind: "LiveQA",
      status: { in: ENDED_STATUSES as any },
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      startUrl: true,
      browserType: true,
      viewport: true,
      startedAt: true,
      finishedAt: true,
      recordedTestCases: { select: { title: true }, orderBy: { createdAt: "asc" }, take: 1 },
      _count: { select: { screenshots: true, recordings: true, bugReports: true } },
    },
  })

  const items = sessions.map((s) => ({
    id: s.id,
    title: s.recordedTestCases[0]?.title || s.startUrl || "Live QA Session",
    status: s.status,
    startUrl: s.startUrl,
    browserType: s.browserType,
    viewport: s.viewport,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    bugCount: s._count.bugReports,
    screenshotCount: s._count.screenshots,
    recordingCount: s._count.recordings,
  }))

  return NextResponse.json({ sessions: items })
}
