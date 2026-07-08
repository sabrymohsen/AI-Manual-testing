import { NextRequest } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { LOG4J_PATH, stripAnsi } from "@/lib/hub-logs"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/logs/stream?offset=N
// Server-Sent Events tail of target/logs/log4j.log. Starts at byte `offset`
// (the client passes the size it already loaded) and pushes appended lines as
// SHAFT writes them, non-blocking. Chosen over WebSockets because the Next.js
// App Router has no raw-socket host; SSE gives the same live push over HTTP.
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  let offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset")) || 0)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let closed = false
      const send = (event: string, data: string) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
      }

      const poll = () => {
        if (closed) return
        try {
          if (!fs.existsSync(LOG4J_PATH)) return
          const size = fs.statSync(LOG4J_PATH).size
          if (size < offset) {
            // File rotated / truncated — replay from the top.
            offset = 0
            send("reset", "1")
          }
          if (size > offset) {
            const fd = fs.openSync(LOG4J_PATH, "r")
            const length = size - offset
            const buffer = Buffer.alloc(length)
            fs.readSync(fd, buffer, 0, length, offset)
            fs.closeSync(fd)
            offset = size
            // JSON-encode so embedded newlines survive the SSE framing.
            send("append", JSON.stringify(stripAnsi(buffer.toString("utf8"))))
          }
        } catch {
          // transient fs errors (mid-write) — retry on next tick
        }
      }

      const interval = setInterval(poll, 1000)
      // Heartbeat keeps intermediaries from closing an idle connection.
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"))
      }, 25000)

      send("ready", String(offset))

      request.signal.addEventListener("abort", () => {
        closed = true
        clearInterval(interval)
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {}
      })
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  })
}
