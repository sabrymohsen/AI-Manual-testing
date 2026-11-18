import { NextResponse } from "next/server"
import { verifyCiRequest } from "@/lib/hub-ci"
import { startScopedRun } from "@/lib/hub-runs"

export const dynamic = "force-dynamic"

/**
 * POST /api/hub/ci/run
 * Authorization: Bearer <project CI token>
 * { folder?, tag?, scriptIds?, browser? }   (empty = every test in the project)
 *
 * Starts a run from a CI pipeline and returns ids plus a status URL to poll.
 */
export async function POST(request: Request) {
  const token = await verifyCiRequest(request)
  if (!token) return NextResponse.json({ error: "Invalid or revoked token" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const res = await startScopedRun(
    token.projectId,
    {
      folder: typeof body.folder === "string" ? body.folder : undefined,
      tag: typeof body.tag === "string" && body.tag ? body.tag : undefined,
      scriptIds: Array.isArray(body.scriptIds) ? body.scriptIds.map(String) : undefined,
    },
    {
      browser: body.browser || "Headless",
      meta: { triggerSource: "ci", triggeredByName: `CI token “${token.name}”` },
    }
  )
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 404 })

  const ref = res.batchId ?? res.executionIds[0]
  const origin = new URL(request.url).origin
  return NextResponse.json(
    { ...res, ref, statusUrl: `${origin}/api/hub/ci/status?ref=${ref}` },
    { status: 202 }
  )
}
