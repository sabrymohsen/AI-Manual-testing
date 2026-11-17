"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Settings,
  Server,
  Lock,
  ListRestart,
  Database,
  ScrollText,
  Search,
  Save,
  Download,
  Upload,
  RotateCcw,
  History,
  Loader2,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Pause,
  Play
} from "lucide-react"
import { Button } from "@/components/ui/button"
import TestDataManager from "@/components/automation-hub/test-data-manager"

// ---------- Types ----------
type SubTab = "Properties" | "Environment" | "Test Data" | "Secrets" | "Logs"

interface PropertyRow {
  name: string
  group: string
  type: "boolean" | "number" | "string" | "enum"
  description: string
  options: string[] | null
  min: number | null
  max: number | null
  default: string
  value: string
  isCustom: boolean
}

interface HistoryRow {
  id: string
  propertyName: string
  oldValue: string
  newValue: string
  changedBy: string
  changedAt: string
}

interface EnvRow {
  id: string
  name: string
  value: string | null
  masked: boolean
  scope: string
  isSecret: boolean
  projectId: string | null
  liveInProcess: boolean
  updatedAt: string
}

interface AuditRow {
  id: string
  action: string
  details: string
  user: string
  createdAt: string
}

interface ScriptRef {
  id: string
  name: string
  type: string
}

const GROUPS = ["Browser", "Execution", "Synchronization", "Evidence", "Healing", "AI", "Other"] as const

const GROUP_STYLES: Record<string, string> = {
  Browser: "bg-blue-50 text-blue-700 border-blue-100",
  Execution: "bg-violet-50 text-violet-700 border-violet-100",
  Synchronization: "bg-amber-50 text-amber-700 border-amber-100",
  Evidence: "bg-emerald-50 text-emerald-700 border-emerald-100",
  Healing: "bg-teal-50 text-teal-700 border-teal-100",
  AI: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
  Other: "bg-slate-100 text-slate-600 border-slate-200"
}

const LOG_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"] as const
type LogLevel = (typeof LOG_LEVELS)[number]

const LEVEL_STYLES: Record<LogLevel, string> = {
  TRACE: "text-slate-400",
  DEBUG: "text-sky-500",
  INFO: "text-emerald-500",
  WARN: "text-amber-500",
  ERROR: "text-rose-500"
}

