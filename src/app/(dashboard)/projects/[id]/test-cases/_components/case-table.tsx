"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useEffect, useMemo, useRef, useState } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { useRouter } from "next/navigation"
import {
  useCaseBrowse,
  useCaseDetail,
  useMoveCases,
  useDeleteCases,
  useBulkUpdate,
  useDuplicateCase,
  usePlans,
  usePlanMutations,
  type CaseRow,
  type CasePriority,
  type LibraryFilters,
  type ReviewState,
  type SortKey,
} from "../_hooks/use-test-library"
import { useProjectModules, type ProjectModule } from "@/components/bug-reports/module-select"
import { useProjectTeam, type TeamMember } from "@/hooks/use-project-team"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  STATUS_META,
  PRIORITY_META,
  PRIORITY_ORDER,
  REVIEW_META,
  REVIEW_ORDER,
  formatMinutes,
  initials,
  relativeTime,
} from "./config"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bug,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  CloudUpload,
  Copy,
  Edit2,
  FlaskConical,
  Folder,
  FolderInput,
  Link2,
  Loader2,
  MoreHorizontal,
  Play,
  Plus,
  Trash2,
  UserRound,
  Zap,
} from "@/components/ui/icons"

/**
 * The case list.
 *
 * Columns are shown or hidden according to the width of THIS PANEL, measured
 * with a ResizeObserver — not Tailwind's `lg:` / `xl:` breakpoints, which read
 * the viewport. On a wide monitor every breakpoint matched, so all columns
 * rendered even when the detail panel had squeezed the centre, and the title
 * collapsed to a couple of characters.
 *
 * Priority, assignee and review state are editable in the row. J/K move
 * through the list; see KEYS below for the rest.
 */

const COL = {
  select: 32,
  suite: 130,
  priority: 80,
  assignee: 120,
  type: 90,
  lastRun: 124,
  links: 72,
  actions: 32,
} as const

const GAP = 12
/** Never let the title get narrower than this before dropping a column. */
const MIN_TITLE = 300

export const KEYS: { key: string; label: string }[] = [
  { key: "J / K", label: "Next / previous case" },
  { key: "Enter", label: "Open case" },
  { key: "Space", label: "Expand steps" },
  { key: "X", label: "Select case" },
  { key: "E", label: "Edit case" },
  { key: "R", label: "Run case" },
  { key: "/", label: "Search" },
  { key: "Esc", label: "Close panel" },
]

/**
 * Decides which optional columns fit, dropping them in reverse priority order.
 * Pure so it can be reasoned about (and tested) without a DOM.
 */
export function visibleColumns(width: number) {
  // Least → most important. Dropped from the front as space runs out.
  const order = ["type", "links", "suite", "assignee", "priority"] as const
  const shown = new Set<(typeof order)[number]>(order)

  const used = () =>
    COL.select +
    COL.lastRun +
    COL.actions +
    Array.from(shown).reduce((sum, k) => sum + COL[k], 0) +
    GAP * (shown.size + 3)

  for (const key of order) {
    if (width - used() >= MIN_TITLE) break
    shown.delete(key)
  }

  return {
    suite: shown.has("suite"),
    priority: shown.has("priority"),
    assignee: shown.has("assignee"),
    type: shown.has("type"),
    links: shown.has("links"),
  }
}

type Visible = ReturnType<typeof visibleColumns>

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  return { ref, width }
}

/** True while focus is in a field or a dialog/menu is open — shortcuts stay out of the way. */
function typingOrModal(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return true
  return !!document.querySelector('[role="dialog"], [role="menu"]')
}

