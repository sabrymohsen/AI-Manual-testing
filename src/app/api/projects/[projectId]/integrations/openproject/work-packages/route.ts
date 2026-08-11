/**
 * GET /api/projects/[projectId]/integrations/openproject/work-packages?search=…
 *
 * Lists the connected project's work packages (id + subject + type) so the bug
 * form can offer real task numbers to pick as a parent, instead of asking the
 * tester to know the work-package id by heart.
 *
 * Defaults to open items; `search` filters by subject or id. Degrades to an
 * empty list rather than an error so the field stays usable as free text.
 */
import { NextResponse } from "next/server"
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const resolved = await resolveOpenProject(params.projectId)
  if (!resolved.ok) return NextResponse.json({ workPackages: [] })

  const search = new URL(request.url).searchParams.get("search")?.trim() || ""

  const filters: Array<Record<string, any>> = search
    ? [{ subjectOrId: { operator: "**", values: [search] } }]
    : [{ status: { operator: "o", values: [] } }]

  try {
    const wps = await resolved.client.searchWorkPackages(filters)
    return NextResponse.json({
      workPackages: wps.map((wp: any) => ({
        id: String(wp.id),
        subject: wp.subject as string,
        type: wp._links?.type?.title || null,
        status: wp._links?.status?.title || null,
      })),
    })
  } catch {
    return NextResponse.json({ workPackages: [] })
  }
}
