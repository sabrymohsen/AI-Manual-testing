"use client"

import { useCallback, useMemo } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import type { TaskFilters, TaskStatus, TaskPriority } from "@/types/scrum"
import { useScrumMembers } from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { AvatarStack } from "@/components/scrum/shared"
import { BoardView } from "@/components/scrum/board/board-view"
import { BacklogView } from "@/components/scrum/views/backlog-view"
import { ListView } from "@/components/scrum/views/list-view"
import { TimelineView } from "@/components/scrum/views/timeline-view"
import { TaskDrawer } from "@/components/scrum/task/task-detail-drawer"
import { CreateTaskModal } from "@/components/scrum/modals/create-task-modal"
import { CreateEpicModal } from "@/components/scrum/modals/create-epic-modal"
import { CreateSprintModal } from "@/components/scrum/modals/create-sprint-modal"
import { SearchBar } from "@/components/scrum/filters/search-bar"
import { FilterPanel } from "@/components/scrum/filters/filter-panel"
import { Columns3, List, GanttChartSquare, Plus, Zap, ChevronRight, Layers } from "lucide-react"

type View = "board" | "backlog" | "list" | "timeline"

export default function ScrumBoardPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const router = useRouter()
  const search = useSearchParams()

  const { data: members } = useScrumMembers(projectId)
  const { openCreateTask, setCreateEpicOpen, setCreateSprintOpen } = useScrumUI()

  const view = (search.get("view") as View) || "board"

  const filters: TaskFilters = useMemo(
    () => ({
      search: search.get("q") || undefined,
      status: (search.get("status")?.split(",").filter(Boolean) as TaskStatus[]) || undefined,
      priority: (search.get("priority")?.split(",").filter(Boolean) as TaskPriority[]) || undefined,
      assignee: search.get("assignee")?.split(",").filter(Boolean) || undefined,
      sprint: search.get("sprint") || undefined,
      epic: search.get("epic") || undefined,
    }),
    [search]
  )

  const pushParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(search.toString())
      mutate(p)
      router.replace(`?${p.toString()}`, { scroll: false })
    },
    [router, search]
  )

  const setView = (v: View) => pushParams((p) => p.set("view", v))
  const setSearch = (q: string) => pushParams((p) => (q ? p.set("q", q) : p.delete("q")))

  const setFilters = (next: TaskFilters) =>
    pushParams((p) => {
      const arr = (k: string, v?: string[]) => (v?.length ? p.set(k, v.join(",")) : p.delete(k))
      arr("status", next.status)
      arr("priority", next.priority)
      arr("assignee", next.assignee)
      next.sprint ? p.set("sprint", next.sprint) : p.delete("sprint")
      next.epic ? p.set("epic", next.epic) : p.delete("epic")
      next.search ? p.set("q", next.search) : p.delete("q")
    })

  const tabs: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "board", label: "Board", icon: Columns3 },
    { id: "backlog", label: "Backlog", icon: Layers },
    { id: "list", label: "List", icon: List },
    { id: "timeline", label: "Timeline", icon: GanttChartSquare },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b bg-background px-6 py-3">
        <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span>Projects</span>
          <ChevronRight className="h-3 w-3" />
          <span>System Platform</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-semibold text-foreground">Scrum Board</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">Scrum Board</h1>
            <SearchBar value={filters.search ?? ""} onChange={setSearch} />
            {members && members.length > 0 && <AvatarStack members={members} max={3} />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreateEpicOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-semibold hover:bg-muted"
            >
              <Plus className="h-4 w-4 text-muted-foreground" /> Create Epic
            </button>
            <button
              onClick={() => setCreateSprintOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Zap className="h-4 w-4" /> Create Sprint
            </button>
          </div>
        </div>
      </header>

      {/* Tabs + toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-6">
        <div className="flex gap-1">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = view === t.id
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 py-1.5">
          <FilterPanel projectId={projectId} filters={filters} onChange={setFilters} />
          <button
            onClick={() => openCreateTask()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Task
          </button>
        </div>
      </div>

      {/* Active view */}
      <div className="flex-1 overflow-hidden bg-muted/20 p-4">
        {view === "board" && <BoardView projectId={projectId} filters={filters} />}
        {view === "backlog" && <BacklogView projectId={projectId} filters={filters} />}
        {view === "list" && <ListView projectId={projectId} filters={filters} />}
        {view === "timeline" && <TimelineView projectId={projectId} filters={filters} />}
      </div>

      {/* Overlays */}
      <TaskDrawer projectId={projectId} />
      <CreateTaskModal projectId={projectId} />
      <CreateEpicModal projectId={projectId} />
      <CreateSprintModal projectId={projectId} />
    </div>
  )
}
