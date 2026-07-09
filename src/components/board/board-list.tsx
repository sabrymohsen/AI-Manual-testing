"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight, ChevronDown, Layers, Upload, Sparkles, RefreshCw, Plus, Loader2, Flag, Bug, FlaskConical, X, Trash2 } from "lucide-react"
import { Story, EpicLite, PRIORITY_COLOR, issueTypeOf, ConfirmModal } from "./shared"
import { getCoverageBadge } from "@/components/ui/qa-badges"
import { importStoriesFromOpenProject } from "@/lib/openproject-import-client"
import CreateEpicModal from "./create-epic-modal"

interface BoardListProps {
  projectId: string
  stories: Story[]
  epics: EpicLite[]
  onOpen: (s: Story) => void
  onReload: () => Promise<void>
  onImport: () => void
}

export default function BoardList({
  projectId, stories, epics, onOpen, onReload, onImport,
}: BoardListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [showNewEpic, setShowNewEpic] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  const isTaskOrBug = (s: Story) => { const t = issueTypeOf(s.requirementKey).id; return t === "Task" || t === "Bug" }

  const groups = useMemo(() => {
    const topStories = stories.filter((s) => !isTaskOrBug(s))
    const byEpic = new Map<string, Story[]>()
    for (const s of topStories) {
      const key = s.epic?.id || "none"
      if (!byEpic.has(key)) byEpic.set(key, [])
      byEpic.get(key)!.push(s)
    }
    const ordered = epics
      .filter((e) => byEpic.has(e.id))
      .map((e) => ({ id: e.id, label: `${e.epicKey} · ${e.title}`, list: byEpic.get(e.id)! }))
    if (byEpic.has("none")) ordered.push({ id: "none", label: "Unassigned Epics", list: byEpic.get("none")! })
    return ordered
  }, [stories, epics])

  const childrenOf = (storyId: string) => stories.filter((s) => s.parent?.id === storyId)
  const total = stories.filter((s) => !isTaskOrBug(s)).length
  const overallPct = total ? Math.round((stories.filter((s) => !isTaskOrBug(s) && s.computedCoverage === "Covered").length / total) * 100) : 0

  const toggle = (id: string) => setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const sync = async () => {
    setSyncing(true)
    try { await importStoriesFromOpenProject(projectId); await onReload() } finally { setSyncing(false) }
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      await Promise.all([...selected].map((id) => fetch(`/api/requirements/${id}`, { method: "DELETE" }).catch(() => {})))
      setSelected(new Set())
      await onReload()
    } finally { setDeleting(false) }
  }

  const epicPct = (list: Story[]) => (list.length ? Math.round((list.filter((s) => s.computedCoverage === "Covered").length / list.length) * 100) : 0)

  return (
    <div className="space-y-4">
      {/* Redesigned Tree List Toolbar */}
      <div className="flex items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-sm flex-wrap backdrop-blur-md">
        <div className="text-xs font-bold text-muted-foreground mr-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-violet-500" /> {total} Top Stories</span>
          <span className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
          <span className="text-emerald-600 font-extrabold">{overallPct}% Requirements Covered</span>
        </div>
        <ToolButton onClick={onImport} icon={Upload}>Import</ToolButton>
        <Link
          href={`/projects/${projectId}/generate-from-file`}
          className="h-9 px-4 rounded-xl border border-violet-100 dark:border-violet-900/50 bg-background/50 hover:bg-violet-50/10 text-xs font-black flex items-center gap-2 hover:border-violet-200 transition-all shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Generate
        </Link>
        <ToolButton onClick={sync} icon={RefreshCw} spinning={syncing}>Sync</ToolButton>
        <ToolButton onClick={() => setShowNewEpic(true)} icon={Plus}>New Epic</ToolButton>
      </div>

      {/* Tree Grid */}
      {groups.length === 0 ? (
        <div className="border border-slate-150 dark:border-slate-800/80 rounded-2xl bg-card py-16 text-center text-xs text-muted-foreground font-medium shadow-sm">
          <Layers className="h-8 w-8 text-violet-500 mx-auto mb-2 opacity-50" />
          No items found. Create or import your requirements.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const open = !collapsed.has(g.id)
            const pct = epicPct(g.list)
            return (
              <div key={g.id} className="border border-slate-100 dark:border-slate-800/80 rounded-2xl bg-card overflow-hidden shadow-sm">
                <button
                  onClick={() => toggle(g.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50/40 hover:bg-slate-50/80 dark:bg-slate-900/10 dark:hover:bg-slate-900/20 text-left border-b border-slate-100 dark:border-slate-850/60 transition-all"
                >
                  {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <Layers className="h-4.5 w-4.5 text-violet-500 shrink-0" />
                  <span className="font-extrabold text-xs text-slate-800 dark:text-slate-100 truncate">{g.label}</span>
                  <div className="ml-auto shrink-0 flex items-center gap-3">
                    <span className="text-[10px] font-black text-muted-foreground bg-muted rounded-full px-2 py-0.5">{g.list.length} Items</span>
                    <div className="h-3 w-px bg-slate-200 dark:bg-slate-800" />
                    <span className={`text-[10px] font-black uppercase tracking-wider ${pct === 100 ? "text-emerald-600" : "text-amber-600"}`}>{pct}% Coverage</span>
                  </div>
                </button>
                {open && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-850/50 bg-background/50">
                    {g.list.map((s) => (
                      <div key={s.id}>
                        <Row story={s} selected={selected.has(s.id)} onSelect={() => toggleSel(s.id)} onOpen={() => onOpen(s)} />
                        {childrenOf(s.id).map((c) => (
                          <Row key={c.id} story={c} indent selected={selected.has(c.id)} onSelect={() => toggleSel(c.id)} onOpen={() => onOpen(c)} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Floating Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3.5 bg-slate-950 text-white rounded-2xl px-5 py-3 shadow-2xl border border-slate-800">
          <span className="text-xs font-black tracking-wider uppercase">{selected.size} Selection(s)</span>
          <div className="h-4 w-px bg-slate-800" />
          <button
            onClick={() => setShowBulkDeleteConfirm(true)}
            disabled={deleting}
            className="h-8.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-black flex items-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="text-slate-400 hover:text-white transition-colors p-1"><X className="h-4 w-4" /></button>
        </div>
      )}

      {showNewEpic && <CreateEpicModal projectId={projectId} onClose={() => setShowNewEpic(false)} onCreated={onReload} />}

      {showBulkDeleteConfirm && (
        <ConfirmModal
          title="Delete Multiple Requirements"
          message={`Are you sure you want to permanently delete the ${selected.size} selected requirements? This action will remove them from all sprints and backlog boards.`}
          onConfirm={() => {
            bulkDelete()
            setShowBulkDeleteConfirm(false)
          }}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

function Row({ story, indent, selected, onSelect, onOpen }: { story: Story; indent?: boolean; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const type = issueTypeOf(story.requirementKey)
  const testCount = story.testCases?.length || 0
  const bugCount = story.bugReports?.length || 0

  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/10 transition-colors ${indent ? "pl-11" : ""}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        onClick={(e) => e.stopPropagation()}
        className="accent-indigo-650 shrink-0 h-4 w-4 rounded border-slate-300"
      />
      <button onClick={onOpen} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
        <type.icon className={`h-4 w-4 shrink-0 ${type.color}`} />
        <span className="text-[10px] font-mono font-bold text-indigo-650 dark:text-indigo-400 shrink-0">{story.requirementKey}</span>
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate hover:text-indigo-650 dark:hover:text-indigo-400 transition-colors">{story.title}</span>
        <Flag className={`h-3 w-3 shrink-0 ${PRIORITY_COLOR[story.priority] || "text-slate-400"}`} />
        {testCount > 0 && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0" title="Linked Tests"><FlaskConical className="h-3 w-3" />{testCount}</span>}
        {bugCount > 0 && <span className="text-[10px] font-black text-red-600 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0" title="linked Bugs"><Bug className="h-3 w-3" />{bugCount}</span>}
      </button>
      <span className="text-[10px] font-black uppercase text-muted-foreground shrink-0 hidden sm:inline">{story.status}</span>
      <span className="shrink-0">{getCoverageBadge(story.computedCoverage || "NotExecuted")}</span>
    </div>
  )
}

function ToolButton({ onClick, icon: Icon, spinning, children }: { onClick: () => void; icon: React.ComponentType<{ className?: string }>; spinning?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={spinning}
      className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-background/50 hover:bg-muted text-xs font-black flex items-center gap-2 transition-all disabled:opacity-50 shadow-sm"
    >
      {spinning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" /> : <Icon className="h-3.5 w-3.5 text-indigo-500" />} {children}
    </button>
  )
}

