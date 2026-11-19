"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckCircle2, Cpu, Download, Loader2, RefreshCw, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { desktopBridge } from "@/lib/desktop"
import { DesktopDownloads } from "@/components/auth/desktop-downloads"

const SUGGESTED = [
  { name: "llama3.2:3b", size: "2 GB", note: "Fast, works on most laptops (8 GB RAM)" },
  { name: "qwen2.5:7b", size: "4.7 GB", note: "Better answers, Arabic + English (16 GB RAM)" },
  { name: "qwen2.5:14b", size: "9 GB", note: "Best quality, needs 32 GB RAM" },
]

const gb = (n?: number) => (n ? `${(n / 1e9).toFixed(1)} GB` : "")

/**
 * Profile → AI: run your AI requests on Ollama on your own computer (desktop
 * app), with install/download help, or use the project's API key instead.
 */
export function LocalAiPanel() {
  const desktop = desktopBridge()
  const ai = desktop?.ai
  const [local, setLocal] = useState<{ running: boolean; models: string[] } | null>(null)
  const [saved, setSaved] = useState<{ model: string | null; connected: boolean } | null>(null)
  const [pick, setPick] = useState("")
  const [pulling, setPulling] = useState<{ model: string; status: string; completed?: number; total?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState("")

  const refresh = useCallback(async () => {
    const [s, me] = await Promise.all([
      ai ? ai.status().catch(() => ({ running: false, models: [] })) : Promise.resolve(null),
      fetch("/api/me/local-ai").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
    setLocal(s)
    if (me) setSaved({ model: me.model, connected: me.connected })
    setPick((p) => p || me?.model || s?.models[0] || "")
  }, [ai])

  useEffect(() => {
    refresh()
    desktop?.version?.().then(setVersion).catch(() => {})
  }, [refresh, desktop])

  useEffect(() => {
    if (!ai) return
    return ai.onPullProgress((p) => setPulling({ model: p.model, status: p.status || "", completed: p.completed, total: p.total }))
  }, [ai])

  async function save(model: string | null) {
    setBusy(true)
    try {
      const res = await fetch("/api/me/local-ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      })
      if (!res.ok) throw new Error("Couldn't save")
      toast.success(model ? `Your AI requests now run on this computer (${model})` : "AI on this computer is off")
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function download(model: string) {
    if (!ai) return
    setPulling({ model, status: "starting" })
    const r = await ai.pull(model)
    setPulling(null)
    if (!r.ok) return toast.error(r.error || "Download failed")
    toast.success(`${model} is ready`)
    setPick(model)
    refresh()
  }

  const card = "space-y-3 rounded-xl border bg-card p-6"

  if (!ai) {
    return (
      <div className={card}>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Cpu className="h-4 w-4" /> AI on your computer
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Run AI for free on your own computer with Ollama. This works in the QA Engine desktop app, which connects your computer&apos;s AI to
          this site.
        </p>
        {saved?.model && (
          <p className="text-[13px]">
            On: <b>{saved.model}</b> — used whenever your desktop app is open
            {saved.connected ? " (open now)." : " (not open right now)."}{" "}
            <button className="text-primary hover:underline" onClick={() => save(null)} disabled={busy}>
              Turn off
            </button>
          </p>
        )}
        <DesktopDownloads />
        <p className="text-xs text-muted-foreground">
          Prefer a cloud AI? Add an API key (Kimi, OpenAI, Anthropic, Gemini…) in your project&apos;s{" "}
          <Link href="/projects" className="text-primary hover:underline">
            AI tab
          </Link>
          .
        </p>
      </div>
    )
  }

  const models = local?.models ?? []
  const on = !!saved?.model

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4" /> AI on this computer
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Free and private: your AI requests run on Ollama here while this app is open. When it&apos;s closed, the project&apos;s API key
              is used instead (if it has one).
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} title="Check again">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Step 1 — Ollama */}
        {local === null ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for Ollama…
          </p>
        ) : !local.running ? (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="flex items-center gap-2 text-[13px] font-medium">
              <XCircle className="h-4 w-4 text-amber-500" /> Ollama isn&apos;t running on this computer
            </p>
            <ol className="list-decimal space-y-0.5 ps-5 text-xs text-muted-foreground">
              <li>Download and install Ollama (free).</li>
              <li>Open the Ollama app once so it runs in the background.</li>
              <li>Come back here and click Check again.</li>
            </ol>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => ai.openDownload()}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download Ollama
              </Button>
              <Button size="sm" variant="outline" onClick={refresh}>
                Check again
              </Button>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[13px]">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Ollama is running · {models.length} model{models.length === 1 ? "" : "s"}
          </p>
        )}

        {/* Step 2 — a model */}
        {local?.running && (
          <div className="space-y-2">
            <p className="text-xs font-medium">{models.length ? "Download another model" : "Download a model to start"}</p>
            <div className="space-y-1.5">
              {SUGGESTED.map((m) => {
                const have = models.includes(m.name)
                const active = pulling?.model === m.name
                const pct = active && pulling?.total ? Math.round(((pulling.completed || 0) / pulling.total) * 100) : null
                return (
                  <div key={m.name} className="flex items-center gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">
                        {m.name} <span className="font-normal text-muted-foreground">· {m.size}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">{m.note}</p>
                      {active && (
                        <div className="mt-1.5 space-y-1">
                          <div className="h-1.5 overflow-hidden rounded bg-muted">
                            <div className="h-full bg-primary transition-all" style={{ width: `${pct ?? 5}%` }} />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {pulling?.status} {pct !== null ? `· ${pct}% (${gb(pulling?.completed)} of ${gb(pulling?.total)})` : ""}
                          </p>
                        </div>
                      )}
                    </div>
                    {have ? (
                      <span className="text-[11px] font-medium text-emerald-600">Installed</span>
                    ) : (
                      <Button size="sm" variant="outline" disabled={!!pulling} onClick={() => download(m.name)}>
                        {active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Download"}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 3 — use it */}
        {local?.running && models.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <label className="text-xs font-medium" htmlFor="local-ai-model">
              Model for my AI requests
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="local-ai-model"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-[13px]"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={busy || !pick || (on && saved?.model === pick)} onClick={() => save(pick)}>
                {on ? "Switch model" : "Use AI on this computer"}
              </Button>
              {on && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => save(null)}>
                  Turn off
                </Button>
              )}
            </div>
            {on && (
              <p className="text-xs text-muted-foreground">
                On: <b>{saved?.model}</b> {saved?.connected ? "· connected" : "· connecting… (refresh in a few seconds)"}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={card}>
        <h3 className="text-sm font-semibold">Desktop app</h3>
        <p className="text-xs text-muted-foreground">
          Version {version || "…"}. The app checks for new versions on its own; you can also check now.
        </p>
        <Button size="sm" variant="outline" onClick={() => desktop?.checkForUpdate?.()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Check for updates
        </Button>
      </div>
    </div>
  )
}
