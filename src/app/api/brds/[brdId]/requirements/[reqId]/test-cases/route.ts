import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireBrdTestAccess } from "@/lib/brd/server"
import { linkTestsToRequirementStory, unlinkTestsFromRequirementStory } from "@/lib/brd/to-board"

const linkSchema = z.object({
  add: z.array(z.string()).max(500).optional(),
  remove: z.array(z.string()).max(500).optional(),
})

const reviewSchema = z.object({
  testCaseId: z.string(),
  needsReview: z.literal(false),
})

async function load(brdId: string, reqId: string) {
  return prisma.brdRequirement.findFirst({
    where: { id: reqId, brdId },
    select: { id: true, brd: { select: { projectId: true } } },
  })
}

/** POST { add?, remove? } links or unlinks test cases (same project only). */
export async function POST(request: Request, { params }: { params: { brdId: string; reqId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const req = await load(params.brdId, params.reqId)
  if (!req) return NextResponse.json({ error: "Requirement not found" }, { status: 404 })

  const parsed = linkSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  const { add = [], remove = [] } = parsed.data

  const owned = add.length
    ? await prisma.testCase.findMany({ where: { id: { in: add }, projectId: req.brd.projectId }, select: { id: true } })
    : []
  const added = owned.length
    ? (
        await prisma.brdRequirementTestCase.createMany({
          data: owned.map((o) => ({ requirementId: req.id, testCaseId: o.id })),
          skipDuplicates: true,
        })
      ).count
    : 0
  const removed = remove.length
    ? (await prisma.brdRequirementTestCase.deleteMany({ where: { requirementId: req.id, testCaseId: { in: remove } } }))
        .count
    : 0
  // Keep the story made from this requirement in step.
  await linkTestsToRequirementStory(req.id, owned.map((o) => o.id))
  await unlinkTestsFromRequirementStory(req.id, remove)
  return NextResponse.json({ added, removed })
}

/** PATCH { testCaseId, needsReview: false } — "I've checked this test against the new wording". */
export async function PATCH(request: Request, { params }: { params: { brdId: string; reqId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const req = await load(params.brdId, params.reqId)
  if (!req) return NextResponse.json({ error: "Requirement not found" }, { status: 404 })

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })

  const res = await prisma.brdRequirementTestCase.updateMany({
    where: { requirementId: req.id, testCaseId: parsed.data.testCaseId },
    data: { needsReview: false, reviewReason: null },
  })
  return NextResponse.json({ updated: res.count })
}
