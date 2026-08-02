import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  requireProjectMember,
  requireProjectPermission,
  unauthorizedResponse,
  notFoundResponse,
  badRequestResponse,
} from "@/lib/api-guards"
import { z } from "zod"
import { handleLibraryError } from "@/lib/test-cases/errors"

/**
 * Suite tree for the test library.
 *
 * Suites are the *ownership* hierarchy: a test case lives in exactly one (or
 * none = "Unfiled"), so counts sum to the project total. This is deliberately
 * distinct from requirement links, which are many-to-many and answer coverage
 * — "which stories does this case exercise". The old page conflated the two by
 * projecting its tree from Requirement, which is why a case linked to stories
 * under two epics appeared twice and why there was nowhere to file anything.
 */

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  parentId: z.string().optional().nullable(),
  orderIndex: z.number().int().min(0).optional(),
})

/** GET — the whole tree, flat, with per-suite direct case counts. */
export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) {
    return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)
  }

  try {
  const [suites, unfiled] = await Promise.all([
    prisma.testSuite.findMany({
      where: { projectId: params.projectId },
      orderBy: [{ parentId: "asc" }, { orderIndex: "asc" }, { name: "asc" }],
      select: {
        id: true,
        parentId: true,
        name: true,
        description: true,
        orderIndex: true,
        _count: { select: { testCases: true } },
      },
    }),
    prisma.testCase.count({ where: { projectId: params.projectId, suiteId: null } }),
  ])

  return NextResponse.json({
    suites: suites.map(({ _count, ...s }) => ({ ...s, caseCount: _count.testCases })),
    unfiledCount: unfiled,
  })
  } catch (err) {
    return handleLibraryError(err, "suites")
  }
}

/** POST — create a suite. */
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequestResponse("Invalid JSON body")
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  }
  const data = parsed.data

  // A parent must belong to the same project — otherwise a suite could be
  // reparented into someone else's tree.
  if (data.parentId) {
    const parent = await prisma.testSuite.findFirst({
      where: { id: data.parentId, projectId: params.projectId },
      select: { id: true },
    })
    if (!parent) return badRequestResponse("Parent suite not found in this project")
  }

  const orderIndex =
    data.orderIndex ??
    (await prisma.testSuite.count({
      where: { projectId: params.projectId, parentId: data.parentId ?? null },
    }))

  const suite = await prisma.testSuite.create({
    data: {
      projectId: params.projectId,
      name: data.name.trim(),
      description: data.description ?? null,
      parentId: data.parentId ?? null,
      orderIndex,
    },
  })

  return NextResponse.json({ suite }, { status: 201 })
}
