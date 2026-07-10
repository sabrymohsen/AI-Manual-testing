/**
 * POST /api/projects/[projectId]/integrations/poll
 * Manually pull external changes for this project's integration (inbound sync).
 */
import { NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { pollInboundForProject } from "@/lib/integrations/core/poll"

export async function POST(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const result = await pollInboundForProject(params.projectId)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Poll failed" }, { status: 500 })
  }
}
