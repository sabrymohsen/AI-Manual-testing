import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"
import { recorderWorkerRequest, RecorderWorkerError } from "@/lib/recording/worker-client"

function workerErrorResponse(err: unknown) {
  if (err instanceof RecorderWorkerError) {
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
        details: err.details,
        troubleshooting: err.code === "WORKER_OFFLINE" ? "Start the recorder worker: npm run recorder-worker" : undefined,
      },
      { status: err.status || 503 }
    )
  }
  const message = err instanceof Error ? err.message : "Picker operation failed"
  return NextResponse.json({ error: message }, { status: 500 })
}

// POST /api/picker/start  |  POST /api/picker/[sessionId]/[action]
export async function POST(request: Request, { params }: { params: { path: string[] } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const path = params.path || []

  // Start a session — verify the caller owns the target project.
  if (path.length === 1 && path[0] === "start") {
    const body = await request.json()
    if (!body?.projectId || !body?.url) return badRequestResponse("projectId and url are required")
    const owner = await requireProjectMember(body.projectId)
    if (owner.error) return unauthorizedResponse(owner.error)
    try {
      const state = await recorderWorkerRequest("/picker/start", { method: "POST", body: JSON.stringify(body) })
      return NextResponse.json(state, { status: 201 })
    } catch (err) {
      return workerErrorResponse(err)
    }
  }

  // Session actions: [sessionId]/[action]
  if (path.length === 2) {
    const [sessionId, action] = path
    let body: any = {}
    try {
      body = await request.json()
    } catch {}
    try {
      const result = await recorderWorkerRequest(`/picker/${sessionId}/${action}`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      })
      return NextResponse.json(result)
    } catch (err) {
      return workerErrorResponse(err)
    }
  }

  return NextResponse.json({ error: "Invalid picker endpoint" }, { status: 400 })
}

// GET /api/picker/[sessionId]/elements
export async function GET(_request: Request, { params }: { params: { path: string[] } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const path = params.path || []
  if (path.length === 2 && path[1] === "elements") {
    try {
      const state = await recorderWorkerRequest(`/picker/${path[0]}/elements`, { method: "GET" })
      return NextResponse.json(state)
    } catch (err) {
      return workerErrorResponse(err)
    }
  }

  return NextResponse.json({ error: "Invalid picker endpoint" }, { status: 400 })
}
