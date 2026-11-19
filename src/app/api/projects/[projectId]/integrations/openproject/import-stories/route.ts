/**
 * POST /api/projects/[projectId]/integrations/openproject/import-stories
 *
 * Import user-story work packages from OpenProject into local Requirements.
 * Already-imported stories are refreshed (title/description/priority) instead
 * of duplicated; stories pushed from this app are skipped.
 */
import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { importUserStoriesFromOpenProject } from "@/lib/integrations/openproject/sync-requirement"

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const result = await importUserStoriesFromOpenProject(params.projectId)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Story import failed" },
      { status: 500 }
    )
  }
}
