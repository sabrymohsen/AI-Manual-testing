"use client"

import { useState } from "react"
import { X, Loader2, FlaskConical } from "lucide-react"

const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const

// ── Shared modal shell so the two forms look like one family (but differ). ──
function ModalShell({
  icon: Icon,
  accent,
  submitClass,
  title,
  subtitle,
  onClose,
  onSubmit,
  submitLabel,
  saving,
  canSubmit,
  error,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  accent: string
  submitClass: string
  title: string
  subtitle: string
  onClose: () => void
  onSubmit: () => void
  submitLabel: string
  saving: boolean
  canSubmit: boolean
  error: string | null
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-md my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 dark:text-slate-100 leading-tight">{title}</h3>
              <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3.5 max-h-[64vh] overflow-y-auto">{children}{error && <p className="text-xs font-bold text-red-600">{error}</p>}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border text-sm font-semibold">Cancel</button>
          <button disabled={!canSubmit || saving} onClick={onSubmit} className={`h-9 px-4 rounded-lg text-white text-sm font-black disabled:opacity-50 flex items-center gap-1.5 ${submitClass}`}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

/** Create a Test Case and link it to the story — QA-shaped fields. */
export function CreateTestCaseModal({
  projectId, requirementId, storyKey, onClose, onCreated,
}: {
  projectId: string; requirementId: string; storyKey: string; onClose: () => void; onCreated: () => Promise<void>
}) {
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState("Medium")
  const [executionType, setExecutionType] = useState<"Manual" | "Automated">("Manual")
  const [preconditions, setPreconditions] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!title.trim() || saving) return
    setSaving(true); setError(null)
    const res = await fetch(`/api/projects/${projectId}/test-cases`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(), priority, executionType, source: "Manual",
        preconditions: preconditions.trim() || null, requirementIds: [requirementId],
      }),
    }).catch(() => null)
    setSaving(false)
    if (!res || !res.ok) { setError("Failed to create test case"); return }
    await onCreated(); onClose()
  }

  return (
    <ModalShell icon={FlaskConical} accent="text-emerald-600" submitClass="bg-emerald-600 hover:bg-emerald-700" title="New test case" subtitle={`Linked to ${storyKey}`} onClose={onClose} onSubmit={submit} submitLabel="Create test case" saving={saving} canSubmit={!!title.trim()} error={error}>
      <Field label="Title"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Verify that…" className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full h-9 px-2 text-xs font-bold rounded-lg border bg-background">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Execution">
          <select value={executionType} onChange={(e) => setExecutionType(e.target.value as any)} className="w-full h-9 px-2 text-xs font-bold rounded-lg border bg-background">
            <option value="Manual">Manual</option>
            <option value="Automated">Automated</option>
          </select>
        </Field>
      </div>
      <Field label="Preconditions"><textarea value={preconditions} onChange={(e) => setPreconditions(e.target.value)} rows={2} placeholder="State/data required before running…" className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" /></Field>
      <p className="text-[11px] text-muted-foreground">You can add detailed steps after creating, in the test case editor.</p>
    </ModalShell>
  )
}

