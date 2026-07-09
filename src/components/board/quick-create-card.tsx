"use client"

import { useState } from "react"
import { Plus, X, Loader2 } from "lucide-react"

interface QuickCreateCardProps {
  projectId: string
  sprintId: string
  defaultStatus: string
  onCreated: () => void
  stories: { requirementKey: string }[]
}

export default function QuickCreateCard({ projectId, sprintId, defaultStatus, onCreated, stories }: QuickCreateCardProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<"Story" | "Task">("Story")
  const [priority, setPriority] = useState("Medium")
  const [saving, setSaving] = useState(false)

  const nextKey = () => {
    const prefix = type === "Story" ? "STORY" : "TASK"
    const re = new RegExp(`^${prefix}-(\\d+)$`, "i")
    let max = 0
    for (const s of stories) {
      const m = s.requirementKey.match(re)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `${prefix}-${String(max + 1).padStart(3, "0")}`
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    const body = {
      requirementKey: nextKey(),
      title: title.trim(),
      description: null,
      priority,
      status: defaultStatus,
      source: "Manual",
      sprintId,
      storyPoints: null,
      assignee: null,
      labels: [],
    }
    const res = await fetch(`/api/projects/${projectId}/requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setTitle("")
      setOpen(false)
      onCreated()
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full h-8 flex items-center justify-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add card
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="border rounded-lg bg-background p-2 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs to be done?"
        className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="flex items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as any)} className="h-8 text-[11px] font-bold rounded-lg border bg-background px-2">
          <option value="Story">Story</option>
          <option value="Task">Task</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-8 text-[11px] font-bold rounded-lg border bg-background px-2">
          {["Low", "Medium", "High", "Critical"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
          <button type="submit" disabled={!title.trim() || saving} className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
          </button>
        </div>
      </div>
    </form>
  )
}
