/**
 * POST /api/requirements/[requirementId]/sync/openproject
 *
 * Push a user story (Requirement) to OpenProject as a work package.
 */
import { NextResponse } from "next/server"
import { unauthorizedResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { syncRequirementToOpenProject } from "@/lib/integrations/openproject/sync-requirement"

export async function POST(
  request: Request,
  { params }: { params: { requirementId: string } }
) {
  const requirement = await prisma.requirement.findUnique({
    where: { id: params.requirementId },
    select: { projectId: true },
  })
  if (!requirement) return notFoundResponse("Requirement not found")

  const auth = await requireProjectMember(requirement.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const result = await syncRequirementToOpenProject(params.requirementId)

    if (result.status === "skipped") {
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }

    return NextResponse.json({
      action: result.status,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Story sync failed" },
      { status: 500 }
    )
  }
}
