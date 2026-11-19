/**
 * POST /api/projects/[projectId]/integrations/poll
 * Pull external changes for this project's integration (inbound sync).
 *
 * Two callers, one behaviour, one difference:
 *   - the "Pull changes" button, and the page's background refresh, both pass
 *     force (the default here) — a person looking at the board has asked for
 *     the tracker to be read, so the project's `inboundSyncEnabled` flag, which
 *     governs the unattended worker/webhook path and is off by default, is not
 *     the answer to that request;
 *   - pass `{ force: false }` to respect the flag.
 *
 * The response reports what actually happened — checked / applied / failed, and
 * why nothing was checked when nothing was — so the UI can stop saying
 * "already up to date" after a pull that never reached the tracker.
 */
import { NextResponse } from "next/server"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { pollInboundForProject } from "@/lib/integrations/core/poll"

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await req.json().catch(() => ({}))
  const force = body?.force !== false

  try {
    const result = await pollInboundForProject(params.projectId, { force })
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Poll failed" }, { status: 500 })
  }
}
