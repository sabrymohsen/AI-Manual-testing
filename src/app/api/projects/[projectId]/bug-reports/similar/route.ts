import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { findSimilar } from "@/lib/bug-reports/similarity"

/**
 * GET /api/projects/:projectId/bug-reports/similar?title=…&steps=…&excludeId=…
 *
 * Likely duplicates of a bug that is *about to be filed*.
 *
 * The app already has `mark-duplicate`, but that only helps after two people
 * have each written up the same defect. Catching it at the point of filing is
 * what actually prevents the duplicate.
 *
 * Read-only and member-level: anyone who can file a bug can check for one.
 */

/** How many recent bugs to score against. Bounded so this stays cheap. */
const CANDIDATE_LIMIT = 300

/** Settled statuses are still worth matching — a recurrence of a closed bug is
 *  exactly the thing you want to know about before filing a new one. */
const CANDIDATE_STATUSES = [
  "Open",
  "InProgress",
  "ReadyForRetest",
  "Reopened",
  "Resolved",
  "Closed",
] as const

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) {
    return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)
  }

  const url = new URL(request.url)
  const title = url.searchParams.get("title")?.trim() ?? ""
  const steps = url.searchParams.get("steps")?.trim() || null
  const excludeId = url.searchParams.get("excludeId")

  // Too short to say anything useful — don't warn on "log".
  if (title.length < 6) return NextResponse.json({ matches: [] })

  const candidates = await prisma.bugReport.findMany({
    where: {
      projectId: params.projectId,
      status: { in: [...CANDIDATE_STATUSES] as any },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      bugKey: true,
      title: true,
      status: true,
      severity: true,
      createdAt: true,
      stepsToReproduce: true,
    },
    orderBy: { createdAt: "desc" },
    take: CANDIDATE_LIMIT,
  })

  const matches = findSimilar(title, steps, candidates)

  return NextResponse.json({
    matches: matches.map((m) => ({
      id: m.id,
      bugKey: m.bugKey,
      title: m.title,
      status: m.status,
      severity: m.severity,
      score: m.score,
      createdAt: m.createdAt,
    })),
  })
}
