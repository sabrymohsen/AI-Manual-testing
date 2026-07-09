"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Play, CheckCircle2, Trash2, Loader2, Search, Target, X, ListOrdered, LayoutGrid, ListTree, LineChart, Upload } from "lucide-react"
import { Story, Sprint, EpicLite, StoryCardView, StatusPill, points, issueTypeOf, ConfirmModal } from "./shared"
import SprintKanban from "./sprint-kanban"
import SprintReports from "./sprint-reports"
import BoardList from "./board-list"
import IssueDrawer from "./issue-drawer"
import ImportStoriesModal from "./import-stories-modal"
import BoardToolbar from "./board-toolbar"
import BoardSettingsDrawer from "./board-settings-drawer"
import CreateEpicModal from "./create-epic-modal"
import { loadBoardConfig, saveBoardConfig, type BoardConfig, DEFAULT_CONFIG } from "./board-config"

type View = "backlog" | "board" | "list" | "reports"

export default function ScrumBoard({ projectId }: { projectId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [stories, setStories] = useState<Story[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [allEpics, setAllEpics] = useState<EpicLite[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>("backlog")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [epicFilter, setEpicFilter] = useState("all")
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateEpic, setShowCreateEpic] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [openIssueId, setOpenIssueId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [config, setConfig] = useState<BoardConfig>(DEFAULT_CONFIG)
  const [showSettings, setShowSettings] = useState(false)
  const [sprintToDelete, setSprintToDelete] = useState<string | null>(null)

  // Load config on mount
  useEffect(() => {
    setConfig(loadBoardConfig(projectId))
  }, [projectId])

  const updateConfig = useCallback((next: BoardConfig) => {
    setConfig(next)
    saveBoardConfig(projectId, next)
  }, [projectId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [rRes, sRes, eRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/requirements`),
        fetch(`/api/projects/${projectId}/sprints`),
        fetch(`/api/projects/${projectId}/epics`),
      ])
      const rData = rRes.ok ? await rRes.json() : { requirements: [] }
      const sData = sRes.ok ? await sRes.json() : { sprints: [] }
      const eData = eRes.ok ? await eRes.json() : { epics: [] }
      setStories(rData.requirements || [])
      setSprints(sData.sprints || [])
      setAllEpics((eData.epics || []).map((e: any) => ({ id: e.id, epicKey: e.epicKey, title: e.title })))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId])

  const silentReload = useCallback(() => load(true), [load])

  useEffect(() => { load() }, [load])

  // Deep-link: /board?story=<requirementId> opens that story's drawer (from the
  // Test Cases / Bug Reports pages). openStoryObj resolves once stories load.
  useEffect(() => {
    const s = searchParams.get("story")
    if (s) setOpenIssueId(s)
  }, [searchParams])

  const patchStory = useCallback(async (story: Story, body: Record<string, unknown>) => {
    setStories((prev) => prev.map((s) => {
      if (s.id !== story.id) return s
      const next = { ...s, ...body } as Story
      if ("epicId" in body) {
        const ep = allEpics.find((e) => e.id === body.epicId)
        next.epic = ep ? { id: ep.id, epicKey: ep.epicKey, title: ep.title } : null
      }
      return next
    }))
    await fetch(`/api/requirements/${story.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => load())
  }, [load, allEpics])

  const deleteStory = useCallback(async (story: Story) => {
    setStories((prev) => prev.filter((s) => s.id !== story.id))
    setOpenIssueId(null)
    await fetch(`/api/requirements/${story.id}`, { method: "DELETE" }).catch(() => load())
  }, [load])

  const epics = useMemo(() => {
    const m = new Map<string, string>()
    stories.forEach((s) => s.epic && m.set(s.epic.id, `${s.epic.epicKey} · ${s.epic.title}`))
    return Array.from(m.entries())
  }, [stories])

  const visible = useMemo(() => {
    let q = search.trim().toLowerCase()
    return stories.filter((s) => {
      if (epicFilter !== "all" && s.epic?.id !== epicFilter) return false
      if (q && !s.title.toLowerCase().includes(q) && !s.requirementKey.toLowerCase().includes(q)) return false

      const f = config.quickFilters
      if (f.assignees.length > 0 && !f.assignees.includes(s.assignee || "")) return false
      if (f.priorities.length > 0 && !f.priorities.includes(s.priority)) return false
      if (f.labels.length > 0 && !f.labels.some((l) => s.labels.includes(l))) return false
      if (f.types.length > 0) {
        const type = issueTypeOf(s.requirementKey).id
        if (!f.types.includes(type)) return false
      }
      return true
    })
  }, [stories, search, epicFilter, config.quickFilters])

  const backlog = visible.filter((s) => !s.sprintId)
  const bySprint = (id: string) => visible.filter((s) => s.sprintId === id)

  const openStory = useCallback((s: Story) => setOpenIssueId(s.id), [])
  const openStoryObj = stories.find((s) => s.id === openIssueId) || null

  // ── Multi-select (backlog) ──────────────────────────────────────────────
  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n })
  }, [])
  const clearSelection = useCallback(() => setSelected(new Set()), [])

  // Bulk-assign the selected stories to a sprint or an epic in one go.
  const bulkAssign = useCallback(async (body: Record<string, unknown>) => {
    const targets = stories.filter((s) => selected.has(s.id))
    if (targets.length === 0) return
    setBulkBusy(true)
    try {
      await Promise.all(targets.map((s) => patchStory(s, body)))
      setSelected(new Set())
    } finally { setBulkBusy(false) }
  }, [stories, selected, patchStory])

  const activeStory = stories.find((s) => s.id === activeId) || null
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const overId = e.over?.id ? String(e.over.id) : null
    const story = stories.find((s) => s.id === e.active.id)
    if (!overId || !story) return
    const targetSprintId = overId === "backlog" ? null : overId
    if ((story.sprintId || null) === targetSprintId) return
    patchStory(story, { sprintId: targetSprintId })
  }

  const createSprint = async (name: string, goal: string) => {
    const res = await fetch(`/api/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, goal: goal || undefined }),
    })
    if (res.ok) await load()
    setShowCreate(false)
  }

  const patchSprint = async (id: string, body: Record<string, unknown>) => {
    setBusy(id)
    try {
      await fetch(`/api/projects/${projectId}/sprints/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      await load()
    } finally { setBusy(null) }
  }

  const deleteSprint = async (id: string) => {
    setBusy(id)
    try {
      await fetch(`/api/projects/${projectId}/sprints/${id}`, { method: "DELETE" })
      await load()
    } finally { setBusy(null) }
  }

  const TABS: { id: View; label: string; icon: any }[] = [
    { id: "backlog", label: "Backlog", icon: ListOrdered },
    { id: "board", label: "Sprint Board", icon: LayoutGrid },
    { id: "list", label: "List", icon: ListTree },
    { id: "reports", label: "Reports", icon: LineChart },
  ]

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center gap-3 text-muted-foreground animate-pulse">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
        <span className="text-xs font-black uppercase tracking-widest text-indigo-600/70">Loading Board Environment</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Redesigned Glassmorphic Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-gradient-to-r from-indigo-500/5 to-purple-500/5 dark:from-indigo-500/10 dark:to-purple-500/10 p-5 rounded-2xl border border-indigo-100/10 dark:border-slate-800/50 backdrop-blur-md">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Target className="h-5.5 w-5.5 text-indigo-600 dark:text-indigo-400" />
            Scrum Board
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-medium">Manage sprints, track issues and run automated live testing.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {view !== "reports" && view !== "board" && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search stories…"
                  className="pl-9 pr-3 h-9 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-background w-44 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
                />
              </div>
              <select
                value={epicFilter}
                onChange={(e) => setEpicFilter(e.target.value)}
                className="h-9 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-background px-3 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer shadow-sm"
              >
                <option value="all">All epics</option>
                {epics.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="h-9 px-4 rounded-xl border border-indigo-100 dark:border-slate-800 bg-background/60 hover:bg-indigo-50/10 hover:border-indigo-200 dark:hover:border-slate-700 text-xs font-black flex items-center gap-2 transition-all shadow-sm"
            title="Import user stories from Excel or CSV"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> Import
          </button>
          <button
            onClick={() => setShowCreateEpic(true)}
            className="h-9 px-4 rounded-xl border border-indigo-100 dark:border-slate-800 bg-background/60 hover:bg-violet-50/10 hover:border-violet-200 dark:hover:border-slate-700 text-xs font-black flex items-center gap-2 transition-all shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" /> Create epic
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="h-9 px-4 rounded-xl border border-indigo-100 dark:border-slate-800 bg-background/60 hover:bg-indigo-50/10 hover:border-indigo-200 dark:hover:border-slate-700 text-xs font-black flex items-center gap-2 transition-all shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> Create sprint
          </button>
          <button
            onClick={() => router.push(`/projects/${projectId}/board/create`)}
            className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-2 transition-all shadow-md hover:shadow-indigo-500/10 hover:shadow-lg"
          >
            <Plus className="h-3.5 w-3.5" /> Create
          </button>
        </div>
      </div>

      {/* Redesigned Stripe/Linear-Style Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-0.5">
        {TABS.map((t) => {
          const active = view === t.id
          return (
            <button
              key={t.id}
              onClick={() => { setView(t.id); clearSelection() }}
              className={`relative pb-3 pt-1 px-4 text-xs font-bold transition-all duration-200 flex items-center gap-2 ${active ? "text-indigo-600 dark:text-indigo-400 font-extrabold" : "text-muted-foreground hover:text-foreground hover:pb-3.5"}`}
            >
              <t.icon className={`h-4 w-4 ${active ? "text-indigo-600 dark:text-indigo-400" : "text-muted-foreground"}`} />
              {t.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-in fade-in duration-300" />
              )}
            </button>
          )
        })}
      </div>

      {view === "board" && (
        <div className="space-y-4">
          <BoardToolbar
            stories={stories}
            config={config}
            onChange={updateConfig}
            search={search}
            onSearch={setSearch}
            onOpenSettings={() => setShowSettings(true)}
          />
          <SprintKanban
            stories={visible}
            sprints={sprints}
            onPatch={patchStory}
            onOpen={openStory}
            config={config}
            projectId={projectId}
          />
        </div>
      )}

      {view === "backlog" && (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
          <div className="space-y-4">
            {sprints.map((sprint) => {
              const list = bySprint(sprint.id)
              const doneCount = list.filter((s) => s.status === "Covered").length
              return (
                <Column key={sprint.id} id={sprint.id}>
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-muted/40">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 truncate">{sprint.name}</span>
                      <StatusPill status={sprint.status} />
                      {sprint.goal && (
                        <span className="text-[10px] text-muted-foreground/80 bg-slate-200/50 dark:bg-slate-800/50 px-2 py-0.5 rounded italic truncate max-w-[200px] hidden sm:inline" title={sprint.goal}>
                          🎯 {sprint.goal}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3.5 shrink-0">
                      {doneCount > 0 && (
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          {doneCount}/{list.length} done
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-muted-foreground">{list.length} stories · {points(list)} pts</span>
                      {sprint.status === "Future" && (
                        <button
                          disabled={busy === sprint.id}
                          onClick={() => patchSprint(sprint.id, { status: "Active" })}
                          className="h-7 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[10px] font-black flex items-center gap-1 transition-all disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" /> Start
                        </button>
                      )}
                      {sprint.status === "Active" && (
                        <button
                          disabled={busy === sprint.id}
                          onClick={() => patchSprint(sprint.id, { status: "Completed" })}
                          className="h-7 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-black flex items-center gap-1 transition-all disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Complete
                        </button>
                      )}
                      <button
                        disabled={busy === sprint.id}
                        onClick={() => setSprintToDelete(sprint.id)}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                        title="Delete sprint"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <StoryList stories={list} onPoints={(s, p) => patchStory(s, { storyPoints: p })} onOpen={openStory} selectedIds={selected} onSelect={toggleSelect} showCheckbox emptyLabel="Drag stories here to plan this sprint" />
                </Column>
              )
            })}
            <Column id="backlog">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
                <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">Backlog</span>
                <span className="text-[10px] font-bold text-muted-foreground">{backlog.length} stories · {points(backlog)} pts</span>
              </div>
              <StoryList stories={backlog} onPoints={(s, p) => patchStory(s, { storyPoints: p })} onOpen={openStory} selectedIds={selected} onSelect={toggleSelect} showCheckbox emptyLabel="No unplanned stories — everything is in a sprint 🎉" />
            </Column>
          </div>
          <DragOverlay>{activeStory ? <StoryCardView story={activeStory} dragging /> : null}</DragOverlay>
        </DndContext>
      )}

      {view === "list" && <BoardList projectId={projectId} stories={stories} epics={allEpics} onOpen={openStory} onReload={silentReload} onImport={() => setShowImport(true)} />}
      {view === "reports" && <SprintReports stories={stories} sprints={sprints} />}

      {showCreate && <CreateSprintModal onClose={() => setShowCreate(false)} onCreate={createSprint} />}
      {showCreateEpic && <CreateEpicModal projectId={projectId} onClose={() => setShowCreateEpic(false)} onCreated={() => load(true)} />}
      <ImportStoriesModal
        projectId={projectId}
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => { setView("backlog"); load() }}
      />
      {showSettings && (
        <BoardSettingsDrawer config={config} onChange={updateConfig} onClose={() => setShowSettings(false)} />
      )}
      {openStoryObj && (
        <IssueDrawer
          key={openStoryObj.id}
          story={openStoryObj}
          projectId={projectId}
          sprints={sprints}
          epics={allEpics}
          onPatch={patchStory}
          onDelete={deleteStory}
          onReload={silentReload}
          onClose={() => setOpenIssueId(null)}
        />
      )}
      {sprintToDelete && (
        <ConfirmModal
          title="Delete Sprint"
          message="Are you sure you want to delete this sprint? All user stories mapped to it will be returned to the backlog."
          onConfirm={() => {
            deleteSprint(sprintToDelete)
            setSprintToDelete(null)
          }}
          onCancel={() => setSprintToDelete(null)}
        />
      )}

      {/* Backlog multi-select action bar */}
      {view === "backlog" && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl pl-4 pr-3 py-2.5 shadow-2xl ring-1 ring-white/10 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="text-xs font-black whitespace-nowrap">{selected.size} selected</span>
          {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span className="h-4 w-px bg-white/20" />

          <select
            value=""
            disabled={bulkBusy}
            onChange={(e) => { if (e.target.value) bulkAssign({ sprintId: e.target.value === "__backlog__" ? null : e.target.value }) }}
            className="h-8 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold px-2 border border-white/10 focus:outline-none cursor-pointer disabled:opacity-50"
            title="Add selected to a sprint"
          >
            <option value="">Add to sprint…</option>
            <option value="__backlog__">↩ Move to Backlog</option>
            {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "Active" ? " (active)" : ""}</option>)}
          </select>

          <select
            value=""
            disabled={bulkBusy}
            onChange={(e) => { if (e.target.value) bulkAssign({ epicId: e.target.value === "__none__" ? null : e.target.value }) }}
            className="h-8 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold px-2 border border-white/10 focus:outline-none cursor-pointer disabled:opacity-50"
            title="Add selected to an epic"
          >
            <option value="">Add to epic…</option>
            <option value="__none__">✕ No epic</option>
            {allEpics.map((ep) => <option key={ep.id} value={ep.id}>{ep.epicKey} · {ep.title}</option>)}
          </select>

          <button onClick={clearSelection} className="h-8 w-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10" title="Clear selection">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function Column({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`border border-slate-100 dark:border-slate-800/80 rounded-2xl bg-card/45 backdrop-blur-md overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md ${isOver ? "ring-2 ring-indigo-400 bg-indigo-50/10" : ""}`}
    >
      {children}
    </div>
  )
}

