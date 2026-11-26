"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { format } from "date-fns"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import type { TaskFilters, TaskStatus, TaskPriority } from "@/types/scrum"
import { useScrumMembers, useScrumProject, useScrumSprints } from "@/hooks/scrum/use-scrum"
import { useBoardShortcuts } from "@/hooks/scrum/use-board-shortcuts"
import { DisplayMenu } from "@/components/scrum/board/display-menu"
import { useScrumUI } from "@/stores/scrum-ui"
import { AvatarStack } from "@/components/scrum/shared"
import { BoardView } from "@/components/scrum/board/board-view"
import { SavedViews } from "@/components/scrum/filters/saved-views"
import { BacklogView } from "@/components/scrum/views/backlog-view"
import { ListView } from "@/components/scrum/views/list-view"
import { TimelineView } from "@/components/scrum/views/timeline-view"
import { TaskDrawer } from "@/components/scrum/task/task-detail-drawer"
import { CreateTaskModal } from "@/components/scrum/modals/create-task-modal"
import { CreateEpicModal } from "@/components/scrum/modals/create-epic-modal"
import { CreateSprintModal } from "@/components/scrum/modals/create-sprint-modal"
import { ImportModal } from "@/components/scrum/modals/import-modal"
import { SearchBar } from "@/components/scrum/filters/search-bar"
import { FilterPanel } from "@/components/scrum/filters/filter-panel"
import { usePermission } from "@/hooks/usePermission"
import { TYPE_META } from "@/components/scrum/task/task-detail-config"
import type { TaskType } from "@/types/scrum"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Columns3, List, GanttChartSquare, Plus, Zap, ChevronRight, Layers, Upload, MoreHorizontal } from "@/components/ui/icons"

type View = "board" | "backlog" | "list" | "timeline"

