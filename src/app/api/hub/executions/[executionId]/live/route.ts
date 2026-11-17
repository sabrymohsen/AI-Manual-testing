import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

// GET /api/hub/executions/{id}/live — Server-Sent Events stream of a live execution.
// Emits `log` events with incremental output chunks, then a final `done` event.
// (Next.js App Router routes cannot host raw WebSockets, so SSE is used instead.)
export async function GET(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const executionId = params.executionId
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      request.signal.addEventListener("abort", () => {
        closed = true
      })

      let sentLength = 0

      // Poll for up to ~15 minutes (600 ticks * 1.5s)
      for (let tick = 0; tick < 600 && !closed; tick++) {
        let execution
        try {
          execution = await prisma.testExecution.findUnique({ where: { id: executionId } })
        } catch (err: any) {
          send("error", { message: err.message })
          break
        }

        if (!execution) {
          send("error", { message: "Execution not found" })
          break
        }

        if (execution.logOutput.length > sentLength) {
          send("log", { chunk: execution.logOutput.slice(sentLength) })
          sentLength = execution.logOutput.length
        }

        if (execution.status !== "Running" && execution.status !== "Queued") {
          send("done", {
            execution: {
              id: execution.id,
              status: execution.status,
              duration: execution.duration,
              allureLink: execution.allureLink,
              screenshotPath: execution.screenshotPath,
              browser: execution.browser,
              createdAt: execution.createdAt
            }
          })
          break
        }

        await new Promise((r) => setTimeout(r, 1500))
      }

      try {
        controller.close()
      } catch {}
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  })
}
