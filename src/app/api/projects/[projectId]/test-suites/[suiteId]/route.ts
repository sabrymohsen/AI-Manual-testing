import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  parentId: z.string().optional().nullable(),
  orderIndex: z.number().int().min(0).optional(),
})

/**
 * Walks up from `candidateParentId` looking for `suiteId`.
 *
 * Without this a suite could be dragged onto its own descendant, producing a
 * detached cycle: the subtree would vanish from the tree render (nothing walks
 * down to it from a root) while its rows still existed, and any recursive
 * traversal would spin forever.
 */
async function wouldCreateCycle(suiteId: string, candidateParentId: string): Promise<boolean> {
  let cursor: string | null = candidateParentId
  // Bounded so a pre-existing bad row can't hang the request.
  for (let hops = 0; cursor && hops < 100; hops++) {
    if (cursor === suiteId) return true
    const parent: { parentId: string | null } | null = await prisma.testSuite.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    })
    cursor = parent?.parentId ?? null
  }
  return false
}

export async function PATCH(
  request: Request,
  { params }: { params: { projectId: string; suiteId: string } }
) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const existing = await prisma.testSuite.findFirst({
    where: { id: params.suiteId, projectId: params.projectId },
    select: { id: true },
  })
  if (!existing) return notFoundResponse("Suite not found")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequestResponse("Invalid JSON body")
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  }
  const data = parsed.data

  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === params.suiteId) {
      return badRequestResponse("A suite can't be its own parent")
    }
    const parent = await prisma.testSuite.findFirst({
      where: { id: data.parentId, projectId: params.projectId },
      select: { id: true },
    })
    if (!parent) return badRequestResponse("Parent suite not found in this project")

    if (await wouldCreateCycle(params.suiteId, data.parentId)) {
      return badRequestResponse("That move would nest the suite inside its own subtree")
    }
  }

  const suite = await prisma.testSuite.update({
    where: { id: params.suiteId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
      ...(data.orderIndex !== undefined ? { orderIndex: data.orderIndex } : {}),
    },
  })

  return NextResponse.json({ suite })
}

/**
 * DELETE — removes the suite and its descendant suites (FK cascade).
 *
 * Test cases are never deleted: TestCase.suiteId is ON DELETE SET NULL, so
 * cases in the removed subtree fall back to "Unfiled". The response reports how
 * many were unfiled so the UI can say so plainly.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string; suiteId: string } }
) {
  const auth = await requireProjectPermission(params.projectId, "canDeleteStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const existing = await prisma.testSuite.findFirst({
    where: { id: params.suiteId, projectId: params.projectId },
    select: { id: true },
  })
  if (!existing) return notFoundResponse("Suite not found")

  // Collect the subtree so we can report the true number of affected cases.
  const all = await prisma.testSuite.findMany({
    where: { projectId: params.projectId },
    select: { id: true, parentId: true },
  })
  const childrenOf = new Map<string | null, string[]>()
  for (const s of all) {
    const list = childrenOf.get(s.parentId) ?? []
    list.push(s.id)
    childrenOf.set(s.parentId, list)
  }
  const subtree: string[] = []
  const stack = [params.suiteId]
  while (stack.length) {
    const id = stack.pop()!
    subtree.push(id)
    stack.push(...(childrenOf.get(id) ?? []))
  }

  const unfiled = await prisma.testCase.count({ where: { suiteId: { in: subtree } } })

  await prisma.testSuite.delete({ where: { id: params.suiteId } })

  return NextResponse.json({ success: true, suitesRemoved: subtree.length, casesUnfiled: unfiled })
}