export default function ScrumBoardPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const router = useRouter()
  const search = useSearchParams()

  const { data: members } = useScrumMembers(projectId)
  const { data: project } = useScrumProject(projectId)
  const { openCreateTask, setCreateEpicOpen, setCreateSprintOpen, setImportOpen, openTask } = useScrumUI()
  const { can } = usePermission()

  // Deep link: /projects/:id/scrum?task=<taskId> opens the task drawer
  // (used by notification action URLs).
  const deepLinkTask = search.get("task")
  useEffect(() => {
    if (deepLinkTask) openTask(deepLinkTask)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkTask])

  const issueTypes: TaskType[] = ["STORY", "TASK", "BUG", "TEST_CASE"]
  const canCreateIssues = can("canCreateStories") || can("canCreateEpics")

  const view = (search.get("view") as View) || "board"

  const { data: sprints } = useScrumSprints(projectId)
  const activeSprint = useMemo(() => (sprints ?? []).find((s) => s.status === "ACTIVE") ?? null, [sprints])
  const openTaskId = useScrumUI((s) => s.openTaskId)
  const searchRef = useRef<HTMLInputElement>(null)
  useBoardShortcuts({
    enabled: !openTaskId,
    onSearch: () => searchRef.current?.focus(),
    onCreate: can("canCreateStories")
      ? () => openCreateTask(undefined, view === "board" ? activeSprint?.id : undefined, "STORY")
      : undefined,
  })

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

  // A saved view replaces every filter (keeping an open task open).
  const applyView = (query: string) => {
    if (!query) {
      try { localStorage.removeItem(`scrum.lastQuery.${projectId}`) } catch {}
    }
    const next = new URLSearchParams(query)
    const task = search.get("task")
    if (task) next.set("task", task)
    router.replace(`?${next.toString()}`, { scroll: false })
  }

  // Filters used to reset on every visit. Remember the last ones per project
  // and bring them back when the board is opened without any.
  const lastKey = `scrum.lastQuery.${projectId}`
  useEffect(() => {
    const q = new URLSearchParams(search.toString())
    q.delete("task")
    if (q.toString()) {
      try { localStorage.setItem(lastKey, q.toString()) } catch {}
    }
  }, [search, lastKey])
  useEffect(() => {
    if (search.toString()) return
    try {
      const saved = localStorage.getItem(lastKey)
      if (saved) router.replace(`?${saved}`, { scroll: false })
    } catch {}
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])
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
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Row 1 — where you are, which view, and the actions. */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
        <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center gap-2 text-xs text-muted-foreground">
          <Link href={`/projects/${projectId}`} className="hidden max-w-[10rem] truncate rounded-sm transition-colors hover:text-foreground 2xl:inline">
            {project?.name ?? "…"}
          </Link>
          <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 opacity-50 2xl:inline" />
          <h1 aria-current="page" className="truncate font-medium text-foreground">
            {view === "board" && activeSprint ? activeSprint.name : "Scrum"}
          </h1>
          {view === "board" && activeSprint?.startDate && activeSprint.endDate && (
            <span className="hidden shrink-0 text-xs text-muted-foreground 2xl:inline">
              {format(new Date(activeSprint.startDate), "MMM d")} → {format(new Date(activeSprint.endDate), "MMM d")}
            </span>
          )}
          {project?.boardKey && (
            <span
              title="Board key — the prefix on every issue ID in this project"
              className="shrink-0 rounded border border-border px-1 font-mono text-xs text-muted-foreground"
            >
              {project.boardKey}
            </span>
          )}
        </nav>

        <div role="tablist" aria-label="Board views" className="ml-1 hidden shrink-0 items-center gap-0.5 md:flex">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = view === t.id
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                aria-label={t.label}
                onClick={() => setView(t.id)}
                className={`inline-flex h-7 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "bg-muted text-foreground ring-1 ring-inset ring-border"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> <span className="hidden lg:inline">{t.label}</span>
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SearchBar ref={searchRef} value={filters.search ?? ""} onChange={setSearch} boardKey={project?.boardKey} />
          {view === "board" && <DisplayMenu projectId={projectId} />}
          <FilterPanel projectId={projectId} filters={filters} onChange={setFilters} />
          <SavedViews projectId={projectId} currentQuery={search.toString()} onApply={applyView} />
          {(canCreateIssues || can("canCreateSprints")) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More actions"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {can("canCreateSprints") && (
                  <DropdownMenuItem onClick={() => setCreateSprintOpen(true)} className="gap-2 text-xs">
                    <Zap className="h-3.5 w-3.5 text-amber-500" /> Create sprint
                  </DropdownMenuItem>
                )}
                {canCreateIssues && (
                  <DropdownMenuItem onClick={() => setImportOpen(true)} className="gap-2 text-xs">
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" /> Import issues
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {members && members.length > 0 && (
            <span className="hidden items-center px-1 2xl:flex" title={`${members.length} project member(s)`}>
              <AvatarStack members={members} max={3} size="sm" />
            </span>
          )}
          {canCreateIssues && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex h-7 shrink-0 items-center gap-2 rounded-md bg-primary pl-3 pr-2 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <Plus className="h-3.5 w-3.5" /> New issue
                  <kbd className="rounded bg-primary-foreground/20 px-1 font-sans text-xs">C</kbd>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {can("canCreateEpics") && (
                  <>
                    <DropdownMenuItem onClick={() => setCreateEpicOpen(true)} className="gap-2 text-xs">
                      <Layers className={`h-4 w-4 ${TYPE_META.EPIC.color}`} />
                      <span className="font-medium">Epic</span>
                    </DropdownMenuItem>
                    {can("canCreateStories") && <DropdownMenuSeparator />}
                  </>
                )}
                {can("canCreateStories") &&
                  issueTypes.map((t) => {
                    const meta = TYPE_META[t]
                    const Icon = meta.icon
                    return (
                      <DropdownMenuItem key={t} onClick={() => openCreateTask(undefined, view === "board" ? activeSprint?.id : undefined, t)} className="gap-2 text-xs">
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                        <span className="font-medium">{t === "STORY" ? "User story" : meta.label}</span>
                      </DropdownMenuItem>
                    )
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Small screens: the view tabs drop to their own row. */}
      <div role="tablist" aria-label="Board views" className="flex shrink-0 gap-0.5 border-b border-border bg-card px-3 py-2 md:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={view === t.id}
            onClick={() => setView(t.id)}
            className={`h-7 rounded-md px-3 text-xs font-medium ${view === t.id ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active view. The board draws its own second row (sprint + quick filters). */}
      <div className={`min-h-0 flex-1 overflow-hidden ${view === "board" ? "" : "p-4"}`}>
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
      <ImportModal projectId={projectId} />
    </div>
  )
}
