"use client"

import { useCallback, useEffect, useState } from "react"
import { desktopBridge } from "@/lib/desktop"

export interface LocalAiState {
  /** Running inside the desktop app (the only place local AI can work). */
  inDesktop: boolean
  /** null while checking. */
  running: boolean | null
  models: string[]
  /** The model the user's requests use, or null when off. */
  model: string | null
  /** The user made a choice before (on or off). */
  decided: boolean
}

/** Picks a sensible default: a mid-size text model over tiny or vision ones. */
export function bestLocalModel(models: string[]): string | null {
  if (!models.length) return null
  const text = models.filter((m) => !/(vision|llava|embed|bakllava|moondream)/i.test(m))
  const pool = text.length ? text : models
  const size = (m: string) => Number(m.match(/:(\d+(?:\.\d+)?)b/i)?.[1] || 0)
  const preferred = pool.find((m) => /qwen|llama|mistral|gemma/i.test(m) && size(m) >= 3 && size(m) <= 14)
  return preferred || pool[0]
}

export async function saveLocalAi(model: string | null) {
  const res = await fetch("/api/me/local-ai", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  })
  if (!res.ok) throw new Error("Couldn't save")
}

/** Ollama on this computer + the user's saved choice. */
export function useLocalAi() {
  const ai = desktopBridge()?.ai
  const [state, setState] = useState<LocalAiState>({ inDesktop: !!ai, running: ai ? null : false, models: [], model: null, decided: false })

  const refresh = useCallback(async () => {
    const [s, me] = await Promise.all([
      ai ? ai.status().catch(() => ({ running: false, models: [] as string[] })) : Promise.resolve({ running: false, models: [] as string[] }),
      fetch("/api/me/local-ai").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
    setState({ inDesktop: !!ai, running: s.running, models: s.models, model: me?.model ?? null, decided: !!me?.decided })
  }, [ai])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setModel = useCallback(
    async (model: string | null) => {
      await saveLocalAi(model)
      await refresh()
    },
    [refresh]
  )

  return { ...state, refresh, setModel }
}
