import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import {
  requireProjectMember,
  requireProjectPermission,
  unauthorizedResponse,
  badRequestResponse,
} from "@/lib/api-guards"
import { MAX_BULK_IDS } from "@/lib/test-cases/filters"

/**
 * Test plans — saved, re-runnable sets of cases ("Sprint 14 regression").
 *
 * GET  lists plans with case count, total estimate and a last-result summary.
 * POST creates one, optionally seeded with cases.
 */
export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const plans = await prisma.testPlan.findMany({
    where: { projectId: params.projectId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      createdByName: true,
      createdAt: true,
      updatedAt: true,
      cases: { select: { testCase: { select: { lastStatus: true, estimatedMinutes: true, reviewState: true } } } },
    },
  })

  return NextResponse.json({
    plans: plans.map(({ cases, ...p }) => {
      const byStatus: Record<string, number> = {}
      let totalMinutes = 0
      let unestimated = 0
      let runnable = 0
      for (const { testCase } of cases) {
        byStatus[testCase.lastStatus] = (byStatus[testCase.lastStatus] ?? 0) + 1
        if (testCase.estimatedMinutes != null) totalMinutes += testCase.estimatedMinutes
        else unestimated++
        if (testCase.reviewState !== "Deprecated") runnable++
      }
      return { ...p, caseCount: cases.length, runnable, byStatus, totalMinutes, unestimated }
    }),
  })
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  testCaseIds: z.array(z.string()).max(MAX_BULK_IDS).optional(),
})

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  const { name, description, testCaseIds = [] } = parsed.data

  const owned = testCaseIds.length
    ? await prisma.testCase.findMany({
        where: { id: { in: testCaseIds }, projectId: params.projectId },
        select: { id: true },
      })
    : []

  const plan = await prisma.testPlan.create({
    data: {
      projectId: params.projectId,
      name,
      description: description || null,
      createdById: auth.session!.user.id,
      createdByName: auth.session!.user.name || auth.session!.user.email || null,
      cases: { create: owned.map((o, i) => ({ testCaseId: o.id, orderIndex: i })) },
    },
    select: { id: true, name: true },
  })
  return NextResponse.json({ plan, added: owned.length }, { status: 201 })
}
