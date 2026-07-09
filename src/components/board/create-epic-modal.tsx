"use client"

import { useState } from "react"
import { Layers, X, Loader2 } from "lucide-react"

/**
 * Shared "Create Epic" modal — used from the board header and the List tab so
 * epic creation is the same everywhere. POSTs to /api/projects/[id]/epics
 * (key auto-generated server-side) then calls onCreated to refresh.
 */
export default function CreateEpicModal({
  projectId, onClose, onCreated,
}: {
  projectId: string
  onClose: () => void
  onCreated: () => Promise<void> | void
}) {
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState("Medium")
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    await fetch(`/api/projects/${projectId}/epics`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), priority }),
    }).catch(() => {})
    await onCreated()
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-card border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-1 border-b">
          <h3 className="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider flex items-center gap-1.5"><Layers className="h-4 w-4 text-violet-500" /> Create Epic</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-muted p-1 rounded-lg transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Epic Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit() }}
              placeholder="e.g. User Authentication & Security"
              className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-violet-500 shadow-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Epic Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full h-9 px-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-background"
            >
              {["Low", "Medium", "High", "Critical"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs font-bold hover:bg-muted transition-colors">Cancel</button>
          <button
            disabled={!title.trim() || saving}
            onClick={submit}
            className="h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black disabled:opacity-50 shadow-md flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  )
}