export function CaseTable({
  projectId,
  filters,
  onChangeFilters,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onSelectAllMatching,
  selectingAll,
  activeId,
  onOpen,
  onClose,
  onRun,
  onDragSelection,
}: {
  projectId: string
  filters: LibraryFilters
  onChangeFilters: (next: LibraryFilters) => void
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleAll: (ids: string[]) => void
  onSelectAllMatching: () => void
  selectingAll: boolean
  activeId: string | null
  onOpen: (id: string) => void
  onClose: () => void
  onRun: (row: CaseRow) => void
  onDragSelection: (ids: string[]) => void
}) {
  const router = useRouter()
  const moveCases = useMoveCases(projectId)
  const deleteCases = useDeleteCases(projectId)
  const bulkUpdate = useBulkUpdate(projectId)
  const duplicate = useDuplicateCase(projectId)
  const { data: planData } = usePlans(projectId)
  const { editCases } = usePlanMutations(projectId)
  const { modules: projectModules } = useProjectModules(projectId)
  const { members } = useProjectTeam(projectId)
  const [pendingDeleteCase, setPendingDeleteCase] = useState<CaseRow | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const virtuoso = useRef<VirtuosoHandle>(null)

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCaseBrowse(projectId, filters)

  const { ref, width } = useContainerWidth<HTMLDivElement>()
  const visible = useMemo(() => visibleColumns(width || 900), [width])

  const rows = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data])
  const total = data?.pages[0]?.total ?? rows.length
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id))
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const plans = planData?.plans ?? []

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // ── Keyboard flow ──────────────────────────────────────────────────────────
  // Kept in a ref so the listener is attached once but always sees fresh rows.
  const kb = useRef({ rows, activeId, onOpen, onClose, onRun, onToggleSelect, toggleExpand, hasNextPage, fetchNextPage })
  kb.current = { rows, activeId, onOpen, onClose, onRun, onToggleSelect, toggleExpand, hasNextPage, fetchNextPage }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || typingOrModal(e)) return
      // Enter/Space on a focused button or link belong to that control.
      const tag = (e.target as HTMLElement | null)?.tagName
      if ((e.key === "Enter" || e.key === " ") && (tag === "BUTTON" || tag === "A")) return
      const s = kb.current
      const idx = s.rows.findIndex((r) => r.id === s.activeId)
      const active = idx >= 0 ? s.rows[idx] : null
      const go = (i: number) => {
        const row = s.rows[i]
        if (!row) return
        s.onOpen(row.id)
        virtuoso.current?.scrollIntoView({ index: i, behavior: "auto" })
        if (i >= s.rows.length - 3 && s.hasNextPage) s.fetchNextPage()
      }
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault()
          go(idx < 0 ? 0 : Math.min(idx + 1, s.rows.length - 1))
          break
        case "k":
        case "ArrowUp":
          e.preventDefault()
          go(idx <= 0 ? 0 : idx - 1)
          break
        case "Enter":
          if (active) s.onOpen(active.id)
          else go(0)
          break
        case " ":
          if (active) {
            e.preventDefault()
            s.toggleExpand(active.id)
          }
          break
        case "x":
          if (active) s.onToggleSelect(active.id)
          break
        case "e":
          if (active) router.push(`/projects/${projectId}/test-cases/${active.id}/edit`)
          break
        case "r":
          if (active) s.onRun(active)
          break
        case "Escape":
          if (s.activeId) s.onClose()
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [projectId, router])

  function setSort(key: SortKey) {
    const sameKey = filters.sort === key
    onChangeFilters({
      ...filters,
      sort: key,
      dir: sameKey && filters.dir === "desc" ? "asc" : "desc",
    })
  }

  if (isError) {
    const message = (error as Error)?.message ?? ""
    const needsMigration = /migration/i.test(message)

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div
          className={cn(
            "rounded-full p-3",
            needsMigration ? "bg-amber-500/10 text-amber-600" : "bg-destructive/10 text-destructive"
          )}
        >
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold">
          {needsMigration ? "Database migration required" : "Couldn't load test cases"}
        </p>
        {needsMigration ? (
          <div className="max-w-md space-y-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              The test library needs the <code className="rounded bg-muted px-1">TestSuite</code>{" "}
              table and the execution rollup columns. Run these, then reload:
            </p>
            <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-left text-xs leading-relaxed">
{`npx prisma generate
npx prisma db push
npx tsx scripts/backfill-test-suites.ts --apply`}
            </pre>
          </div>
        ) : (
          <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
        )}
      </div>
    )
  }

  const SortButton = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <button
      onClick={() => setSort(sortKey)}
      className="inline-flex items-center gap-1 truncate transition-colors hover:text-foreground"
    >
      {label}
      {filters.sort === sortKey &&
        (filters.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)}
    </button>
  )

  const filtered =
    !!filters.q || !!filters.status?.length || !!filters.trace || !!filters.suite || !!filters.priority?.length ||
    !!filters.review?.length || !!filters.tag?.length || !!filters.assignee?.length || !!filters.executionType ||
    !!filters.plan

  // Header checkbox selects the loaded rows; this offers the rest.
  const showSelectAllBanner = allVisibleSelected && total > rows.length && selectedIds.length < total

  return (
    <div ref={ref} className="flex h-full flex-col">
      {/* Header — mirrors Row's column widths exactly. */}
      <div
        className="flex shrink-0 items-center border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground"
        style={{ gap: GAP }}
      >
        <div style={{ width: COL.select }} className="shrink-0">
          <input
            type="checkbox"
            aria-label="Select all loaded"
            checked={allVisibleSelected}
            disabled={rows.length === 0}
            onChange={() => onToggleAll(rows.map((r) => r.id))}
            className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--primary))]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <SortButton label="Title" sortKey="title" />
        </div>
        {visible.suite && (
          <div style={{ width: COL.suite }} className="shrink-0 truncate">
            Suite
          </div>
        )}
        {visible.priority && (
          <div style={{ width: COL.priority }} className="shrink-0">
            <SortButton label="Priority" sortKey="priority" />
          </div>
        )}
        {visible.assignee && (
          <div style={{ width: COL.assignee }} className="shrink-0 truncate">
            Assignee
          </div>
        )}
        {visible.type && (
          <div style={{ width: COL.type }} className="shrink-0">
            <SortButton label="Type · est." sortKey="estimatedMinutes" />
          </div>
        )}
        <div style={{ width: COL.lastRun }} className="shrink-0">
          <SortButton label="Last run" sortKey="lastRunAt" />
        </div>
        {visible.links && (
          <div style={{ width: COL.links }} className="shrink-0 truncate">
            Links
          </div>
        )}
        <div style={{ width: COL.actions }} className="shrink-0" />
      </div>

      {showSelectAllBanner && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs">
          <span className="text-muted-foreground">All {rows.length} loaded cases are selected.</span>
          <button
            onClick={onSelectAllMatching}
            disabled={selectingAll}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-60"
          >
            {selectingAll && <BusyDot />}
            Select all {total} matching cases
          </button>
        </div>
      )}
      {selectedIds.length > rows.length && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs">
          <span className="text-muted-foreground">All {selectedIds.length} matching cases are selected.</span>
          <button onClick={() => onToggleAll([])} className="font-medium text-primary hover:underline">
            Clear selection
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-1 p-3" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <FlaskConical className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold">{filtered ? "No test cases match" : "No test cases yet"}</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            {filters.plan
              ? "This plan is empty. Select cases in All test cases, then More → Add to plan — or drag them onto the plan."
              : filtered
                ? "Try clearing a filter, or pick a different suite."
                : "Create one manually, record a session, or import from a spreadsheet."}
          </p>
          {filters.suite && filters.suite !== "unfiled" && (
            <Button
              size="sm"
              onClick={() =>
                router.push(`/projects/${projectId}/test-cases/new?suite=${encodeURIComponent(filters.suite!)}`)
              }
              className="mt-2 h-8 gap-2 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" /> Add test case in this suite
            </Button>
          )}
        </div>
      ) : (
        <Virtuoso
          ref={virtuoso}
          className="flex-1"
          data={rows}
          endReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage()
          }}
          itemContent={(_, row) => (
            <Row
              key={row.id}
              projectId={projectId}
              row={row}
              visible={visible}
              checked={selectedIds.includes(row.id)}
              active={activeId === row.id}
              expanded={expanded.has(row.id)}
              projectModules={projectModules}
              members={members}
              assignee={row.assignee ? memberById.get(row.assignee) ?? null : null}
              plans={plans}
              onToggle={() => onToggleSelect(row.id)}
              onToggleExpand={() => toggleExpand(row.id)}
              onOpen={() => onOpen(row.id)}
              onRun={() => onRun(row)}
              onMoveToSuite={(suiteId) => moveCases.mutate({ testCaseIds: [row.id], suiteId })}
              onPatch={(patch) => bulkUpdate.mutate({ testCaseIds: [row.id], ...patch })}
              onDuplicate={() => duplicate.mutate(row.id)}
              onAddToPlan={(planId) => editCases.mutate({ planId, add: [row.id] })}
              onDelete={() => setPendingDeleteCase(row)}
              onDragStart={() => onDragSelection(selectedIds.includes(row.id) ? selectedIds : [row.id])}
              onDragEnd={() => onDragSelection([])}
            />
          )}
          components={{
            Footer: () =>
              isFetchingNextPage ? (
                <p className="py-3 text-center text-xs text-muted-foreground">Loading more…</p>
              ) : hasNextPage ? (
                <div className="h-4" />
              ) : (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  {rows.length} {rows.length === 1 ? "case" : "cases"}
                </p>
              ),
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteCase !== null}
        variant="danger"
        title={`Delete "${pendingDeleteCase?.title}"?`}
        description="The test case and its steps are deleted. Bugs filed against it and its automated run history are kept. To retire a case without losing anything, set it to Deprecated instead."
        confirmLabel="Delete test case"
        isLoading={deleteCases.isPending}
        onConfirm={async () => {
          if (!pendingDeleteCase) return
          await deleteCases.mutateAsync([pendingDeleteCase.id])
          if (activeId === pendingDeleteCase.id) onClose()
          setPendingDeleteCase(null)
        }}
        onCancel={() => setPendingDeleteCase(null)}
      />
    </div>
  )
}

