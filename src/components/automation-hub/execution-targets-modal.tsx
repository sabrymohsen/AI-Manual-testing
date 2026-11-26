"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  X,
  Plus,
  Trash2,
  Server,
  Container,
  Grid3x3,
  Cloud,
  Monitor,
  Loader2,
  Wifi,
  CheckCircle2,
  XCircle,
  Star,
  Save
} from "@/components/ui/icons"

export interface ExecutionTarget {
  id: string
  name: string
  type: string
  url: string
  platform: string
  browser: string
  headless: boolean
  credentials: any
  isDefault: boolean
}

const TYPE_META: Record<string, { label: string; icon: any }> = {
  local: { label: "Local", icon: Monitor },
  docker: { label: "Docker", icon: Container },
  grid: { label: "Selenium Grid", icon: Grid3x3 },
  browserstack: { label: "BrowserStack", icon: Cloud }
}

const BLANK: Partial<ExecutionTarget> = {
  name: "",
  type: "grid",
  url: "",
  platform: "Linux",
  browser: "chrome",
  headless: true,
  isDefault: false
}

export default function ExecutionTargetsModal({
  open,
  onClose,
  onChange
}: {
  open: boolean
  onClose: () => void
  onChange: (targets: ExecutionTarget[]) => void
}) {
  const [targets, setTargets] = useState<ExecutionTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Partial<ExecutionTarget> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/hub/targets")
      if (res.ok) {
        const d = await res.json()
        setTargets(d.targets || [])
        onChange(d.targets || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const save = async () => {
    if (!draft?.name?.trim()) {
      setError("Name is required")
      return
    }
    if (draft.type !== "local" && !draft.url?.trim()) {
      setError("URL is required for remote targets")
      return
    }
    setSaving(true)
    setError("")
    try {
      const editing = Boolean(draft.id)
      const res = await fetch(editing ? `/api/hub/targets/${draft.id}` : "/api/hub/targets", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Failed to save target")
        return
      }
      setDraft(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/hub/targets/${id}`, { method: "DELETE" })
    await load()
  }

  const testConnection = async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/hub/targets/${id}/test-connection`, { method: "POST" })
      const d = await res.json()
      setTestResult((prev) => ({ ...prev, [id]: { ok: Boolean(d.reachable), msg: d.message || (d.reachable ? "Reachable" : "Unreachable") } }))
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: { ok: false, msg: "Request failed" } }))
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 text-left">
      <div className="bg-card rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Server size={15} className="text-primary" /> Manage execution targets
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground p-1">
            <X size={16} />
          </button>
        </div>

        {/* Target list */}
        {loading ? (
          <div className="py-12 flex justify-center">
            <BusyDot />
          </div>
        ) : targets.length === 0 ? (
          <p className="text-muted-foreground text-xs text-center py-6">
            No remote targets yet. Tests run locally by default — add Docker, Grid or BrowserStack below.
          </p>
        ) : (
          <div className="space-y-2">
            {targets.map((t) => {
              const Meta = TYPE_META[t.type] || TYPE_META.grid
              const test = testResult[t.id]
              return (
                <div key={t.id} className="border rounded-xl p-3 flex items-center gap-3 bg-muted/50">
                  <Meta.icon size={16} className="text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground truncate">{t.name}</span>
                      {t.isDefault && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold  bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-px">
                          <Star size={8} className="fill-current" /> Default
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground font-mono truncate block">
                      {Meta.label} · {t.url || "—"} · {t.platform} · {t.browser}
                      {t.headless ? " · headless" : ""}
                    </span>
                    {test && (
                      <span className={`text-xs font-semibold flex items-center gap-1 mt-0.5 ${test.ok ? "text-emerald-600" : "text-rose-600"}`}>
                        {test.ok ? <CheckCircle2 size={9} /> : <XCircle size={9} />} {test.msg}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => testConnection(t.id)}
                    disabled={testing === t.id}
                    title="Test connection"
                    className="p-2 rounded-lg border bg-card text-primary hover:bg-primary/10"
                  >
                    {testing === t.id ? <BusyDot /> : <Wifi size={12} />}
                  </button>
                  <button onClick={() => setDraft(t)} className="p-2 rounded-lg border bg-card text-muted-foreground hover:bg-muted text-xs font-semibold">
                    Edit
                  </button>
                  <button onClick={() => remove(t.id)} title="Delete" className="p-2 rounded-lg border bg-card text-rose-500 hover:bg-rose-50">
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add / edit form */}
        {draft ? (
          <div className="border-2 border-primary/25 rounded-xl p-4 space-y-3 bg-primary/10">
            <span className="text-xs font-medium text-muted-foreground">
              {draft.id ? "Edit target" : "New target"}
            </span>
            {error && <p className="text-rose-600 text-xs font-semibold bg-rose-50 border border-rose-100 rounded-lg p-2">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold  text-muted-foreground block">Name</span>
                <input
                  value={draft.name || ""}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. CI Grid"
                  className="w-full h-8 rounded-lg border px-3 text-xs bg-card font-semibold"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold  text-muted-foreground block">Type</span>
                <select
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                  className="w-full h-8 rounded-lg border px-2 text-xs bg-card font-semibold cursor-pointer"
                >
                  {Object.entries(TYPE_META).map(([v, m]) => (
                    <option key={v} value={v}>{m.label}</option>
                  ))}
                </select>
              </label>
              {draft.type !== "local" && (
                <label className="space-y-1 col-span-2">
                  <span className="text-xs font-semibold  text-muted-foreground block">Execution Address (URL)</span>
                  <input
                    value={draft.url || ""}
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                    placeholder="http://localhost:4444"
                    className="w-full h-8 rounded-lg border px-3 text-xs bg-card font-mono font-semibold"
                  />
                </label>
              )}
              <label className="space-y-1">
                <span className="text-xs font-semibold  text-muted-foreground block">Platform</span>
                <select
                  value={draft.platform}
                  onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
                  className="w-full h-8 rounded-lg border px-2 text-xs bg-card font-semibold cursor-pointer"
                >
                  {["Linux", "Windows", "Mac"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold  text-muted-foreground block">Browser</span>
                <select
                  value={draft.browser}
                  onChange={(e) => setDraft({ ...draft, browser: e.target.value })}
                  className="w-full h-8 rounded-lg border px-2 text-xs bg-card font-semibold cursor-pointer"
                >
                  {["chrome", "firefox", "edge", "safari"].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </label>
              {draft.type === "browserstack" && (
                <>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold  text-muted-foreground block">Username</span>
                    <input
                      value={draft.credentials?.username || ""}
                      onChange={(e) => setDraft({ ...draft, credentials: { ...draft.credentials, username: e.target.value } })}
                      className="w-full h-8 rounded-lg border px-3 text-xs bg-card font-semibold"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold  text-muted-foreground block">Access key</span>
                    <input
                      type="password"
                      value={draft.credentials?.accessKey || ""}
                      onChange={(e) => setDraft({ ...draft, credentials: { ...draft.credentials, accessKey: e.target.value } })}
                      className="w-full h-8 rounded-lg border px-3 text-xs bg-card font-semibold"
                    />
                  </label>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={Boolean(draft.headless)} onChange={(e) => setDraft({ ...draft, headless: e.target.checked })} />
                Headless
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={Boolean(draft.isDefault)} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
                Set as default
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={save}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-white rounded-xl h-8 px-4 text-xs font-semibold flex items-center gap-2"
              >
                {saving ? <BusyDot /> : <Save size={11} />} Save Target
              </Button>
              <Button
                onClick={() => { setDraft(null); setError("") }}
                variant="outline"
                className="rounded-xl h-8 px-4 text-xs font-semibold border-border text-muted-foreground bg-card"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => { setDraft({ ...BLANK }); setError("") }}
            variant="outline"
            className="w-full rounded-xl h-9 text-xs font-semibold border-dashed border-border text-muted-foreground bg-card flex items-center gap-2 justify-center"
          >
            <Plus size={13} /> Add execution target
          </Button>
        )}
      </div>
    </div>
  )
}
