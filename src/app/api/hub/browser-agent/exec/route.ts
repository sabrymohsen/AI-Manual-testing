import { NextResponse } from "next/server"
import { requireHubProject } from "@/lib/hub-access"
import { BrowserAgentError, execServer } from "@/lib/browser-agent/server-driver"
import { loginValues, loginsForBrds } from "@/lib/brd/test-users"
import { fillData } from "@/lib/browser-agent/client"
import { redactSecrets } from "@/lib/browser-agent/snapshot"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * POST /api/hub/browser-agent/exec  { projectId, session?, cmd, args, brdIds? }
 * Runs one playwright-cli command in a server-side browser for the Browser
 * Agent. Only the allowed commands (lib/browser-agent/commands.ts) pass.
 *
 * brdIds: the test case's BRDs. Their users' logins ({reviewer_username},
 * {reviewer_password}) are filled in here, so passwords never reach the page,
 * and they are hidden again in what comes back.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const auth = await requireHubProject(body.projectId, "write")
  if (!auth.ok) return auth.response
  try {
    const brdIds = Array.isArray(body.brdIds) ? body.brdIds.filter((x: unknown) => typeof x === "string").slice(0, 20) : []
    const logins = brdIds.length ? loginValues(await loginsForBrds(body.projectId, brdIds)) : null
    let args: unknown[] = Array.isArray(body.args) ? body.args : []
    if (logins && ["fill", "type", "select"].includes(body.cmd)) args = args.map((a) => (typeof a === "string" ? fillData(a, logins.values) : a))
    const r = await execServer({
      userId: auth.session.user.id,
      projectId: body.projectId,
      sessionId: typeof body.session === "string" && body.session ? body.session : undefined,
      cmd: body.cmd,
      args: args as string[],
    })
    if (logins && Object.keys(logins.secrets).length) {
      if (r.snapshot) r.snapshot = redactSecrets(r.snapshot, logins.secrets)
      if (r.error) r.error = redactSecrets(r.error, logins.secrets)
      if (r.result) r.result = JSON.parse(redactSecrets(JSON.stringify(r.result), logins.secrets))
    }
    return NextResponse.json(r)
  } catch (e: any) {
    if (e instanceof BrowserAgentError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[browser-agent] exec failed", e)
    return NextResponse.json({ error: "The browser command failed on the server" }, { status: 500 })
  }
}
