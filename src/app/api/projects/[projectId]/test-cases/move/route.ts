import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"

const schema = z.object({
  testCaseIds: z.array(z.string()).min(1).max(500),
  // null files the cases as "Unfiled".
  suiteId: z.string().nullable(),
})

/**
 * POST /api/projects/:projectId/test-cases/move
 *
 * Files one or more test cases into a suite (or unfiles them). This is the
 * operation the old page had no way to express at all — its tree was projected
 * from Requirement, so there was no suite to move a case *into*.
 */
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequestResponse("Invalid JSON body")
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  }
  const { testCaseIds, suiteId } = parsed.data

  // The target suite must belong to this project.
  if (suiteId) {
    const suite = await prisma.testSuite.findFirst({
      where: { id: suiteId, projectId: params.projectId },
      select: { id: true },
    })
    if (!suite) return badRequestResponse("Suite not found in this project")
  }

  // Scoping the update by projectId as well as id means ids belonging to
  // another project are silently ignored rather than moved.
  const result = await prisma.testCase.updateMany({
    where: { id: { in: testCaseIds }, projectId: params.projectId },
    data: { suiteId },
  })

  return NextResponse.json({ moved: result.count })
}
