import { NextRequest } from "next/server"
import { createRedisClient } from "@/lib/queue"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const subClient = createRedisClient()
  
  // Set up standard headers for SSE stream
  const responseHeaders = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      // Function to send event down the stream
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Handle message from Redis pub/sub channel
      subClient.on("message", (channel, message) => {
        try {
          const parsed = JSON.parse(message)
          sendEvent(parsed.event, parsed)
        } catch (e) {
          console.error("Error parsing Redis sub message:", e)
        }
      })

      // Subscribe to Redis channel
      await subClient.subscribe("test-run-events")
      console.log("[SSE] Client subscribed to test-run-events channel")

      // Send initial heartbeat to establish connection
      sendEvent("connected", { status: "ready" })

      // Handle client disconnect / stream close
      request.signal.addEventListener("abort", async () => {
        console.log("[SSE] Client disconnected. Unsubscribing...")
        try {
          await subClient.unsubscribe()
          await subClient.quit()
        } catch (err) {}
        controller.close()
      })
    },
    cancel() {
      try {
        subClient.unsubscribe()
        subClient.quit()
      } catch (err) {}
    },
  })

  return new Response(stream, { headers: responseHeaders })
}
