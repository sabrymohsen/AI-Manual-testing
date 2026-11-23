import { NextResponse } from "next/server"
import { requireHubProject } from "@/lib/hub-access"
import { aiAvailable, nextAction, REMEMBER_NAME } from "@/lib/browser-agent/agent"

export const dynamic = "force-dynamic"
export const maxDuration = 240

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")

/**
 * POST /api/hub/browser-agent/next
 * { projectId, testTitle, previous[], step{action,expected}, page{url,title,snapshot}, done[], dataNames[] }
 * → the next browser action for this step, or { kind: "done", passed, actual }.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const auth = await requireHubProject(body.projectId, "write")
  if (!auth.ok) return auth.response
  const userId = auth.session.user.id
  if (!(await aiAvailable(body.projectId, userId))) {
    return NextResponse.json({ error: "No AI provider is set up for this project. Add one in the project's AI settings." }, { status: 400 })
  }
  const action = str(body.step?.action, 2000).trim()
  if (!action) return NextResponse.json({ error: "The step has no action" }, { status: 400 })
  try {
    const next = await nextAction({
      projectId: body.projectId,
      userId,
      testTitle: str(body.testTitle, 300),
      previous: (Array.isArray(body.previous) ? body.previous : []).slice(-30).map((p: any) => ({ action: str(p?.action, 300), passed: !!p?.passed })),
      step: { action, expected: str(body.step?.expected, 2000) },
      page: { url: str(body.page?.url, 1000), title: str(body.page?.title, 300), snapshot: str(body.page?.snapshot, 200_000) },
      done: (Array.isArray(body.done) ? body.done : []).slice(0, 20).map((d: any) => ({ action: str(d?.action, 300), error: d?.error ? str(d.error, 500) : undefined })),
      dataNames: (Array.isArray(body.dataNames) ? body.dataNames : []).filter((n: unknown) => typeof n === "string").slice(0, 50),
      remembered: Object.fromEntries(
        Object.entries(body.remembered && typeof body.remembered === "object" ? body.remembered : {})
          .filter(([k, v]) => REMEMBER_NAME.test(k) && typeof v === "string")
          .slice(0, 30)
          .map(([k, v]) => [k, (v as string).slice(0, 300)])
      ),
      user: typeof body.user === "string" && /^[A-Za-z][\w-]{0,29}$/.test(body.user) ? body.user : undefined,
    })
    return NextResponse.json(next)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "The AI call failed" }, { status: 502 })
  }
}
