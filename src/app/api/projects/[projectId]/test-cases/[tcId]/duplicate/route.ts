import { NextResponse } from "next/server"
import { requireProjectPermission, notFoundResponse } from "@/lib/api-guards"
import { duplicateCase } from "@/lib/test-cases/authoring"

/**
 * POST /api/projects/:projectId/test-cases/:tcId/duplicate
 *
 * Copies a case — steps, tags, suite, story links, estimate — as a new Draft
 * titled "Copy of …". Run history, bugs and versions are not copied.
 */
export async function POST(_request: Request, { params }: { params: { projectId: string; tcId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const copy = await duplicateCase(params.projectId, params.tcId)
  if (!copy) return notFoundResponse("Test case not found")
  return NextResponse.json({ testCase: copy }, { status: 201 })
}
