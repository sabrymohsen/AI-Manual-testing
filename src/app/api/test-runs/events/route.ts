/**
 * GET /api/test-runs/events?projectId=…  — live test-run events (SSE).
 *
 * Scoped to ONE project, and only to a project the caller is a member of.
 *
 * It previously subscribed every caller to the whole "test-run-events" channel
 * and forwarded each message verbatim, so any signed-in user received the run
 * activity of every project on the deployment — ids, statuses, step payloads,
 * failure messages. The middleware authenticates the request but says nothing
 * about which project's data may be read, so the filtering has to happen here.
 *
 * Events carry a testRunId, not a projectId, so ownership is resolved per run
 * and memoised for the life of the connection: a run's project never changes,
 * and a stream watching one busy run would otherwise re-query on every step.
 * Runs that cannot be resolved are dropped rather than forwarded — failing
 * closed is the only safe direction for a leak of this shape.
 */
import { NextRequest, NextResponse } from "next/server"
import { createRedisClient } from "@/lib/queue"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required — this stream is scoped to one project" },
      { status: 400 }
    )
  }

  const auth = await requireProjectMember(projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const subClient = createRedisClient()

  // createRedisClient sets enableOfflineQueue:false, so a command issued before
  // the socket is up throws "Stream isn't writeable" instead of queueing. This
  // route subscribed immediately on construction and therefore ALWAYS threw —
  // the stream died mid-pipe and the client saw an empty response with no
  // status, which is why nothing in the app consumes this endpoint. Wait for
  // the connection, and fail with a real status code if it never arrives.
  try {
    if (subClient.status !== "ready") {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Redis connection timed out")), 5000)
        subClient.once("ready", () => {
          clearTimeout(timer)
          resolve()
        })
        subClient.once("error", (err) => {
          clearTimeout(timer)
          reject(err)
        })
      })
    }
    await subClient.subscribe("test-run-events")
  } catch (err: any) {
    try {
      await subClient.quit()
    } catch {}
    return NextResponse.json(
      { error: `Live updates are unavailable: ${err?.message || "Redis is unreachable"}` },
      { status: 503 }
    )
  }

  const responseHeaders = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let closed = false

      const sendEvent = (event: string, data: any) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Stream already torn down by the client; nothing to do.
        }
      }

      /** testRunId -> owning projectId. null means "resolved, and not ours". */
      const owner = new Map<string, string | null>()

      const belongsToProject = async (testRunId: string): Promise<boolean> => {
        if (owner.has(testRunId)) return owner.get(testRunId) === projectId
        try {
          const run = await prisma.testRun.findUnique({
            where: { id: testRunId },
            select: { projectId: true },
          })
          owner.set(testRunId, run?.projectId ?? null)
          return run?.projectId === projectId
        } catch {
          // Fail closed: an unresolvable run is not forwarded.
          owner.set(testRunId, null)
          return false
        }
      }

      subClient.on("message", (_channel, message) => {
        void (async () => {
          try {
            const parsed = JSON.parse(message)
            const testRunId: unknown = parsed?.testRunId
            if (typeof testRunId !== "string") return
            if (!(await belongsToProject(testRunId))) return
            sendEvent(parsed.event, parsed)
          } catch (e) {
            console.error("Error parsing Redis sub message:", e)
          }
        })()
      })

      sendEvent("connected", { status: "ready", projectId })

      const teardown = async () => {
        if (closed) return
        closed = true
        try {
          await subClient.unsubscribe()
          await subClient.quit()
        } catch {}
        try {
          controller.close()
        } catch {}
      }

      request.signal.addEventListener("abort", () => void teardown())
    },
    cancel() {
      try {
        subClient.unsubscribe()
        subClient.quit()
      } catch {}
    },
  })

  return new Response(stream, { headers: responseHeaders })
}
