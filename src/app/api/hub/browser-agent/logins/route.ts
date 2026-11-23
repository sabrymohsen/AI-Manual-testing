import { NextResponse } from "next/server"
import { requireHubProject } from "@/lib/hub-access"
import { loginsForBrds } from "@/lib/brd/test-users"

export const dynamic = "force-dynamic"

/**
 * POST /api/hub/browser-agent/logins { projectId, brdIds }
 * The BRDs' test-user logins, for a run on the tester's own computer (the
 * desktop app fills the fields there). Server runs never call this: the exec
 * route fills logins on the server.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const auth = await requireHubProject(body.projectId, "write")
  if (!auth.ok) return auth.response
  const brdIds = Array.isArray(body.brdIds) ? body.brdIds.filter((x: unknown) => typeof x === "string").slice(0, 20) : []
  const users = await loginsForBrds(body.projectId, brdIds)
  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } })
}
