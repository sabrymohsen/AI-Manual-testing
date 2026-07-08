"use client"

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
} from "lucide-react"

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
      <div className="bg-white rounded-3xl border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between border-b pb-2.5">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Server size={15} className="text-indigo-600" /> Manage Execution Targets
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={16} />
          </button>
        </div>

        {/* Target list */}
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 size={20} className="animate-spin text-indigo-600" />
          </div>
        ) : targets.length === 0 ? (
          <p className="text-slate-400 italic text-[10px] text-center py-6">
            No remote targets yet. Tests run locally by default — add Docker, Grid or BrowserStack below.
          </p>
        ) : (
          <div className="space-y-2">
            {targets.map((t) => {
              const Meta = TYPE_META[t.type] || TYPE_META.grid
              const test = testResult[t.id]
              return (
                <div key={t.id} className="border rounded-2xl p-3 flex items-center gap-3 bg-slate-50">
                  <Meta.icon size={16} className="text-indigo-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-[11px] text-slate-900 truncate">{t.name}</span>
                      {t.isDefault && (
                        <span className="inline-flex items-center gap-0.5 text-[7.5px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5 py-px">
                          <Star size={8} className="fill-current" /> Default
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-bold text-slate-500 font-mono truncate block">
                      {Meta.label} · {t.url || "—"} · {t.platform} · {t.browser}
                      {t.headless ? " · headless" : ""}
                    </span>
                    {test && (
                      <span className={`text-[8.5px] font-bold flex items-center gap-1 mt-0.5 ${test.ok ? "text-emerald-600" : "text-rose-600"}`}>
                        {test.ok ? <CheckCircle2 size={9} /> : <XCircle size={9} />} {test.msg}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => testConnection(t.id)}
                    disabled={testing === t.id}
                    title="Test connection"
                    className="p-2 rounded-lg border bg-white text-indigo-600 hover:bg-indigo-50"
                  >
                    {testing === t.id ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
                  </button>
                  <button onClick={() => setDraft(t)} className="p-2 rounded-lg border bg-white text-slate-500 hover:bg-slate-100 text-[9px] font-black">
                    Edit
                  </button>
                  <button onClick={() => remove(t.id)} title="Delete" className="p-2 rounded-lg border bg-white text-rose-500 hover:bg-rose-50">
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add / edit form */}
        {draft ? (
          <div className="border-2 border-indigo-100 rounded-2xl p-4 space-y-3 bg-indigo-50/30">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
              {draft.id ? "Edit target" : "New target"}
            </span>
            {error && <p className="text-rose-600 text-[10px] font-bold bg-rose-50 border border-rose-100 rounded-lg p-2">{error}</p>}
            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1">
                <span className="text-[8.5px] font-black uppercase text-slate-500 block">Name</span>
                <input
                  value={draft.name || ""}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. CI Grid"
                  className="w-full h-8 rounded-lg border px-2.5 text-[10px] bg-white font-semibold"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[8.5px] font-black uppercase text-slate-500 block">Type</span>
                <select
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                  className="w-full h-8 rounded-lg border px-2 text-[10px] bg-white font-bold cursor-pointer"
                >
                  {Object.entries(TYPE_META).map(([v, m]) => (
                    <option key={v} value={v}>{m.label}</option>
                  ))}
                </select>
              </label>
              {draft.type !== "local" && (
                <label className="space-y-1 col-span-2">
                  <span className="text-[8.5px] font-black uppercase text-slate-500 block">Execution Address (URL)</span>
                  <input
                    value={draft.url || ""}
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                    placeholder="http://localhost:4444"
                    className="w-full h-8 rounded-lg border px-2.5 text-[10px] bg-white font-mono font-semibold"
                  />
                </label>
              )}
              <label className="space-y-1">
                <span className="text-[8.5px] font-black uppercase text-slate-500 block">Platform</span>
                <select
                  value={draft.platform}
                  onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
                  className="w-full h-8 rounded-lg border px-2 text-[10px] bg-white font-bold cursor-pointer"
                >
                  {["Linux", "Windows", "Mac"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[8.5px] font-black uppercase text-slate-500 block">Browser</span>
                <select
                  value={draft.browser}
                  onChange={(e) => setDraft({ ...draft, browser: e.target.value })}
                  className="w-full h-8 rounded-lg border px-2 text-[10px] bg-white font-bold cursor-pointer"
                >
                  {["chrome", "firefox", "edge", "safari"].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </label>
              {draft.type === "browserstack" && (
                <>
                  <label className="space-y-1">
                    <span className="text-[8.5px] font-black uppercase text-slate-500 block">Username</span>
                    <input
                      value={draft.credentials?.username || ""}
                      onChange={(e) => setDraft({ ...draft, credentials: { ...draft.credentials, username: e.target.value } })}
                      className="w-full h-8 rounded-lg border px-2.5 text-[10px] bg-white font-semibold"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[8.5px] font-black uppercase text-slate-500 block">Access Key</span>
                    <input
                      type="password"
                      value={draft.credentials?.accessKey || ""}
                      onChange={(e) => setDraft({ ...draft, credentials: { ...draft.credentials, accessKey: e.target.value } })}
                      className="w-full h-8 rounded-lg border px-2.5 text-[10px] bg-white font-semibold"
                    />
                  </label>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[9.5px] font-bold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={Boolean(draft.headless)} onChange={(e) => setDraft({ ...draft, headless: e.target.checked })} />
                Headless
              </label>
              <label className="flex items-center gap-1.5 text-[9.5px] font-bold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={Boolean(draft.isDefault)} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
                Set as default
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={save}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-8 px-4 text-[10px] font-black flex items-center gap-1.5"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save Target
              </Button>
              <Button
                onClick={() => { setDraft(null); setError("") }}
                variant="outline"
                className="rounded-xl h-8 px-4 text-[10px] font-black border-slate-200 text-slate-600 bg-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => { setDraft({ ...BLANK }); setError("") }}
            variant="outline"
            className="w-full rounded-xl h-9 text-[10px] font-black border-dashed border-slate-300 text-slate-600 bg-white flex items-center gap-1.5 justify-center"
          >
            <Plus size={13} /> Add Execution Target
          </Button>
        )}
      </div>
    </div>
  )
}
