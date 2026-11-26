"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Bot, KeyRound, Loader2, CheckCircle2, AlertTriangle, Trash2, Lock, Server, ExternalLink, Cpu } from "@/components/ui/icons"
import { useLocalAi, bestLocalModel } from "@/components/desktop/use-local-ai"

/**
 * The project's AI Provider tab: which model writes this project's bugs, test
 * cases and user stories, and the key it uses. Falls back to the workspace
 * provider when the project has none, so an empty panel is not an outage.
 *
 * Ollama needs no key but does need an address the SERVER can reach: on a
 * hosted deployment "localhost" is the server, not the tester's computer.
 */

interface CatalogEntry {
  provider: string
  label: string
  models: string[]
  local: boolean
  docsHint: string
}

interface Config {
  provider: string
  enabled: boolean
  model: string
  hasKey: boolean
  /** A key is stored but this server can no longer decrypt it. */
  keyUnreadable?: boolean
  /** Ollama only: this project's server address ("" = default). */
  baseUrl?: string
}

interface Effective {
  provider: string
  model: string
  inherited: boolean
}

export function ProjectAiPanel({ projectId, canManage = true }: { projectId: string; canManage?: boolean }) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [effective, setEffective] = useState<Effective | null>(null)
  const [ollamaDefaultUrl, setOllamaDefaultUrl] = useState("http://localhost:11434")

  const [provider, setProvider] = useState("Kimi")
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [enabled, setEnabled] = useState(true)
  // Models reported by the key / installed in Ollama; preferred over the catalog fallback.
  const [detectedModels, setDetectedModels] = useState<string[] | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  // Ollama on THIS computer (desktop app only) — found automatically.
  const local = useLocalAi()
  const localFound = local.inDesktop && local.running === true && local.models.length > 0

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-config`)
      if (!res.ok) {
        setLoadFailed(true)
        return
      }
      const data = await res.json()
      setCatalog(data.catalog || [])
      setConfig(data.config)
      setEffective(data.effective)
      if (data.ollamaDefaultUrl) setOllamaDefaultUrl(data.ollamaDefaultUrl)
      if (data.config) {
        setProvider(data.config.provider)
        setModel(data.config.model || "")
        setEnabled(data.config.enabled)
        setBaseUrl(data.config.baseUrl || "")
      } else if (data.effective?.provider) {
        // Nothing of its own: start the picker on what the project already uses.
        setProvider(data.effective.provider)
        setModel("")
      }
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const meta = catalog.find((c) => c.provider === provider)
  const isOllama = provider === "Ollama"
  // Never offer Ollama's catalog list: it may name models that aren't installed.
  const modelOptions = detectedModels?.length ? detectedModels : isOllama ? [] : meta?.models || []

  const handleTest = useCallback(
    async (quiet = false) => {
      setTesting(true)
      if (!quiet) setNotice(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/ai-config/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            ...(apiKey ? { apiKey } : {}),
            ...(provider === "Ollama" && baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!quiet || !data.ok) {
          setNotice({ ok: !!data.ok, text: data.detail || data.error || (data.ok ? "Connected" : "Connection failed") })
        }
        if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
          setDetectedModels(data.models)
          // Keep a stored model only if it can actually be called.
          setModel((m) => (m && !data.models.includes(m) ? data.models[0] : m))
        } else if (provider === "Ollama") {
          setDetectedModels([])
        }
      } catch (err: any) {
        setNotice({ ok: false, text: err?.message || "Connection failed" })
      } finally {
        setTesting(false)
      }
    },
    [projectId, provider, apiKey, baseUrl]
  )

  // Ollama: read the installed models as soon as it's picked, so the model list
  // is real without pressing "Test connection" first.
  const autoTested = useRef<string | null>(null)
  useEffect(() => {
    if (loading || !canManage || !isOllama) return
    if (localFound && !(config?.baseUrl || baseUrl.trim())) return
    const key = `${provider}|${config?.baseUrl ?? ""}`
    if (autoTested.current === key) return
    autoTested.current = key
    handleTest(true)
  }, [loading, canManage, isOllama, provider, config?.baseUrl, baseUrl, localFound, handleTest])

  const handleSave = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          enabled,
          model,
          // Omit the key when the field is untouched so the stored one survives.
          ...(apiKey ? { apiKey } : {}),
          ...(isOllama ? { baseUrl: baseUrl.trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice({ ok: false, text: data.error || "Couldn't save" })
        return
      }
      setApiKey("")
      setNotice({ ok: true, text: "Saved. This project now uses its own AI provider." })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-config`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setNotice({ ok: false, text: data.error || "Couldn't remove the project's AI provider" })
        return
      }
      setApiKey("")
      setBaseUrl("")
      setDetectedModels(null)
      autoTested.current = null
      setNotice({ ok: true, text: "Removed. This project now uses the workspace provider." })
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 border border-border shadow-sm rounded-xl bg-card flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading AI provider…
      </div>
    )
  }

  if (loadFailed) {
    return (
      <div className="p-6 border border-border shadow-sm rounded-xl bg-card flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Couldn&apos;t load the AI provider settings.
        </span>
        <Button size="sm" variant="outline" onClick={load}>
          Try again
        </Button>
      </div>
    )
  }

  const statusLine = (
    <div
      className={`rounded-xl border px-3 py-3 text-xs font-medium flex items-center gap-2 ${
        effective
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      }`}
    >
      {effective ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
      {effective ? (
        <span>
          Using {effective.provider}
          {effective.model ? ` · ${effective.model}` : ""}
          {effective.inherited ? " (the workspace default)" : " (this project's own setting)"}
        </span>
      ) : (
        <span>
          {localFound && local.model
            ? "No shared provider for this project: your requests use Ollama on this computer; teammates without it get simple built-in templates."
            : "No AI provider is set up, so generation uses simple built-in templates."}
        </span>
      )}
    </div>
  )

  return (
    <div className="p-6 border border-border shadow-sm rounded-xl bg-card space-y-6 text-xs">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Bot className="h-[18px] w-[18px] text-primary" /> AI provider
        </h2>
        <p className="text-muted-foreground">
          The model that writes this project&apos;s bug reports, test cases and user stories.
          Leave it unset to use the workspace provider.
        </p>
      </div>

      {/*
        A stored key this server cannot decrypt. Called out on its own, above
        the status line, because it is the one failure that looks exactly like
        "no key was ever saved" — and the fix is on the host, not in this form.
      */}
      {config?.keyUnreadable && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-destructive space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            This project&apos;s saved AI key can no longer be read
          </div>
          <p className="leading-relaxed">
            The key is still stored, but it was encrypted with a different
            <code className="mx-1 px-1 py-0.5 rounded bg-destructive/10 font-mono text-xs">APP_ENCRYPTION_KEY</code>
            than this server holds. That happens when the variable is unset or regenerated on deploy,
            which is why the key seems to disappear after each one. Pasting it again only lasts until the
            next deploy; setting a permanent <code className="font-mono text-xs">APP_ENCRYPTION_KEY</code>
            on the host fixes it for good.
          </p>
        </div>
      )}

      {localFound && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 space-y-2">
          <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <Cpu className="h-3.5 w-3.5" /> Ollama found on this computer · {local.models.length} model
            {local.models.length === 1 ? "" : "s"}
          </p>
          {local.model ? (
            <p className="text-muted-foreground">
              Your AI requests in every project run on it while this app is open — free and private. Nothing to set up here.
            </p>
          ) : (
            <p className="text-muted-foreground">
              {local.decided ? "You turned it off." : "Not in use yet."} Turn it on to run your AI requests on this computer for free.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Model on this computer"
              value={local.model || ""}
              onChange={(e) => local.setModel(e.target.value || null)}
              className="h-8 rounded-lg border bg-background px-2 text-xs"
            >
              <option value="">Off</option>
              {local.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {!local.model && (
              <Button size="sm" className="h-8" onClick={() => local.setModel(bestLocalModel(local.models))}>
                Use it
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Teammates without the desktop app (or with it closed) use the provider below.
          </p>
        </div>
      )}

      {statusLine}

      {!canManage ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Only the project&apos;s owner and admins can change the AI provider.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ai-provider" className="text-muted-foreground">Provider</Label>
              <select
                id="ai-provider"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value)
                  setDetectedModels(null)
                  setModel("")
                  setNotice(null)
                }}
                className="h-9 w-full rounded-lg border bg-background px-3 text-xs"
              >
                {catalog.map((c) => (
                  <option key={c.provider} value={c.provider}>
                    {c.label}
                  </option>
                ))}
              </select>
              {meta && <p className="text-xs text-muted-foreground">{meta.docsHint}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-model" className="text-muted-foreground">Model</Label>
              {modelOptions.length > 0 ? (
                <select
                  id="ai-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-9 w-full rounded-lg border bg-background px-3 text-xs"
                >
                  <option value="">{isOllama ? "First installed model" : "Provider default"}</option>
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="ai-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={isOllama ? (testing ? "Checking installed models…" : "e.g. qwen3:8b") : "Model id"}
                  className="h-9 bg-background"
                />
              )}
              {detectedModels && detectedModels.length > 0 && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {isOllama
                    ? `${detectedModels.length} model(s) installed in Ollama`
                    : `${detectedModels.length} model(s) available to this key`}
                </p>
              )}
            </div>
          </div>

          {isOllama && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="ollama-url" className="text-muted-foreground flex items-center gap-2">
                  <Server className="h-3.5 w-3.5" /> Ollama address
                </Label>
                <Input
                  id="ollama-url"
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value)
                    setDetectedModels(null)
                  }}
                  placeholder={ollamaDefaultUrl}
                  className="h-9 bg-background font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  {localFound
                    ? "You don't need this for your own Ollama: it's already used through the desktop app (see above). Only fill this in for a shared Ollama server the whole team can reach."
                    : `Leave empty to use ${ollamaDefaultUrl}. The address must be reachable from the machine this app runs on. On a hosted app, "localhost" is the server, not your computer — use the desktop app to use Ollama on your computer.`}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 px-3 py-3 space-y-2">
                <p className="font-medium text-foreground">Setting up Ollama</p>
                <ol className="list-decimal pl-6 space-y-1 text-muted-foreground">
                  <li>
                    Download and install Ollama from{" "}
                    <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                      ollama.com/download <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    and open it, so it&apos;s running.
                  </li>
                  <li>
                    Download a model in a terminal: <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">ollama pull qwen3:8b</code>{" "}
                    (about 5 GB; <code className="font-mono text-xs">llama3.2</code> is smaller).
                  </li>
                  <li>
                    If this app runs on a server, make your Ollama reachable from it (for example through a tunnel) and
                    enter that address above.
                  </li>
                  <li>Press &quot;Test connection&quot;, pick a model and save.</li>
                </ol>
              </div>
            </div>
          )}

          {!meta?.local && (
            <div className="space-y-2">
              <Label htmlFor="ai-key" className="text-muted-foreground flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5" /> API key
                {config?.hasKey && config.provider === provider && (
                  <span className="text-emerald-700 dark:text-emerald-400 font-normal">· saved (encrypted)</span>
                )}
              </Label>
              <Input
                id="ai-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={config?.hasKey && config.provider === provider ? "Leave blank to keep the saved key" : "Paste the API key…"}
                className="h-9 bg-background font-mono"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Encrypted before it&apos;s stored and never shown again. Leave blank to use the
                server&apos;s environment key instead.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-3.5 w-3.5" />
            Use this provider for the project
          </label>

          {notice && (
            <p
              role="status"
              className={`leading-relaxed ${notice.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
            >
              {notice.text}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleSave} disabled={saving} className="h-9 px-4">
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              onClick={() => handleTest(false)}
              disabled={testing || (!apiKey && !config?.hasKey && !meta?.local)}
              variant="outline"
              className="h-9 px-4"
            >
              {testing ? "Testing…" : "Test connection"}
            </Button>
            {config && (
              <Button
                onClick={handleClear}
                disabled={saving}
                variant="outline"
                className="h-9 px-4 text-destructive hover:text-destructive flex items-center gap-2"
              >
                <Trash2 className="h-3.5 w-3.5" /> Use workspace default
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
