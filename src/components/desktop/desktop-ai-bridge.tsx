"use client"

import { useEffect } from "react"
import { io } from "socket.io-client"
import { toast } from "sonner"
import { desktopBridge } from "@/lib/desktop"
import { bestLocalModel, saveLocalAi } from "@/components/desktop/use-local-ai"

/**
 * Inside the desktop app: keeps a socket open so the server can run this
 * user's AI requests on Ollama on their computer (src/lib/ai/desktop-relay.ts).
 * Finding Ollama with a model turns "AI on this computer" on by itself, unless
 * the user turned it off before. Renders nothing; does nothing in a browser.
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

    // Detect Ollama automatically (once per app start).
    let detected = false
    const autoDetect = async () => {
      if (detected) return
      const s = await ai.status().catch(() => ({ running: false, models: [] as string[] }))
      const best = bestLocalModel(s.models)
      if (!s.running || !best) return
      detected = true
      const me = await fetch("/api/me/local-ai").then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (!me) return
      if (!me.decided) {
        await saveLocalAi(best).catch(() => {})
        toast.success(`Found Ollama on this computer — your AI now runs on it (${best})`, {
          description: "Free and private. Change the model or turn it off in Profile → AI.",
          action: { label: "Settings", onClick: () => (window.location.href = "/profile?tab=ai") },
        })
      } else if (me.model && !s.models.includes(me.model)) {
        await saveLocalAi(best).catch(() => {})
        toast(`${me.model} isn't installed any more — switched to ${best}`)
      }
    }
    autoDetect()
    // Ollama may be started (or a model added) while the app is open.
    const timer = setInterval(() => {
      if (socket.connected) announce()
      autoDetect()
    }, 30_000)

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
