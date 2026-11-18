import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { notify } from "@/lib/notifications"
import { requireBrdAccess, brdAudit } from "@/lib/brd/server"

/**
 * Review workflow for a BRD version.
 *
 * GET  — reviews, newest first, plus the project members who can be asked.
 * POST — { reviewerIds, message? } asks people to review the CURRENT version.
 *        When every reviewer of the current version approves, the BRD becomes
 *        Reviewed automatically (see the decision route).
 */
async function roster(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      user: { select: { id: true, name: true, email: true } },
      projectMembers: { select: { user: { select: { id: true, name: true, email: true } } } },
    },
  })
  const all = [project?.user, ...(project?.projectMembers.map((m) => m.user) ?? [])].filter(
    (u): u is { id: string; name: string | null; email: string } => !!u
  )
  return all.filter((u, i) => all.findIndex((x) => x.id === u.id) === i)
}

export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const [reviews, members] = await Promise.all([
    prisma.brdReview.findMany({ where: { brdId: params.brdId }, orderBy: { createdAt: "desc" } }),
    roster(access.brd!.projectId),
  ])
  return NextResponse.json({
    reviews,
    members: members.map((m) => ({ id: m.id, name: m.name || m.email })),
    currentUserId: access.session!.user.id,
  })
}

const schema = z.object({
  reviewerIds: z.array(z.string()).min(1, "Choose at least one reviewer").max(20),
  message: z.string().max(1000).optional(),
})

export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true, unlocked: true })
  if (access.error !== null) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!
  const user = access.session!.user

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 })

  const version = brd.currentVersionId
    ? await prisma.brdVersion.findUnique({ where: { id: brd.currentVersionId }, select: { id: true, versionNumber: true } })
    : null
  if (!version) return NextResponse.json({ error: "This BRD has no version to review" }, { status: 400 })

  const members = await roster(brd.projectId)
  const chosen = members.filter((m) => parsed.data.reviewerIds.includes(m.id))
  if (!chosen.length) return NextResponse.json({ error: "Reviewers must be project members" }, { status: 400 })

  // Don't ask the same person twice for the same version.
  const existing = await prisma.brdReview.findMany({
    where: { brdId: brd.id, versionId: version.id, reviewerId: { in: chosen.map((c) => c.id) }, decision: "Pending" },
    select: { reviewerId: true },
  })
  const fresh = chosen.filter((c) => !existing.some((e) => e.reviewerId === c.id))

  await prisma.brdReview.createMany({
    data: fresh.map((c) => ({
      brdId: brd.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      reviewerId: c.id,
      reviewerName: c.name || c.email,
      requestedById: user.id,
      requestedByName: user.name || user.email,
    })),
  })
  if (fresh.length) {
    await brdAudit(
      brd.id,
      "review_requested",
      `v${version.versionNumber}: asked ${fresh.map((c) => c.name || c.email).join(", ")}`,
      user
    )
    notify(
      fresh
        .filter((c) => c.id !== user.id)
        .map((c) => ({
          userId: c.id,
          type: "SYSTEM" as const,
          title: "Review requested",
          body: `${user.name || user.email} asked you to review BRD ${brd.name} (v${version.versionNumber})${
            parsed.data.message ? `: ${parsed.data.message.slice(0, 140)}` : ""
          }`,
          projectId: brd.projectId,
          actionUrl: `/projects/${brd.projectId}/brds/${brd.id}?tab=reviews`,
        }))
    ).catch(() => {})
  }
  return NextResponse.json({ requested: fresh.length }, { status: 201 })
}
