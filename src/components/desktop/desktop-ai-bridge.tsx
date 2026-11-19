"use client"

import { useEffect } from "react"
import { io } from "socket.io-client"
import { desktopBridge } from "@/lib/desktop"

/**
 * Inside the desktop app: keeps a socket open so the server can run this
 * user's AI requests on Ollama on their computer (src/lib/ai/desktop-relay.ts).
 * Renders nothing; does nothing in a normal browser.
 */
export function DesktopAiBridge({ token }: { token: string }) {
  useEffect(() => {
    const ai = desktopBridge()?.ai
    if (!token || !ai) return

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001", {
      auth: { token },
      transports: ["websocket"],
      reconnectionDelay: 2000,
    })

    const announce = async () => {
      const s = await ai.status().catch(() => ({ running: false, models: [] as string[] }))
      socket.emit(s.running ? "desktop-ai:ready" : "desktop-ai:off", { models: s.models })
    }
    socket.on("connect", announce)
    // Ollama may be started (or a model added) while the app is open.
    const timer = setInterval(() => socket.connected && announce(), 30_000)

    socket.on("ai:relay", async (req: { path: string; body: unknown }, ack: (r: unknown) => void) => {
      if (req?.path !== "/api/chat") return ack({ ok: false, status: 400, data: { error: "unsupported" } })
      ack(await ai.chat(req.body).catch((e) => ({ ok: false, status: 503, data: { error: String(e?.message || e) } })))
    })

    return () => {
      clearInterval(timer)
      socket.disconnect()
    }
  }, [token])

  return null
}
