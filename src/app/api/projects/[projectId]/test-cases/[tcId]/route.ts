import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  requireProjectMember,
  requireProjectPermission,
  unauthorizedResponse,
  badRequestResponse,
  notFoundResponse,
} from "@/lib/api-guards"
import { updateTestCaseSchema } from "@/schemas"
import { createAuditLog } from "@/lib/auth/audit"
import { applyCaseEdit, deleteCasesSafely } from "@/lib/test-cases/authoring"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; tcId: string } }
) {
  // Reading a test case is member-level. This was requireProjectOwner, which
  // demands Owner/Admin — so ordinary project members (testers) got a 404 on
  // their own project's test cases. Writes below remain owner-gated.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const testCase = await prisma.testCase.findFirst({
    where: { id: params.tcId, projectId: params.projectId },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      requiredCredential: {
        select: { id: true, roleName: true },
      },
      suite: { select: { id: true, name: true } },
      requirements: {
        include: {
          requirement: true
        }
      },
      // Shown inline on the Bugs tab, newest first.
      bugReports: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, bugKey: true, title: true, status: true, severity: true, createdAt: true },
      },
      planLinks: { select: { plan: { select: { id: true, name: true } } } },
      // BRD requirements this case verifies, with "needs review" when the BRD changed.
      brdRequirementLinks: {
        where: { requirement: { brd: { isDeleted: false } } },
        select: {
          needsReview: true,
          reviewReason: true,
          requirement: {
            select: { id: true, key: true, title: true, status: true, brd: { select: { id: true, name: true } } },
          },
        },
      },
      _count: { select: { versions: true } },
    },
  })

  if (!testCase) {
    return NextResponse.json({ error: "Test case not found" }, { status: 404 })
  }

  const sync = await prisma.externalSyncMapping.findFirst({
    where: { projectId: params.projectId, localEntityType: "TestCase", localEntityId: testCase.id },
    select: { externalId: true, externalUrl: true, lastSyncStatus: true, lastSyncedAt: true, lastSyncError: true },
  })

  return NextResponse.json({ testCase: { ...testCase, sync } })
}

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string; tcId: string } }
) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const parsed = updateTestCaseSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }

  const exists = await prisma.testCase.findFirst({
    where: { id: params.tcId, projectId: params.projectId },
    select: { id: true },
  })
  if (!exists) return notFoundResponse("Test case not found")

  // Only editable fields reach the write; legacy hierarchy fields and anything
  // else the client sends are ignored. applyCaseEdit snapshots the current
  // state as a version first and keeps step ids stable.
  const d = parsed.data
  const changed = await applyCaseEdit(
    params.tcId,
    {
      title: d.title,
      priority: d.priority,
      preconditions: d.preconditions,
      executionType: d.executionType,
      reviewState: d.reviewState,
      estimatedMinutes: d.estimatedMinutes,
      tags: d.tags,
      assignee: d.assignee,
      suiteId: d.suiteId,
      requirementIds: d.requirementIds,
      steps: d.steps as Record<string, unknown>[] | undefined,
    },
    { id: auth.session!.user.id, name: auth.session!.user.name, email: auth.session!.user.email }
  )

  const testCase = await prisma.testCase.findUnique({
    where: { id: params.tcId },
    include: { steps: { orderBy: { stepNumber: "asc" } } },
  })
  return NextResponse.json({ testCase, changed })
}

/**
 * Deletes the case but never its bugs or automated run history — see
 * deleteCasesSafely for exactly what is kept.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string; tcId: string } }
) {
  const auth = await requireProjectPermission(params.projectId, "canDeleteStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { count, titles } = await deleteCasesSafely(params.projectId, [params.tcId])
    if (count === 0) return notFoundResponse("Test case not found")
    await createAuditLog({
      action: "Delete Test Case",
      details: `Deleted test case: ${titles[0]} (bugs and run history kept)`,
      userId: auth.session!.user.id,
      projectId: params.projectId,
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Error deleting test case:", err)
    return NextResponse.json({ error: err.message || "Failed to delete test case" }, { status: 500 })
  }
}
