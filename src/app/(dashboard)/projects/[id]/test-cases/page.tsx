"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { SuiteTree } from "./_components/suite-tree"
import { PlanList } from "./_components/plan-list"
import { FacetBar } from "./_components/facet-bar"
import { FilterMenus } from "./_components/filter-menus"
import { CaseTable, KEYS } from "./_components/case-table"
import { DetailPanel } from "./_components/detail-panel"
import { RunDialog } from "./_components/run-dialog"
import { PromptDialog } from "./_components/prompt-dialog"
import { REVIEW_META, REVIEW_ORDER, PRIORITY_ORDER, formatMinutes } from "./_components/config"
import {
  useDeleteCases,
  useMoveCases,
  useBulkUpdate,
  useBulkManualRun,
  useFacets,
  usePlans,
  usePlanMutations,
  exportCasesCsv,
  fetchMatchingIds,
  type BulkPatch,
  type LibraryFilters,
  type RunOptions,
  type SortKey,
} from "./_hooks/use-test-library"
import { useProjectModules } from "@/components/bug-reports/module-select"
import { useProjectTeam } from "@/hooks/use-project-team"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ImportModal } from "@/components/test-cases/import-modal"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import {
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Folder,
  FolderInput,
  Keyboard,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Signal,
  Tag,
  Trash2,
  UserRound,
  Video,
  X,
  Zap,
} from "@/components/ui/icons"

/**
 * Test library.
 *
 * This file owns layout and URL state. Data lives in _hooks, presentation in
 * _components, and every filter is applied by the database. Filters live in
 * the URL so a filtered view is shareable and the back button behaves.
 */

type RunTarget = { ids: string[]; title: string; description?: string; name?: string }

const list = (v: string | null) => v?.split(",").filter(Boolean)

