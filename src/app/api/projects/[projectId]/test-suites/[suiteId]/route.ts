import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission, requireProjectMember, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
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

/** Every suite id in this suite's subtree, itself included. */
async function subtreeIds(projectId: string, suiteId: string): Promise<string[]> {
  const all = await prisma.testSuite.findMany({
    where: { projectId },
    select: { id: true, parentId: true },
  })
  const childrenOf = new Map<string | null, string[]>()
  for (const s of all) {
    const list = childrenOf.get(s.parentId) ?? []
    list.push(s.id)
    childrenOf.set(s.parentId, list)
  }
  const subtree: string[] = []
  const stack = [suiteId]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    subtree.push(id)
    stack.push(...(childrenOf.get(id) ?? []))
  }
  return subtree
}

/**
 * GET — what deleting this suite would cost.
 *
 * The delete itself is not reversible, and its blast radius is invisible from
 * the row: a module with two cases of its own may hold four sub-modules with
 * forty between them, plus the bugs filed against all of it. The confirmation
 * dialog reads these numbers rather than guessing, so nobody is surprised by
 * what they just unfiled.
 */
export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; suiteId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const existing = await prisma.testSuite.findFirst({
    where: { id: params.suiteId, projectId: params.projectId },
    select: { id: true, name: true },
  })
  if (!existing) return notFoundResponse("Suite not found")

  const subtree = await subtreeIds(params.projectId, params.suiteId)
  const [cases, bugs, visualTests] = await Promise.all([
    prisma.testCase.count({ where: { suiteId: { in: subtree } } }),
    prisma.bugReport.count({ where: { suiteId: { in: subtree } } }),
    // Visual tests name a module for the bugs they file (VisualTest.suiteId, SET NULL).
    prisma.visualTest.count({ where: { suiteId: { in: subtree } } }),
  ])

  return NextResponse.json({
    id: existing.id,
    name: existing.name,
    // The suite itself counts as one; 3 means "this and two sub-modules".
    suitesRemoved: subtree.length,
    casesUnfiled: cases,
    bugsUnfiled: bugs,
    visualTestsUnfiled: visualTests,
  })
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
 * Neither test cases, bugs nor visual tests are deleted: TestCase.suiteId,
 * BugReport.suiteId and VisualTest.suiteId are all ON DELETE SET NULL, so
 * everything in the removed subtree falls back to "Unfiled". The response reports how many of each, so
 * the UI can say so plainly.
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

  const subtree = await subtreeIds(params.projectId, params.suiteId)

  // Counted BEFORE the delete: afterwards the rows point at nothing and there
  // is no way to say what was affected.
  const [unfiledCases, unfiledBugs, unfiledVisualTests] = await Promise.all([
    prisma.testCase.count({ where: { suiteId: { in: subtree } } }),
    prisma.bugReport.count({ where: { suiteId: { in: subtree } } }),
    prisma.visualTest.count({ where: { suiteId: { in: subtree } } }),
  ])

  await prisma.testSuite.delete({ where: { id: params.suiteId } })

  return NextResponse.json({
    success: true,
    suitesRemoved: subtree.length,
    casesUnfiled: unfiledCases,
    bugsUnfiled: unfiledBugs,
    visualTestsUnfiled: unfiledVisualTests,
  })
}
