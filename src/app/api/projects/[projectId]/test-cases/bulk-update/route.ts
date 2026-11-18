import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { requireProjectPermission, badRequestResponse } from "@/lib/api-guards"
import { MAX_BULK_IDS } from "@/lib/test-cases/filters"

const tag = z.string().trim().min(1).max(40)

const schema = z
  .object({
    testCaseIds: z.array(z.string()).min(1).max(MAX_BULK_IDS),
    priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
    executionType: z.enum(["Manual", "Automated"]).optional(),
    reviewState: z.enum(["Draft", "Ready", "Approved", "Deprecated"]).optional(),
    // "" or null unassigns.
    assignee: z.string().nullable().optional(),
    estimatedMinutes: z.number().int().min(0).max(10000).nullable().optional(),
    addTags: z.array(tag).max(30).optional(),
    removeTags: z.array(tag).max(30).optional(),
  })
  .refine(
    (b) =>
      b.priority || b.executionType || b.reviewState || b.assignee !== undefined ||
      b.estimatedMinutes !== undefined || b.addTags?.length || b.removeTags?.length,
    "Nothing to change"
  )

/**
 * POST /api/projects/:projectId/test-cases/bulk-update
 *
 * One endpoint for every bulk property edit in the library: priority, type,
 * review state, assignee, estimate, and adding/removing tags. Only cases in
 * this project are touched.
 */
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  const b = parsed.data

  const owned = await prisma.testCase.findMany({
    where: { id: { in: b.testCaseIds }, projectId: params.projectId },
    select: { id: true },
  })
  const ids = owned.map((o) => o.id)
  if (!ids.length) return NextResponse.json({ count: 0 })

  const data: Prisma.TestCaseUpdateManyMutationInput = {}
  if (b.priority) data.priority = b.priority
  if (b.executionType) data.executionType = b.executionType
  if (b.reviewState) data.reviewState = b.reviewState
  if (b.assignee !== undefined) data.assignee = b.assignee || null
  if (b.estimatedMinutes !== undefined) data.estimatedMinutes = b.estimatedMinutes

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.testCase.updateMany({ where: { id: { in: ids } }, data })
    if (b.addTags?.length) {
      // Append only tags the case doesn't already have.
      await tx.$executeRaw`
        UPDATE "TestCase"
        SET "tags" = ARRAY(SELECT DISTINCT unnest("tags" || ${b.addTags}::text[])), "updatedAt" = NOW()
        WHERE "id" IN (${Prisma.join(ids)})`
    }
    if (b.removeTags?.length) {
      await tx.$executeRaw`
        UPDATE "TestCase"
        SET "tags" = ARRAY(SELECT t FROM unnest("tags") AS t WHERE NOT (t = ANY(${b.removeTags}::text[]))), "updatedAt" = NOW()
        WHERE "id" IN (${Prisma.join(ids)})`
    }
  })

  return NextResponse.json({ count: ids.length })
}