function StoryList({ stories, onPoints, onOpen, emptyLabel, selectedIds, onSelect, showCheckbox }: { stories: Story[]; onPoints: (s: Story, p: number) => void; onOpen: (s: Story) => void; emptyLabel: string; selectedIds?: Set<string>; onSelect?: (id: string, checked: boolean) => void; showCheckbox?: boolean }) {
  return (
    <div className="p-3 space-y-2 min-h-[76px] transition-all duration-200">
      {stories.length === 0 ? (
        <div className="text-[11px] text-muted-foreground/60 text-center py-6 font-medium italic border-2 border-dashed border-slate-100 dark:border-slate-850 rounded-xl">{emptyLabel}</div>
      ) : (
        stories.map((s) => <DraggableStory key={s.id} story={s} onPoints={onPoints} onOpen={onOpen} selected={!!selectedIds?.has(s.id)} onSelect={onSelect} showCheckbox={showCheckbox} />)
      )}
    </div>
  )
}

function DraggableStory({ story, onPoints, onOpen, selected, onSelect, showCheckbox }: { story: Story; onPoints: (s: Story, p: number) => void; onOpen: (s: Story) => void; selected?: boolean; onSelect?: (id: string, checked: boolean) => void; showCheckbox?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: story.id })
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-35 scale-95" : "transition-all"}>
      <StoryCardView story={story} onPoints={onPoints} onOpen={onOpen} handleProps={{ ...attributes, ...listeners }} selected={selected} onSelect={onSelect} showCheckbox={showCheckbox} />
    </div>
  )
}

function CreateSprintModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, goal: string) => void }) {
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-card border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-1 border-b">
          <h3 className="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider flex items-center gap-1.5"><Target className="h-4.5 w-4.5 text-indigo-500" /> Create Sprint</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-muted p-1 rounded-lg transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Sprint Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sprint 1 - Core Flow"
              className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Sprint Goal</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Detail the sprint deliverable..."
              rows={2}
              className="w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs bg-background resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs font-bold hover:bg-muted transition-colors">Cancel</button>
          <button
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), goal.trim())}
            className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black disabled:opacity-50 shadow-md transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
