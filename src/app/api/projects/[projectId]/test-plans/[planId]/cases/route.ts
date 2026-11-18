import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireProjectPermission, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { MAX_BULK_IDS } from "@/lib/test-cases/filters"

const schema = z.object({
  add: z.array(z.string()).max(MAX_BULK_IDS).optional(),
  remove: z.array(z.string()).max(MAX_BULK_IDS).optional(),
})

/**
 * POST /api/projects/:projectId/test-plans/:planId/cases  { add?, remove? }
 *
 * Adds cases (skipping ones already in the plan) and/or removes them.
 */
export async function POST(request: Request, { params }: { params: { projectId: string; planId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const plan = await prisma.testPlan.findFirst({
    where: { id: params.planId, projectId: params.projectId },
    select: { id: true, _count: { select: { cases: true } } },
  })
  if (!plan) return notFoundResponse("Plan not found")

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  const { add = [], remove = [] } = parsed.data

  const owned = add.length
    ? await prisma.testCase.findMany({ where: { id: { in: add }, projectId: params.projectId }, select: { id: true } })
    : []

  const [added, removed] = await prisma.$transaction(async (tx) => {
    const a = owned.length
      ? await tx.testPlanCase.createMany({
          data: owned.map((o, i) => ({ planId: plan.id, testCaseId: o.id, orderIndex: plan._count.cases + i })),
          skipDuplicates: true,
        })
      : { count: 0 }
    const r = remove.length
      ? await tx.testPlanCase.deleteMany({ where: { planId: plan.id, testCaseId: { in: remove } } })
      : { count: 0 }
    await tx.testPlan.update({ where: { id: plan.id }, data: { updatedAt: new Date() } })
    return [a.count, r.count]
  })

  return NextResponse.json({ added, removed })
}
