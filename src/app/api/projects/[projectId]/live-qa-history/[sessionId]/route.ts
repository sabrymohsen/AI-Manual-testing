/**
 * GET /api/projects/[projectId]/live-qa-history/[sessionId]
 *
 * Full detail for one ended Live QA session: its screenshots, video recordings,
 * and the bugs filed during it. Used by the Session History detail view.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; sessionId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const session = await prisma.recordingSession.findFirst({
    where: { id: params.sessionId, projectId: params.projectId, kind: "LiveQA" },
    select: {
      id: true,
      status: true,
      startUrl: true,
      browserType: true,
      viewport: true,
      startedAt: true,
      finishedAt: true,
      recordedTestCases: { select: { title: true }, orderBy: { createdAt: "asc" }, take: 1 },
      screenshots: {
        orderBy: { createdAt: "asc" },
        select: { id: true, filePath: true, fullPage: true, pageUrl: true, annotatedFromId: true, createdAt: true },
      },
      recordings: {
        where: { filePath: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { id: true, filePath: true, durationMs: true, createdAt: true },
      },
      bugReports: {
        orderBy: { createdAt: "desc" },
        select: { id: true, bugKey: true, title: true, severity: true, priority: true, status: true, createdAt: true },
      },
    },
  })

  if (!session) return notFoundResponse("Live QA session not found")

  const { recordedTestCases, ...rest } = session
  return NextResponse.json({
    session: { ...rest, title: recordedTestCases[0]?.title || session.startUrl || "Live QA Session" },
  })
}
