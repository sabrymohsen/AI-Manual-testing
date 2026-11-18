import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectPermission, notFoundResponse } from "@/lib/api-guards"
import { applyCaseEdit, type CaseSnapshot } from "@/lib/test-cases/authoring"

/**
 * POST /api/projects/:projectId/test-cases/:tcId/versions/:versionId/restore
 *
 * Writes an earlier version back as the current case. The state being
 * replaced is itself saved as a new version first, so a restore can be undone.
 * Story links and the suite are only restored if they still exist.
 */
export async function POST(
  _request: Request,
  { params }: { params: { projectId: string; tcId: string; versionId: string } }
) {
  const auth = await requireProjectPermission(params.projectId, "canCreateStories")
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const version = await prisma.testCaseVersion.findFirst({
    where: { id: params.versionId, testCaseId: params.tcId, testCase: { projectId: params.projectId } },
  })
  if (!version) return notFoundResponse("Version not found")

  const snap = version.snapshot as unknown as CaseSnapshot
  const [suite, reqs] = await Promise.all([
    snap.suiteId
      ? prisma.testSuite.findFirst({ where: { id: snap.suiteId, projectId: params.projectId }, select: { id: true } })
      : null,
    prisma.requirement.findMany({
      where: { id: { in: snap.requirementIds ?? [] }, projectId: params.projectId },
      select: { id: true },
    }),
  ])

  const changed = await applyCaseEdit(
    params.tcId,
    {
      ...snap,
      suiteId: suite?.id ?? null,
      requirementIds: reqs.map((r) => r.id),
      // Step ids in the snapshot still match steps that exist today, so those
      // are updated in place; steps deleted since then are recreated.
      steps: snap.steps ?? [],
    },
    { id: auth.session!.user.id, name: auth.session!.user.name, email: auth.session!.user.email },
    `Restored v${version.version}`
  )
  return NextResponse.json({ restored: version.version, changed })
}