export default function TestLibraryPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const router = useRouter()
  const search = useSearchParams()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectingAll, setSelectingAll] = useState(false)
  const [draggingIds, setDraggingIds] = useState<string[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [pendingDeleteBulk, setPendingDeleteBulk] = useState(false)
  const [runTarget, setRunTarget] = useState<RunTarget | null>(null)
  const [tagDialog, setTagDialog] = useState<"add" | "remove" | null>(null)
  const [newPlanOpen, setNewPlanOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const qc = useQueryClient()
  const moveCases = useMoveCases(projectId)
  const deleteCases = useDeleteCases(projectId)
  const bulkUpdate = useBulkUpdate(projectId)
  const bulkRun = useBulkManualRun(projectId)
  const { data: planData } = usePlans(projectId)
  const planMut = usePlanMutations(projectId)
  const { modules: projectModules } = useProjectModules(projectId)
  const { members } = useProjectTeam(projectId)

  const filters: LibraryFilters = useMemo(
    () => ({
      q: search.get("q") || undefined,
      suite: search.get("suite") || undefined,
      plan: search.get("plan") || undefined,
      status: list(search.get("status")) as LibraryFilters["status"],
      priority: list(search.get("priority")) as LibraryFilters["priority"],
      review: list(search.get("review")) as LibraryFilters["review"],
      tag: list(search.get("tag")),
      assignee: list(search.get("assignee")),
      executionType: (search.get("type") as LibraryFilters["executionType"]) || undefined,
      trace: (search.get("trace") as LibraryFilters["trace"]) || undefined,
      sort: (search.get("sort") as SortKey) || "updatedAt",
      dir: search.get("dir") === "asc" ? "asc" : "desc",
    }),
    [search]
  )

  const { data: facets } = useFacets(projectId, filters)
  const activeId = search.get("case")
  const activePlan = planData?.plans.find((p) => p.id === filters.plan) ?? null

  const push = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(search.toString())
      mutate(p)
      router.replace(`?${p.toString()}`, { scroll: false })
    },
    [router, search]
  )

  const setFilters = (next: LibraryFilters) =>
    push((p) => {
      const set = (k: string, v?: string) => (v ? p.set(k, v) : p.delete(k))
      set("q", next.q)
      set("suite", next.suite)
      set("plan", next.plan)
      set("status", next.status?.join(","))
      set("priority", next.priority?.join(","))
      set("review", next.review?.join(","))
      set("tag", next.tag?.join(","))
      set("assignee", next.assignee?.join(","))
      set("type", next.executionType)
      set("trace", next.trace)
      set("sort", next.sort)
      set("dir", next.dir)
    })

  // Search is typed locally and pushed to the URL after a pause. It used to
  // write the URL — and fire a request — on every keystroke.
  const [searchText, setSearchText] = useState(filters.q ?? "")
  useEffect(() => setSearchText(filters.q ?? ""), [filters.q])
  useEffect(() => {
    if ((searchText || undefined) === filters.q) return
    const t = setTimeout(() => setFilters({ ...filters, q: searchText.trim() || undefined }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText])

  // "/" focuses search, like most list tools.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const openCase = (id: string) => push((p) => p.set("case", id))
  const closeCase = () => push((p) => p.delete("case"))
  // Suite and plan are alternative scopes; picking one clears the other, and
  // the selection, which belonged to the old scope.
  const selectSuite = (suiteId: string | undefined) => {
    setSelectedIds([])
    push((p) => {
      p.delete("plan")
      suiteId ? p.set("suite", suiteId) : p.delete("suite")
    })
  }
  const selectPlan = (planId: string | undefined) => {
    setSelectedIds([])
    push((p) => {
      p.delete("suite")
      planId ? p.set("plan", planId) : p.delete("plan")
    })
  }

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const toggleAll = (ids: string[]) =>
    setSelectedIds((prev) => (ids.every((id) => prev.includes(id)) ? [] : ids))

  async function selectAllMatching() {
    setSelectingAll(true)
    try {
      const { ids, truncated } = await fetchMatchingIds(projectId, filters)
      setSelectedIds(ids)
      if (truncated) toast.warning(`Selected the first ${ids.length} cases — narrow the filters to act on the rest.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't select all")
    } finally {
      setSelectingAll(false)
    }
  }

  // ── Running ────────────────────────────────────────────────────────────────

  async function runCase(tc: { id: string; title: string; executionType: string }) {
    if (tc.executionType === "Manual") {
      setRunTarget({ ids: [tc.id], title: "Run test case", description: tc.title, name: `Manual run: ${tc.title}` })
      return
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: tc.id }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't start the run")
      const data = await res.json()
      router.push(`/projects/${projectId}/test-runs/${data.testRun.id}/report`)
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't start the run")
    }
  }

  async function runPlan() {
    if (!activePlan) return
    try {
      // Deprecated cases are retired — a plan run skips them.
      const { ids } = await fetchMatchingIds(projectId, { plan: activePlan.id, review: ["Draft", "Ready", "Approved"] })
      if (!ids.length) {
        toast.error("This plan has no runnable cases")
        return
      }
      const skipped = activePlan.caseCount - ids.length
      setRunTarget({
        ids,
        title: `Run plan "${activePlan.name}"`,
        description: `${ids.length} cases · est. ${formatMinutes(activePlan.totalMinutes)}${skipped > 0 ? ` · ${skipped} deprecated skipped` : ""}`,
        name: `${activePlan.name} — ${new Date().toLocaleDateString()}`,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the plan")
    }
  }

  async function startRun(options: RunOptions) {
    if (!runTarget) return
    const sessionId = await bulkRun
      .mutateAsync({ testCaseIds: runTarget.ids, options, name: runTarget.name })
      .catch(() => null)
    if (!sessionId) return
    setRunTarget(null)
    // Tell the session where to send us back to, filters included.
    const back = encodeURIComponent(`/projects/${projectId}/test-cases${window.location.search}`)
    router.push(`/projects/${projectId}/manual-sessions/${sessionId}?returnTo=${back}`)
  }

  const hasFilters =
    !!filters.q || !!filters.status?.length || !!filters.trace || !!filters.priority?.length ||
    !!filters.review?.length || !!filters.tag?.length || !!filters.assignee?.length || !!filters.executionType

  const bulk = (patch: BulkPatch) => bulkUpdate.mutate({ testCaseIds: selectedIds, ...patch })

  const menuBtn =
    "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"

  return (
    <div className="flex h-full flex-col overflow-hidden bg-muted/20">
      {/* Header */}
      <header className="shrink-0 space-y-3 border-b bg-card px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FlaskConical className="h-4 w-4" />
              </span>
              Test library
            </h1>
            <p className="text-xs text-muted-foreground">
              Author, organise and execute this project&apos;s manual and automated tests.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-9 gap-2 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/projects/${projectId}/recorder-studio`)}
              className="h-9 gap-2 text-xs"
            >
              <Video className="h-3.5 w-3.5 text-rose-500" /> Record
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const suiteParam =
                  filters.suite && filters.suite !== "unfiled" ? `?suite=${encodeURIComponent(filters.suite)}` : ""
                router.push(`/projects/${projectId}/test-cases/new${suiteParam}`)
              }}
              className="h-9 gap-2 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" /> New test case
            </Button>
          </div>
        </div>

        <FacetBar projectId={projectId} filters={filters} onChange={setFilters} />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left rail */}
        {/* Suites keep a usable minimum; on a short screen the rail scrolls
            rather than squeezing the tree to nothing under the plans. */}
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r bg-card">
          <div className="min-h-[180px] flex-1">
            <SuiteTree
              projectId={projectId}
              selectedSuite={filters.plan ? "__plan__" : filters.suite}
              onSelectSuite={selectSuite}
              draggingCaseIds={draggingIds}
            />
          </div>
          <div className="flex max-h-[40%] min-h-[120px] flex-col">
            <PlanList
              projectId={projectId}
              selectedPlan={filters.plan}
              onSelectPlan={selectPlan}
              draggingCaseIds={draggingIds}
            />
          </div>
        </aside>

        {/* Centre */}
        <main className="flex min-w-0 flex-1 flex-col bg-card">
          {activePlan && (
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-primary/[0.03] px-4 py-3">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{activePlan.name}</p>
                <p className="text-xs text-muted-foreground">
                  {activePlan.caseCount} cases · est. {formatMinutes(activePlan.totalMinutes)}
                  {activePlan.unestimated > 0 && ` (+${activePlan.unestimated} without estimate)`}
                  {" · "}
                  {activePlan.byStatus.Passed ?? 0} passed · {(activePlan.byStatus.Failed ?? 0) + (activePlan.byStatus.Blocked ?? 0)} failing ·{" "}
                  {activePlan.byStatus.NotExecuted ?? 0} not run
                </p>
              </div>
              <Button size="sm" onClick={runPlan} disabled={activePlan.runnable === 0} className="ml-auto h-8 gap-2 text-xs">
                <Play className="h-3.5 w-3.5 fill-current" /> Run plan
              </Button>
              <button
                onClick={() => selectPlan(undefined)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Leave plan view"
                title="Back to all test cases"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (e.currentTarget as HTMLInputElement).blur()}
                placeholder="Search title, preconditions, tag…  ( / )"
                className="h-9 w-64 pl-8 text-xs"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                className={
                  "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors " +
                  (filters.executionType ? "border-primary/50 bg-primary/10 text-primary" : "bg-background hover:bg-accent")
                }
              >
                {filters.executionType ?? "All types"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem onClick={() => setFilters({ ...filters, executionType: undefined })}>All types</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilters({ ...filters, executionType: "Manual" })}>Manual</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilters({ ...filters, executionType: "Automated" })}>Automated</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <FilterMenus projectId={projectId} filters={filters} onChange={setFilters} />

            {hasFilters && (
              <button
                onClick={() => setFilters({ suite: filters.suite, plan: filters.plan, sort: filters.sort, dir: filters.dir })}
                className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts"
              >
                <Keyboard className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 p-2">
                <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Keyboard shortcuts</p>
                {KEYS.map((k) => (
                  <div key={k.key} className="flex items-center justify-between px-1 py-0.5 text-xs">
                    <span>{k.label}</span>
                    <kbd className="rounded border bg-muted px-2 font-sans text-xs">{k.key}</kbd>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {selectedIds.length > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <span className="px-2 text-xs font-medium text-foreground">{selectedIds.length} selected</span>
                <span className="h-4 w-px bg-border" aria-hidden="true" />

                <button
                  type="button"
                  disabled={bulkRun.isPending}
                  onClick={() =>
                    setRunTarget({
                      ids: selectedIds,
                      title: `Run ${selectedIds.length} ${selectedIds.length === 1 ? "case" : "cases"}`,
                      description: "Opens one manual run with every selected case.",
                    })
                  }
                  className={menuBtn}
                  title="Open one manual run with every selected case"
                >
                  <Play className="h-3.5 w-3.5" /> Run
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger className={menuBtn}>
                    <Signal className="h-3.5 w-3.5" /> Priority
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {PRIORITY_ORDER.map((p) => (
                      <DropdownMenuItem key={p} onClick={() => bulk({ priority: p })} className="text-xs">
                        {p}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger className={menuBtn}>
                    <FolderInput className="h-3.5 w-3.5" /> Move
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
                    <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Move to suite</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        moveCases.mutate({ testCaseIds: selectedIds, suiteId: null })
                        setSelectedIds([])
                      }}
                      className="gap-2 text-xs"
                    >
                      <Folder className="h-3.5 w-3.5 text-muted-foreground" /> No suite (Unfiled)
                    </DropdownMenuItem>
                    {projectModules.length > 0 && <DropdownMenuSeparator />}
                    {projectModules.map((m) => (
                      <DropdownMenuItem
                        key={m.id}
                        onClick={() => {
                          moveCases.mutate({ testCaseIds: selectedIds, suiteId: m.id })
                          setSelectedIds([])
                        }}
                        className="gap-2 text-xs"
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                        <span className="truncate" title={m.path}>
                          {m.path}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger className={menuBtn}>
                    <MoreHorizontal className="h-3.5 w-3.5" /> More
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2 text-xs">
                        <UserRound className="h-3.5 w-3.5" /> Assignee
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
                        <DropdownMenuItem className="text-xs" onClick={() => bulk({ assignee: null })}>
                          Unassigned
                        </DropdownMenuItem>
                        {members.some((m) => m.active) && <DropdownMenuSeparator />}
                        {members
                          .filter((m) => m.active)
                          .map((m) => (
                            <DropdownMenuItem key={m.id} className="text-xs" onClick={() => bulk({ assignee: m.id })}>
                              {m.name}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2 text-xs">
                        <ClipboardCheck className="h-3.5 w-3.5" /> Review state
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-44">
                        {REVIEW_ORDER.map((r) => (
                          <DropdownMenuItem key={r} className="text-xs" onClick={() => bulk({ reviewState: r })}>
                            {REVIEW_META[r].label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2 text-xs">
                        <Zap className="h-3.5 w-3.5" /> Type
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-36">
                        <DropdownMenuItem className="text-xs" onClick={() => bulk({ executionType: "Manual" })}>
                          Manual
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs" onClick={() => bulk({ executionType: "Automated" })}>
                          Automated
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2 text-xs" onClick={() => setTagDialog("add")}>
                      <Tag className="h-3.5 w-3.5" /> Add tags…
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 text-xs" onClick={() => setTagDialog("remove")}>
                      <Tag className="h-3.5 w-3.5" /> Remove tags…
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2 text-xs">
                        <ClipboardCheck className="h-3.5 w-3.5" /> Add to plan
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
                        <DropdownMenuItem className="gap-2 text-xs font-medium" onClick={() => setNewPlanOpen(true)}>
                          <Plus className="h-3.5 w-3.5" /> New plan…
                        </DropdownMenuItem>
                        {(planData?.plans.length ?? 0) > 0 && <DropdownMenuSeparator />}
                        {planData?.plans.map((p) => (
                          <DropdownMenuItem
                            key={p.id}
                            className="text-xs"
                            onClick={() => planMut.editCases.mutate({ planId: p.id, add: selectedIds })}
                          >
                            <span className="truncate">{p.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    {activePlan && (
                      <DropdownMenuItem
                        className="gap-2 text-xs"
                        onClick={async () => {
                          await planMut.editCases.mutateAsync({ planId: activePlan.id, remove: selectedIds }).catch(() => null)
                          setSelectedIds([])
                        }}
                      >
                        <X className="h-3.5 w-3.5" /> Remove from this plan
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const n = await exportCasesCsv(selectedIds, `test-cases-${new Date().toISOString().slice(0, 10)}.csv`)
                      toast.success(`Exported ${n} ${n === 1 ? "case" : "cases"}`)
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Export failed")
                    }
                  }}
                  className={menuBtn}
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingDeleteBulk(true)}
                  className="h-7 gap-1 px-2 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>

                <button
                  onClick={() => setSelectedIds([])}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Clear selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1">
            <CaseTable
              projectId={projectId}
              filters={filters}
              onChangeFilters={setFilters}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              onSelectAllMatching={selectAllMatching}
              selectingAll={selectingAll}
              activeId={activeId}
              onOpen={openCase}
              onClose={closeCase}
              onRun={runCase}
              onDragSelection={setDraggingIds}
            />
          </div>
        </main>

        {/* Right — only occupies width when a case is open. */}
        {activeId && (
          <aside className="w-[380px] shrink-0 border-l bg-card">
            <DetailPanel projectId={projectId} testCaseId={activeId} onClose={closeCase} onRun={runCase} />
          </aside>
        )}
      </div>

      <ImportModal
        projectId={projectId}
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImportSuccess={() => {
          setImportOpen(false)
          // Imported rows change counts, suite tallies and the list together.
          qc.invalidateQueries({ queryKey: ["test-library", projectId] })
        }}
      />

      <RunDialog
        open={runTarget !== null}
        title={runTarget?.title ?? ""}
        description={runTarget?.description}
        pending={bulkRun.isPending}
        onCancel={() => setRunTarget(null)}
        onConfirm={startRun}
      />

      <PromptDialog
        open={tagDialog !== null}
        title={tagDialog === "remove" ? `Remove tags from ${selectedIds.length} cases` : `Add tags to ${selectedIds.length} cases`}
        description="Separate several tags with commas, e.g. smoke, regression."
        label="Tags"
        placeholder="smoke, regression"
        confirmLabel={tagDialog === "remove" ? "Remove tags" : "Add tags"}
        suggestions={facets?.tags.slice(0, 30).map((t) => t.tag)}
        pending={bulkUpdate.isPending}
        onCancel={() => setTagDialog(null)}
        onSubmit={async (value) => {
          const tags = Array.from(new Set(value.split(",").map((t) => t.trim()).filter(Boolean)))
          if (!tags.length) return
          await bulkUpdate
            .mutateAsync({ testCaseIds: selectedIds, ...(tagDialog === "remove" ? { removeTags: tags } : { addTags: tags }) })
            .catch(() => null)
          setTagDialog(null)
        }}
      />

      <PromptDialog
        open={newPlanOpen}
        title={`New plan with ${selectedIds.length} ${selectedIds.length === 1 ? "case" : "cases"}`}
        description="A plan is a saved set of cases you can run again, e.g. Smoke or Sprint 14 regression."
        label="Plan name"
        placeholder="Sprint 14 regression"
        confirmLabel="Create plan"
        pending={planMut.create.isPending}
        onCancel={() => setNewPlanOpen(false)}
        onSubmit={async (name) => {
          const res = await planMut.create.mutateAsync({ name, testCaseIds: selectedIds }).catch(() => null)
          setNewPlanOpen(false)
          if (res) selectPlan(res.plan.id)
        }}
      />

      <ConfirmDialog
        open={pendingDeleteBulk}
        variant="danger"
        title={`Delete ${selectedIds.length} test ${selectedIds.length === 1 ? "case" : "cases"}?`}
        description="The selected cases and their steps are deleted. Bugs filed against them and their automated run history are kept. To retire cases without deleting them, set their review state to Deprecated."
        confirmLabel="Delete test cases"
        isLoading={deleteCases.isPending}
        onConfirm={async () => {
          await deleteCases.mutateAsync(selectedIds).catch(() => null)
          if (activeId && selectedIds.includes(activeId)) closeCase()
          setSelectedIds([])
          setPendingDeleteBulk(false)
        }}
        onCancel={() => setPendingDeleteBulk(false)}
      />
    </div>
  )
}
