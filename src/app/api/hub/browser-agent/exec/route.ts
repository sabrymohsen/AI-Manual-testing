import { NextResponse } from "next/server"
import { requireHubProject } from "@/lib/hub-access"
import { BrowserAgentError, execServer } from "@/lib/browser-agent/server-driver"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * POST /api/hub/browser-agent/exec  { projectId, session?, cmd, args }
 * Runs one playwright-cli command in a server-side browser for the Browser
 * Agent. Only the allowed commands (lib/browser-agent/commands.ts) pass.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const auth = await requireHubProject(body.projectId, "write")
  if (!auth.ok) return auth.response
  try {
    const r = await execServer({
      userId: auth.session.user.id,
      projectId: body.projectId,
      sessionId: typeof body.session === "string" && body.session ? body.session : undefined,
      cmd: body.cmd,
      args: Array.isArray(body.args) ? body.args : [],
    })
    return NextResponse.json(r)
  } catch (e: any) {
    if (e instanceof BrowserAgentError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[browser-agent] exec failed", e)
    return NextResponse.json({ error: "The browser command failed on the server" }, { status: 500 })
  }
}
