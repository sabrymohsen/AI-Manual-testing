import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { notify } from "@/lib/notifications"
import { requireBrdAccess, brdAudit } from "@/lib/brd/server"

const schema = z.object({
  decision: z.enum(["Approved", "ChangesRequested"]),
  comment: z.string().max(5000).optional(),
})

/**
 * PATCH /api/brds/:brdId/reviews/:reviewId  { decision, comment? }
 *
 * Only the assigned reviewer decides. Requesting changes needs a comment.
 * When the last pending review of the current version is approved (and none
 * asked for changes), the BRD moves Draft → Reviewed.
 */
export async function PATCH(request: Request, { params }: { params: { brdId: string; reviewId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!
  const user = access.session!.user

  const review = await prisma.brdReview.findFirst({ where: { id: params.reviewId, brdId: brd.id } })
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 })
  if (review.reviewerId !== user.id) return NextResponse.json({ error: "Only the assigned reviewer can decide" }, { status: 403 })
  if (review.decision !== "Pending") return NextResponse.json({ error: "This review is already closed" }, { status: 409 })
  if (review.versionId !== brd.currentVersionId) {
    return NextResponse.json({ error: "A newer version exists — this review no longer applies" }, { status: 409 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  const { decision, comment } = parsed.data
  if (decision === "ChangesRequested" && !comment?.trim()) {
    return NextResponse.json({ error: "Say what needs to change" }, { status: 400 })
  }

  await prisma.brdReview.update({
    where: { id: review.id },
    data: { decision, comment: comment?.trim() || null, decidedAt: new Date() },
  })
  await brdAudit(
    brd.id,
    decision === "Approved" ? "review_approved" : "review_changes_requested",
    `v${review.versionNumber}${comment ? `: ${comment.slice(0, 200)}` : ""}`,
    user
  )

  // All reviewers of this version approved → Reviewed.
  const forVersion = await prisma.brdReview.findMany({ where: { brdId: brd.id, versionId: review.versionId } })
  const allApproved = forVersion.length > 0 && forVersion.every((r) => r.decision === "Approved")
  let statusChanged = false
  if (allApproved && brd.status === "Draft") {
    await prisma.brdDocument.update({ where: { id: brd.id }, data: { status: "Reviewed" } })
    await brdAudit(brd.id, "status_changed", "Draft → Reviewed (all reviewers approved)", null)
    statusChanged = true
  }

  const recipients = [review.requestedById, brd.uploaderId].filter((id): id is string => !!id && id !== user.id)
  notify(
    Array.from(new Set(recipients)).map((userId) => ({
      userId,
      type: "SYSTEM" as const,
      title: decision === "Approved" ? "BRD approved" : "Changes requested on BRD",
      body: `${user.name || user.email} ${decision === "Approved" ? "approved" : "requested changes to"} ${brd.name} v${review.versionNumber}${
        statusChanged ? " — all reviewers approved, now Reviewed" : ""
      }`,
      projectId: brd.projectId,
      actionUrl: `/projects/${brd.projectId}/brds/${brd.id}?tab=reviews`,
    }))
  ).catch(() => {})

  return NextResponse.json({ decision, statusChanged })
}