function Row({
  projectId,
  row,
  visible,
  checked,
  active,
  expanded,
  projectModules,
  members,
  assignee,
  plans,
  onToggle,
  onToggleExpand,
  onOpen,
  onRun,
  onMoveToSuite,
  onPatch,
  onDuplicate,
  onAddToPlan,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  projectId: string
  row: CaseRow
  visible: Visible
  checked: boolean
  active: boolean
  expanded: boolean
  projectModules: ProjectModule[]
  members: TeamMember[]
  assignee: TeamMember | null
  plans: { id: string; name: string }[]
  onToggle: () => void
  onToggleExpand: () => void
  onOpen: () => void
  onRun: () => void
  onMoveToSuite: (suiteId: string | null) => void
  onPatch: (patch: { priority?: CasePriority; reviewState?: ReviewState; assignee?: string | null }) => void
  onDuplicate: () => void
  onAddToPlan: (planId: string) => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const router = useRouter()
  const status = STATUS_META[row.lastStatus]
  const StatusIcon = status.icon
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const deprecated = row.reviewState === "Deprecated"

  return (
    <div className={cn("border-b", active && "bg-primary/5", checked && "bg-primary/[0.07]")}>
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onOpen}
        data-active={active || undefined}
        style={{ gap: GAP }}
        className={cn(
          "group flex cursor-pointer items-center px-4 py-3 text-sm transition-colors",
          !active && "hover:bg-accent/40",
          active && "shadow-[inset_2px_0_0_hsl(var(--primary))]"
        )}
      >
        <div style={{ width: COL.select }} className="flex shrink-0 items-center gap-0.5" onClick={stop}>
          <input
            type="checkbox"
            aria-label={`Select ${row.title}`}
            checked={checked}
            onChange={onToggle}
            className="h-3.5 w-3.5 cursor-pointer accent-[hsl(var(--primary))]"
          />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            onClick={(e) => {
              stop(e)
              onToggleExpand()
            }}
            aria-label={expanded ? "Hide steps" : "Show steps"}
            aria-expanded={expanded}
            title={`${row.stepCount} ${row.stepCount === 1 ? "step" : "steps"}`}
            className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
          </button>
          <StatusIcon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              row.lastStatus === "Passed" && "text-emerald-500",
              row.lastStatus === "Failed" && "text-red-500",
              row.lastStatus === "Blocked" && "text-orange-500",
              row.lastStatus === "Warning" && "text-amber-500",
              (row.lastStatus === "NotExecuted" || row.lastStatus === "Skipped") && "text-muted-foreground/50"
            )}
          />
          <span
            className={cn(
              "min-w-[6rem] shrink truncate font-medium",
              deprecated && "text-muted-foreground line-through"
            )}
            title={row.title}
          >
            {row.title}
          </span>

          {/* The review badge always shows in full; tags give way before the title does. */}
          {row.reviewState !== "Ready" && (
            <DropdownMenu>
              <DropdownMenuTrigger
                onClick={stop}
                title={REVIEW_META[row.reviewState].hint}
                className={cn(
                  "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
                  REVIEW_META[row.reviewState].chip
                )}
              >
                {REVIEW_META[row.reviewState].label}
              </DropdownMenuTrigger>
              <ReviewMenu current={row.reviewState} onPick={(r) => onPatch({ reviewState: r })} />
            </DropdownMenu>
          )}

          <span className="flex min-w-0 shrink-[3] items-center gap-2 overflow-hidden">

          {row.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="hidden shrink-0 rounded border px-2 py-0.5 text-xs text-muted-foreground sm:inline"
            >
              {t}
            </span>
          ))}
          {row.tags.length > 2 && (
            <span className="shrink-0 text-xs text-muted-foreground" title={row.tags.slice(2).join(", ")}>
              +{row.tags.length - 2}
            </span>
          )}
          {row.isOrphan && (
            <span
              title="Not linked to any user story"
              aria-label="Not linked to any user story"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            />
          )}
          </span>
        </div>

        {visible.suite && (
          <div style={{ width: COL.suite }} className="shrink-0 truncate text-xs text-muted-foreground">
            {row.suite?.name ?? <span className="opacity-50">Unfiled</span>}
          </div>
        )}

        {visible.priority && (
          <div style={{ width: COL.priority }} className="shrink-0" onClick={stop}>
            <DropdownMenu>
              <DropdownMenuTrigger
                title="Change priority"
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold transition-shadow hover:ring-1 hover:ring-border",
                  PRIORITY_META[row.priority].chip
                )}
              >
                {PRIORITY_META[row.priority].label}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-32">
                {PRIORITY_ORDER.map((p) => (
                  <DropdownMenuItem
                    key={p}
                    onClick={() => p !== row.priority && onPatch({ priority: p })}
                    className={cn("text-xs", p === row.priority && "font-semibold")}
                  >
                    {p}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {visible.assignee && (
          <div style={{ width: COL.assignee }} className="shrink-0" onClick={stop}>
            <DropdownMenu>
              <DropdownMenuTrigger
                title="Change assignee"
                className="inline-flex max-w-full items-center gap-2 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {assignee || row.assignee ? (
                  <>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(assignee?.name ?? row.assignee ?? "")}
                    </span>
                    <span className="truncate">{assignee?.name ?? row.assignee}</span>
                  </>
                ) : (
                  <>
                    <UserRound className="h-3.5 w-3.5 opacity-50" />
                    <span className="opacity-60">Unassigned</span>
                  </>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
                <DropdownMenuItem className="text-xs" onClick={() => onPatch({ assignee: null })}>
                  Unassigned
                </DropdownMenuItem>
                {members.filter((m) => m.active).length > 0 && <DropdownMenuSeparator />}
                {members
                  .filter((m) => m.active)
                  .map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      className={cn("gap-2 text-xs", m.id === row.assignee && "font-semibold")}
                      onClick={() => onPatch({ assignee: m.id })}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(m.name)}
                      </span>
                      <span className="truncate">{m.name}</span>
                    </DropdownMenuItem>
                  ))}
                {members.length === 0 && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    No team members yet — add them on the project&apos;s Team tab.
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {visible.type && (
          <div style={{ width: COL.type }} className="shrink-0 truncate text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {row.executionType === "Automated" ? (
                <Zap className="h-3 w-3 shrink-0 text-violet-500" />
              ) : (
                <ClipboardList className="h-3 w-3 shrink-0" />
              )}
              {row.executionType === "Automated" ? "Auto" : "Manual"}
              {row.estimatedMinutes != null && (
                <span className="tabular-nums">· {formatMinutes(row.estimatedMinutes)}</span>
              )}
            </span>
          </div>
        )}

        <div style={{ width: COL.lastRun }} className="shrink-0 truncate text-xs">
          <span className={cn("rounded px-2 py-0.5", status.chip)}>{status.label}</span>
          {row.lastRunAt && (
            <span className="ml-2 tabular-nums text-muted-foreground">{relativeTime(row.lastRunAt)}</span>
          )}
        </div>

        {visible.links && (
          <div style={{ width: COL.links }} className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {row.requirementCount > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`${row.requirementCount} linked story(s)`}>
                <Link2 className="h-3 w-3" />
                {row.requirementCount}
              </span>
            )}
            {row.openBugCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400"
                title={`${row.openBugCount} open bug(s)`}
              >
                <Bug className="h-3 w-3" />
                {row.openBugCount}
              </span>
            )}
            {row.sync && (
              <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400" title="Synced to tracker">
                <CloudUpload className="h-3 w-3" />
              </span>
            )}
          </div>
        )}

        {/* Row action menu */}
        <div style={{ width: COL.actions }} className="flex shrink-0 items-center justify-end" onClick={stop}>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${row.title}`}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onRun} className="gap-2 text-xs">
                <Play className="h-3.5 w-3.5" /> Run
                <span className="ml-auto text-xs text-muted-foreground">R</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push(`/projects/${projectId}/test-cases/${row.id}/edit`)}
                className="gap-2 text-xs"
              >
                <Edit2 className="h-3.5 w-3.5" /> Edit
                <span className="ml-auto text-xs text-muted-foreground">E</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} className="gap-2 text-xs">
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 text-xs">
                  <FolderInput className="h-3.5 w-3.5" /> Move to suite
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 w-52 overflow-y-auto">
                  <DropdownMenuItem onClick={() => onMoveToSuite(null)} className="gap-2 text-xs font-medium">
                    <Folder className="h-3.5 w-3.5 text-muted-foreground" /> — Unfiled —
                  </DropdownMenuItem>
                  {projectModules.length > 0 && <DropdownMenuSeparator />}
                  {projectModules.map((m) => (
                    <DropdownMenuItem key={m.id} onClick={() => onMoveToSuite(m.id)} className="gap-2 text-xs">
                      <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                      <span className="truncate" title={m.path}>
                        {m.path}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 text-xs">
                  <ClipboardCheck className="h-3.5 w-3.5" /> Add to plan
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 w-52 overflow-y-auto">
                  {plans.length === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      No plans yet — create one with + under Test plans.
                    </p>
                  )}
                  {plans.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => onAddToPlan(p.id)} className="text-xs">
                      <span className="truncate">{p.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2 text-xs">
                  <ClipboardList className="h-3.5 w-3.5" /> Review state
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  {REVIEW_ORDER.map((r) => (
                    <DropdownMenuItem
                      key={r}
                      onClick={() => r !== row.reviewState && onPatch({ reviewState: r })}
                      className={cn("text-xs", r === row.reviewState && "font-semibold")}
                    >
                      {REVIEW_META[r].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {expanded && <StepPreview projectId={projectId} testCaseId={row.id} />}
    </div>
  )
}

function ReviewMenu({ current, onPick }: { current: ReviewState; onPick: (r: ReviewState) => void }) {
  return (
    <DropdownMenuContent align="start" className="w-48" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Review state</DropdownMenuLabel>
      {REVIEW_ORDER.map((r) => (
        <DropdownMenuItem
          key={r}
          onClick={() => r !== current && onPick(r)}
          className={cn("flex-col items-start gap-0 text-xs", r === current && "font-semibold")}
        >
          {REVIEW_META[r].label}
          <span className="text-xs font-normal text-muted-foreground">{REVIEW_META[r].hint}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  )
}

/** Steps shown in place, so a tester can scan cases without opening each one. */
function StepPreview({ projectId, testCaseId }: { projectId: string; testCaseId: string }) {
  const { data, isLoading } = useCaseDetail(projectId, testCaseId)
  const steps: { id: string; stepNumber: number; actionDescription: string; expectedResult: string }[] =
    data?.testCase?.steps ?? []

  return (
    <div className="space-y-1 pb-3 pl-20 pr-4 text-xs">
      {isLoading && <p className="text-muted-foreground">Loading steps…</p>}
      {!isLoading && data?.testCase?.preconditions && (
        <p className="mb-2 whitespace-pre-wrap text-muted-foreground">
          <span className="font-medium text-foreground">Preconditions: </span>
          {data.testCase.preconditions}
        </p>
      )}
      {!isLoading && steps.length === 0 && <p className="text-muted-foreground">No steps defined yet.</p>}
      {steps.map((s) => (
        <div key={s.id} className="grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)] gap-3 rounded px-1 py-1 hover:bg-muted/40">
          <span className="tabular-nums text-muted-foreground">{s.stepNumber}.</span>
          <span className="whitespace-pre-wrap">{s.actionDescription}</span>
          <span className="whitespace-pre-wrap text-emerald-700 dark:text-emerald-400">{s.expectedResult || "—"}</span>
        </div>
      ))}
    </div>
  )
}
