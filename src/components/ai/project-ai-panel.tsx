"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Bot, KeyRound, Loader2, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react"

/**
 * The project's AI Provider tab: which model writes this project's bugs, test
 * cases and user stories, and the key it uses. Falls back to the workspace
 * provider when the project has none, so an empty panel is not an outage.
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
}

interface Effective {
  provider: string
  model: string
  inherited: boolean
}

export function ProjectAiPanel({ projectId }: { projectId: string }) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [effective, setEffective] = useState<Effective | null>(null)

  const [provider, setProvider] = useState("Kimi")
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [enabled, setEnabled] = useState(true)
  // Models reported by the key itself; preferred over the catalog fallback.
  const [detectedModels, setDetectedModels] = useState<string[] | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-config`)
      if (!res.ok) return
      const data = await res.json()
      setCatalog(data.catalog || [])
      setConfig(data.config)
      setEffective(data.effective)
      if (data.config) {
        setProvider(data.config.provider)
        setModel(data.config.model || "")
        setEnabled(data.config.enabled)
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const meta = catalog.find((c) => c.provider === provider)
  const modelOptions = detectedModels?.length ? detectedModels : meta?.models || []

  const handleTest = async () => {
    setTesting(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-config/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ...(apiKey ? { apiKey } : {}) }),
      })
      const data = await res.json()
      setNotice({ ok: !!data.ok, text: data.detail || (data.ok ? "Connected" : "Connection failed") })
      if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
        setDetectedModels(data.models)
        // Keep a stored model only if the key can actually call it.
        if (model && !data.models.includes(model)) setModel(data.models[0])
      }
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || "Connection failed" })
    } finally {
      setTesting(false)
    }
  }

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
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setNotice({ ok: false, text: data.error || "Could not save" })
        return
      }
      setApiKey("")
      setNotice({ ok: true, text: "Saved — this project now uses its own AI provider." })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    setNotice(null)
    try {
      await fetch(`/api/projects/${projectId}/ai-config`, { method: "DELETE" })
      setApiKey("")
      setDetectedModels(null)
      setNotice({ ok: true, text: "Removed — this project falls back to the workspace provider." })
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-card flex items-center gap-2 text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading AI provider…
      </div>
    )
  }

  return (
    <div className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-card space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Bot className="h-4.5 w-4.5 text-indigo-600" /> AI Provider
        </h2>
        <p className="text-[10px] text-slate-400 font-medium">
          The model that writes this project&apos;s bug reports, test cases and user stories.
          Leave it empty to use the workspace provider.
        </p>
      </div>

      {/*
        A stored key this server cannot decrypt. Called out on its own, above
        the status line, because it is the one failure that looks exactly like
        "no key was ever saved" — and the fix is on the host, not in this form.
      */}
      {config?.keyUnreadable && (
        <div className="rounded-xl border border-rose-100 bg-rose-50/70 px-3.5 py-3 text-[11px] font-semibold text-rose-800 space-y-1.5">
          <div className="flex items-center gap-2 font-extrabold">
            <AlertTriangle className="h-3.5 w-3.5" />
            This project&apos;s saved AI key can no longer be read
          </div>
          <p className="font-medium leading-relaxed">
            The key is still stored, but it was encrypted with a different
            <code className="mx-1 px-1 py-0.5 rounded bg-rose-100 font-mono text-[10px]">APP_ENCRYPTION_KEY</code>
            than this server holds. That happens when the variable is unset or regenerated on deploy —
            which is why the key appears to disappear each time. Pasting it in again fixes it only until
            the next deploy; setting a permanent <code className="font-mono text-[10px]">APP_ENCRYPTION_KEY</code>
            on the host fixes it for good.
          </p>
        </div>
      )}

      {/* What a generation in this project would use right now. */}
      <div
        className={`rounded-xl border px-3.5 py-2.5 text-[11px] font-bold flex items-center gap-2 ${
          effective
            ? "border-emerald-100 bg-emerald-50/60 text-emerald-800"
            : "border-amber-100 bg-amber-50/60 text-amber-800"
        }`}
      >
        {effective ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {effective ? (
          <span>
            Using {effective.provider}
            {effective.model ? ` · ${effective.model}` : ""}
            {effective.inherited ? " (inherited from the workspace)" : " (this project's key)"}
          </span>
        ) : (
          <span>
            No AI provider is reachable — generation falls back to rule-based templates.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground font-bold">Provider</Label>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value)
              setDetectedModels(null)
              setModel("")
            }}
            className="h-9 w-full rounded-lg border bg-background px-3 text-xs font-semibold"
          >
            {catalog.map((c) => (
              <option key={c.provider} value={c.provider}>
                {c.label}
              </option>
            ))}
          </select>
          {meta && <p className="text-[10px] text-slate-400 font-medium">{meta.docsHint}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground font-bold">Model</Label>
          {modelOptions.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 w-full rounded-lg border bg-background px-3 text-xs font-semibold"
            >
              <option value="">Provider default</option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model id"
              className="h-9 bg-background"
            />
          )}
          {detectedModels && (
            <p className="text-[10px] text-emerald-600 font-bold">
              {detectedModels.length} model(s) reported by this key
            </p>
          )}
        </div>
      </div>

      {!meta?.local && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground font-bold flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> API Key
            {config?.hasKey && (
              <span className="text-emerald-600 font-bold">· stored (encrypted)</span>
            )}
          </Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.hasKey ? "Leave blank to keep the stored key" : "Paste the API key…"}
            className="h-9 bg-background font-mono"
          />
          <p className="text-[10px] text-slate-400 font-medium">
            Encrypted before it is stored, and never shown again. Leave blank to use the
            server&apos;s environment key instead.
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Use this provider for the project
      </label>

      {notice && (
        <p className={`text-[11px] font-bold ${notice.ok ? "text-emerald-700" : "text-rose-600"}`}>
          {notice.text}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          onClick={handleTest}
          disabled={testing || (!apiKey && !config?.hasKey && !meta?.local)}
          variant="outline"
          className="h-9 px-4 font-bold"
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
        {config && (
          <Button
            onClick={handleClear}
            disabled={saving}
            variant="outline"
            className="h-9 px-4 font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        )}
      </div>
    </div>
  )
}