export default function DataConfigSection() {
  const [subTab, setSubTab] = useState<SubTab>("Properties")

  const tabs: { id: SubTab; label: string; icon: any }[] = [
    { id: "Properties", label: "Properties", icon: Settings },
    { id: "Environment", label: "Environment", icon: Server },
    { id: "Test Data", label: "Test Data", icon: Database },
    { id: "Secrets", label: "Secrets", icon: Lock },
    { id: "Logs", label: "System Logs", icon: ScrollText }
  ]

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Settings size={18} className="text-indigo-600" />
            Data &amp; Config
          </h2>
          <p className="text-[11px] text-slate-500 font-semibold">
            Run settings, environment variables and secrets (available to tests as process.env), test data &amp; logs.
          </p>
        </div>
      </div>

      {/* SUB-TAB SELECTOR */}
      <div className="flex items-center gap-1.5 overflow-x-auto bg-slate-100 p-1 border rounded-2xl select-none scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black tracking-tight shrink-0 transition-all ${
              subTab === t.id
                ? "bg-white text-indigo-700 shadow-sm border border-indigo-100"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
            }`}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "Properties" && <PropertiesTab />}
      {subTab === "Environment" && <EnvTab secretsMode={false} />}
      {subTab === "Test Data" && <TestDataTab />}
      {subTab === "Secrets" && <EnvTab secretsMode={true} />}
      {subTab === "Logs" && <LogsTab />}
    </div>
  )
}

// ============================================================
// PROPERTIES TAB
// ============================================================
function PropertiesTab() {
  const [rows, setRows] = useState<PropertyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [group, setGroup] = useState<string>("All")
  const [dirty, setDirty] = useState<Record<string, string>>({})
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/hub/config/properties")
      const d = await res.json()
      setRows(d.properties || [])
      setDirty({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/hub/config/properties/history")
    const d = await res.json()
    setHistory(d.history || [])
  }, [])

  const effectiveValue = (r: PropertyRow) => (r.name in dirty ? dirty[r.name] : r.value)

  const setValue = (name: string, value: string) => {
    setDirty((prev) => ({ ...prev, [name]: value }))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (group === "All" || r.group === group) &&
        (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
    )
  }, [rows, search, group])

  const dirtyCount = Object.keys(dirty).filter((k) => {
    const row = rows.find((r) => r.name === k)
    return row && dirty[k] !== row.value
  }).length

  const save = async () => {
    const updates: Record<string, string> = {}
    for (const [k, v] of Object.entries(dirty)) {
      const row = rows.find((r) => r.name === k)
      if (row && v !== row.value) updates[k] = v
    }
    if (Object.keys(updates).length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/hub/config/properties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates })
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Save failed")
        return
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  const resetOne = async (name: string) => {
    await fetch("/api/hub/config/properties/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
    await load()
  }

  const resetAll = async () => {
    if (!confirm("Reset ALL settings to their defaults? This clears your overrides.")) return
    await fetch("/api/hub/config/properties/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    })
    await load()
  }

  const onImport = async (file: File) => {
    const content = await file.text()
    const res = await fetch("/api/hub/config/properties/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    })
    const d = await res.json()
    if (!res.ok) {
      setError(d.error || "Import failed")
      return
    }
    if (d.skipped?.length) setError(`Imported ${d.importedCount}. Skipped invalid: ${d.skipped.join(", ")}`)
    await load()
  }

  if (loading) return <LoadingCard label="Loading run settings..." />

  return (
    <div className="space-y-3">
      {/* TOOLBAR */}
      <div className="flex items-center gap-2 flex-wrap bg-white border rounded-2xl p-2.5 shadow-sm">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search properties..."
            className="w-full pl-8 pr-3 py-2 text-xs font-semibold border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
          />
        </div>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="text-xs font-black border rounded-xl px-3 py-2 bg-white text-slate-700 outline-none"
        >
          <option value="All">All groups</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          ref={fileInputRef}
          type="file"
          accept=".properties,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImport(f)
            e.target.value = ""
          }}
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl bg-white border-slate-200 text-slate-600 text-xs font-black gap-1.5"
        >
          <Upload size={13} /> Import
        </Button>
        <a href="/api/hub/config/properties/export" download>
          <Button variant="outline" className="rounded-xl bg-white border-slate-200 text-slate-600 text-xs font-black gap-1.5">
            <Download size={13} /> Export
          </Button>
        </a>
        <Button
          variant="outline"
          onClick={() => {
            setShowHistory((s) => !s)
            if (!showHistory) loadHistory()
          }}
          className="rounded-xl bg-white border-slate-200 text-slate-600 text-xs font-black gap-1.5"
        >
          <History size={13} /> History
        </Button>
        <Button
          variant="outline"
          onClick={resetAll}
          className="rounded-xl bg-white border-rose-200 text-rose-600 text-xs font-black gap-1.5"
        >
          <ListRestart size={13} /> Reset all
        </Button>
        <Button
          onClick={save}
          disabled={saving || dirtyCount === 0}
          className="bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-black gap-1.5 disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
        </Button>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold p-3 rounded-xl">{error}</div>
      )}

      {showHistory && (
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-slate-50 text-xs font-black text-slate-700 flex items-center gap-2">
            <History size={13} /> Change History
          </div>
          <div className="max-h-56 overflow-auto divide-y">
            {history.length === 0 ? (
              <div className="p-4 text-[11px] text-slate-400 font-bold">No changes recorded yet.</div>
            ) : (
              history.map((h) => (
                <div key={h.id} className="px-4 py-2 text-[11px] flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-black text-slate-800">{h.propertyName}</span>
                  <span className="text-rose-500 line-through font-mono">{h.oldValue || "∅"}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-emerald-600 font-mono font-black">{h.newValue}</span>
                  <span className="ml-auto text-slate-400 font-semibold">
                    {h.changedBy} · {new Date(h.changedAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_auto] gap-2 px-4 py-2.5 border-b bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
          <span>Property</span>
          <span>Value</span>
          <span className="text-right pr-1">Reset</span>
        </div>
        <div className="divide-y max-h-[560px] overflow-auto">
          {filtered.map((r) => {
            const val = effectiveValue(r)
            const changed = r.name in dirty && dirty[r.name] !== r.value
            return (
              <div key={r.name} className="grid grid-cols-[1.4fr_1fr_auto] gap-2 px-4 py-2.5 items-center hover:bg-slate-50/60">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] font-black text-slate-800 truncate">{r.name}</span>
                    <span className={`text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded border ${GROUP_STYLES[r.group] || GROUP_STYLES.Other}`}>
                      {r.group}
                    </span>
                    {(r.isCustom || changed) && (
                      <span className="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                        {changed ? "edited" : "custom"}
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-slate-400 font-semibold truncate">{r.description}</p>
                </div>
                <div>
                  <PropertyInput row={r} value={val} onChange={(v) => setValue(r.name, v)} />
                </div>
                <div className="text-right">
                  {r.isCustom && (
                    <button
                      onClick={() => resetOne(r.name)}
                      title={`Reset to default (${r.default || "∅"})`}
                      className="text-slate-400 hover:text-indigo-600 p-1"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-[11px] text-slate-400 font-bold">No properties match your filters.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function PropertyInput({ row, value, onChange }: { row: PropertyRow; value: string; onChange: (v: string) => void }) {
  if (row.type === "boolean") {
    const on = value === "true"
    return (
      <button
        onClick={() => onChange(on ? "false" : "true")}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? "bg-indigo-600" : "bg-slate-300"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    )
  }
  if (row.type === "enum" && row.options) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[11.5px] font-black border rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100"
      >
        {row.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }
  if (row.type === "number") {
    return (
      <input
        type="number"
        value={value}
        min={row.min ?? undefined}
        max={row.max ?? undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[11.5px] font-black font-mono border rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100"
      />
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={row.default || "—"}
      className="w-full text-[11.5px] font-mono border rounded-lg px-2.5 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100"
    />
  )
}

// ============================================================
// ENV / SECRETS TAB (shared — secretsMode toggles which set is shown)
// ============================================================
function EnvTab({ secretsMode }: { secretsMode: boolean }) {
  const [rows, setRows] = useState<EnvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [showAudit, setShowAudit] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: "", value: "", scope: "global" })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/hub/config/env")
      const d = await res.json()
      setRows((d.variables || []).filter((v: EnvRow) => v.isSecret === secretsMode))
    } finally {
      setLoading(false)
    }
  }, [secretsMode])

  useEffect(() => {
    load()
    setRevealed({})
  }, [load])

  const loadAudit = useCallback(async () => {
    const res = await fetch("/api/hub/config/env/audit")
    const d = await res.json()
    setAudit(d.audit || [])
  }, [])

  const create = async () => {
    if (!form.name.trim()) return
    setError(null)
    const res = await fetch("/api/hub/config/env", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, isSecret: secretsMode })
    })
    const d = await res.json()
    if (!res.ok) {
      setError(d.error || "Create failed")
      return
    }
    setForm({ name: "", value: "", scope: "global" })
    setAdding(false)
    await load()
  }

  const reveal = async (id: string) => {
    if (revealed[id] !== undefined) {
      setRevealed((p) => {
        const n = { ...p }
        delete n[id]
        return n
      })
      return
    }
    const res = await fetch(`/api/hub/config/env/${id}/reveal`, { method: "POST" })
    const d = await res.json()
    if (res.ok) setRevealed((p) => ({ ...p, [id]: d.value }))
  }

  const remove = async (id: string) => {
    if (!confirm("Delete this entry?")) return
    await fetch(`/api/hub/config/env/${id}`, { method: "DELETE" })
    await load()
  }

  if (loading) return <LoadingCard label={secretsMode ? "Loading secrets..." : "Loading environment variables..."} />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap bg-white border rounded-2xl p-2.5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-black text-slate-700">
          {secretsMode ? <ShieldCheck size={15} className="text-fuchsia-600" /> : <Server size={15} className="text-indigo-600" />}
          {secretsMode ? "Encrypted Secrets (AES-256-GCM)" : "Environment Variables"}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {secretsMode && (
            <Button
              variant="outline"
              onClick={() => {
                setShowAudit((s) => !s)
                if (!showAudit) loadAudit()
              }}
              className="rounded-xl bg-white border-slate-200 text-slate-600 text-xs font-black gap-1.5"
            >
              <History size={13} /> Audit log
            </Button>
          )}
          <Button
            onClick={() => setAdding((a) => !a)}
            className="bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-black gap-1.5"
          >
            <Plus size={13} /> Add {secretsMode ? "secret" : "variable"}
          </Button>
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold p-3 rounded-xl">{error}</div>}

      {adding && (
        <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="NAME (e.g. DB_PASSWORD)"
              className="text-xs font-mono font-black border rounded-xl px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <input
              type={secretsMode ? "password" : "text"}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder="value"
              className="text-xs font-mono border rounded-xl px-3 py-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <select
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
              className="text-xs font-black border rounded-xl px-3 py-2 bg-white outline-none"
            >
              <option value="global">Global</option>
              <option value="project">Project</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setAdding(false)} className="rounded-xl text-xs font-black bg-white border-slate-200 text-slate-600">
              Cancel
            </Button>
            <Button onClick={create} className="bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-black">
              Save
            </Button>
          </div>
        </div>
      )}

      {showAudit && secretsMode && (
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-slate-50 text-xs font-black text-slate-700 flex items-center gap-2">
            <History size={13} /> Secret Access Audit
          </div>
          <div className="max-h-52 overflow-auto divide-y">
            {audit.length === 0 ? (
              <div className="p-4 text-[11px] text-slate-400 font-bold">No access recorded yet.</div>
            ) : (
              audit.map((a) => (
                <div key={a.id} className="px-4 py-2 text-[11px] flex items-center gap-2">
                  <span className="font-mono font-black text-indigo-600">{a.action}</span>
                  <span className="text-slate-600 font-semibold truncate">{a.details}</span>
                  <span className="ml-auto text-slate-400 font-semibold whitespace-nowrap">
                    {a.user} · {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1.2fr_1.4fr_auto_auto] gap-2 px-4 py-2.5 border-b bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
          <span>Name</span>
          <span>Value</span>
          <span>Scope</span>
          <span className="text-right pr-1">Actions</span>
        </div>
        <div className="divide-y max-h-[520px] overflow-auto">
          {rows.map((r) => {
            const shown = revealed[r.id]
            return (
              <div key={r.id} className="grid grid-cols-[1.2fr_1.4fr_auto_auto] gap-2 px-4 py-2.5 items-center hover:bg-slate-50/60">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11.5px] font-black text-slate-800 truncate">{r.name}</span>
                  {r.liveInProcess ? (
                    <span title="Resolvable from process env" className="text-emerald-500">
                      <CheckCircle2 size={13} />
                    </span>
                  ) : (
                    <span title="Not present in running process env" className="text-slate-300">
                      <XCircle size={13} />
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11.5px] text-slate-600 truncate">
                  {r.isSecret ? (shown !== undefined ? shown : "••••••••••••") : r.value || <span className="text-slate-300">∅</span>}
                </div>
                <div>
                  <span className="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200">
                    {r.scope}
                  </span>
                </div>
                <div className="text-right flex items-center justify-end gap-1">
                  {r.isSecret && (
                    <button onClick={() => reveal(r.id)} className="text-slate-400 hover:text-indigo-600 p-1" title={shown !== undefined ? "Hide" : "Reveal"}>
                      {shown !== undefined ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                  <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-rose-600 p-1" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
          {rows.length === 0 && (
            <div className="p-8 text-center text-[11px] text-slate-400 font-bold">
              No {secretsMode ? "secrets" : "variables"} yet. Click &ldquo;Add&rdquo; to create one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// TEST DATA TAB (reuses the existing manager)
// ============================================================
function TestDataTab() {
  const [scripts, setScripts] = useState<ScriptRef[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/hub/scripts")
        const d = await res.json()
        setScripts((d.scripts || []).map((s: any) => ({ id: s.id, name: s.name, type: s.type })))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <LoadingCard label="Loading test data files..." />
  return <TestDataManager scripts={scripts} />
}

// ============================================================
// SYSTEM LOGS TAB
// ============================================================
interface ParsedLine {
  raw: string
  level: LogLevel
}

function LogsTab() {
  const [rawLines, setRawLines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const [search, setSearch] = useState("")
  const [enabled, setEnabled] = useState<Record<LogLevel, boolean>>({
    TRACE: true,
    DEBUG: true,
    INFO: true,
    WARN: true,
    ERROR: true
  })
  const [autoScroll, setAutoScroll] = useState(true)
  const bufferRef = useRef("")
  const esRef = useRef<EventSource | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pausedRef = useRef(false)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  const appendChunk = useCallback((text: string) => {
    if (pausedRef.current) return
    bufferRef.current += text
    const parts = bufferRef.current.split("\n")
    bufferRef.current = parts.pop() ?? ""
    if (parts.length) {
      setRawLines((prev) => {
        const next = [...prev, ...parts]
        return next.length > 8000 ? next.slice(next.length - 8000) : next
      })
    }
  }, [])

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const res = await fetch("/api/hub/logs")
        const d = await res.json()
        if (aborted) return
        setRawLines(d.content ? String(d.content).split("\n") : [])
        setLoading(false)
        const es = new EventSource(`/api/hub/logs/stream?offset=${d.size || 0}`)
        esRef.current = es
        es.addEventListener("append", (e) => {
          try {
            appendChunk(JSON.parse((e as MessageEvent).data))
          } catch {}
        })
        es.addEventListener("reset", () => {
          bufferRef.current = ""
          setRawLines([])
        })
        es.onopen = () => setConnected(true)
        es.onerror = () => setConnected(false)
      } catch {
        setLoading(false)
      }
    })()
    return () => {
      aborted = true
      esRef.current?.close()
    }
  }, [appendChunk])

  const parsed = useMemo<ParsedLine[]>(() => {
    const out: ParsedLine[] = []
    let prev: LogLevel = "INFO"
    for (const raw of rawLines) {
      const m = raw.match(/\b(TRACE|DEBUG|INFO|WARN|ERROR)\b/)
      const level = (m ? m[1] : prev) as LogLevel
      prev = level
      out.push({ raw, level })
    }
    return out
  }, [rawLines])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return parsed.filter((l) => enabled[l.level] && (!q || l.raw.toLowerCase().includes(q)))
  }, [parsed, enabled, search])

  useEffect(() => {
    if (autoScroll && !paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered.length, autoScroll, paused])

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { TRACE: 0, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 }
    for (const p of parsed) c[p.level]++
    return c
  }, [parsed])

  if (loading) return <LoadingCard label="Loading execution logs..." />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap bg-white border rounded-2xl p-2.5 shadow-sm">
        <span className="flex items-center gap-1.5 text-xs font-black text-slate-700">
          <ScrollText size={15} className="text-indigo-600" /> log4j.log
          <span className={`ml-1 inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${connected ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
            {connected ? "live" : "offline"}
          </span>
        </span>
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter log lines..."
            className="w-full pl-8 pr-3 py-2 text-xs font-semibold border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          {LOG_LEVELS.map((lv) => (
            <button
              key={lv}
              onClick={() => setEnabled((e) => ({ ...e, [lv]: !e[lv] }))}
              className={`text-[9px] font-black uppercase px-2 py-1.5 rounded-lg border transition-colors ${
                enabled[lv] ? `bg-white ${LEVEL_STYLES[lv]} border-slate-200` : "bg-slate-100 text-slate-300 border-transparent"
              }`}
            >
              {lv} {counts[lv] > 0 && <span className="opacity-60">{counts[lv]}</span>}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={() => setPaused((p) => !p)}
          className="rounded-xl bg-white border-slate-200 text-slate-600 text-xs font-black gap-1.5"
        >
          {paused ? <Play size={13} /> : <Pause size={13} />} {paused ? "Resume" : "Pause"}
        </Button>
        <a href="/api/hub/logs?download=1" download>
          <Button variant="outline" className="rounded-xl bg-white border-slate-200 text-slate-600 text-xs font-black gap-1.5">
            <Download size={13} /> Download
          </Button>
        </a>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          setAutoScroll(atBottom)
        }}
        className="bg-slate-950 rounded-2xl border border-slate-800 p-3 font-mono text-[11px] leading-relaxed h-[520px] overflow-auto"
      >
        {filtered.length === 0 ? (
          <div className="text-slate-500 font-semibold text-center py-20">No log lines match the current filters.</div>
        ) : (
          filtered.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${LEVEL_STYLES[l.level]}`}>
              {l.raw || " "}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================
// SHARED
// ============================================================
function LoadingCard({ label }: { label: string }) {
  return (
    <div className="py-24 flex flex-col items-center justify-center gap-2 border bg-white rounded-2xl shadow-sm">
      <Loader2 className="animate-spin text-indigo-600" size={28} />
      <span className="font-extrabold text-slate-400 uppercase tracking-widest text-[9.5px]">{label}</span>
    </div>
  )
}
