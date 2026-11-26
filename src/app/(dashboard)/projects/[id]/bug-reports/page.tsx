"use client"

import { toast as notify } from "sonner"
import { CountUp } from "@/components/ui/count-up"
import { BusyDot } from "@/components/ui/skeleton"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { ActiveProjectContextBar } from "@/components/ui/active-project-context-bar"
import { CreateBugModal } from "@/components/bug-reports/create-bug-modal"
import RebuildTrackerBugsModal from "@/components/bug-reports/rebuild-tracker-bugs-modal"
import CreateBugBoardModal from "@/components/bug-reports/create-bug-board-modal"
import BugStatusMappingModal from "@/components/bug-reports/bug-status-mapping-modal"
import QaReportModal from "@/components/bug-reports/qa-report-modal"
import ImportPdfBugsModal from "@/components/bug-reports/import-pdf-bugs-modal"
import { ModuleSelect, useProjectModules } from "@/components/bug-reports/module-select"
import { LinkedRequirementsSelector } from "@/components/test-cases/linked-requirements-selector"
import { RequirementLink } from "@/components/requirements/requirement-link"
import { useProjectIntegration } from "@/hooks/use-project-integration"
import { 
  Bug, 
  Search, 
  Plus, 
  RefreshCw, 
  ExternalLink, 
  ArrowRight, 
  Play, 
  Video, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  Activity, 
  Sparkles, 
  Layers, 
  FileText, 
  Clock, 
  Trash2, 
  X, 
  Globe, 
  Terminal,
  Paperclip,
  Check,
  Send,
  Eye,
  PlusCircle,
  FolderMinus,
  CheckSquare,
  UserPlus,
  Kanban,
  Link2,
  Copy,
  MoreHorizontal,
  ChevronDown,
  Pencil,
  Tag,
  GitCompare,
  AlertTriangle,
  Download,
  FileBarChart,
  FileUp
} from "@/components/ui/icons"
import { LinkedEntities } from "@/components/entity-links/linked-entities"
import { BugReproduction } from "@/components/bug-reports/bug-reproduction"
import { BugTriagePanel } from "@/components/bug-reports/bug-triage-panel"
import {
  useBugShortcuts,
  ShortcutHelp,
  useUndoableDelete,
  UndoBar,
  SavedViews,
  type BugFilters,
} from "@/components/bug-reports/bug-page-helpers"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface TestStep {
  id?: string
  stepNumber: number
  actionDescription: string
  expectedResult?: string | null
  actualResult?: string | null
}

interface BugOccurrence {
  id: string
  testRunId: string
  occurredAt: string
  evidence: any
}

interface BugComment {
  id: string
  comment: string
  authorId: string | null
  createdAt: string
}

interface BugActivity {
  id: string
  action: string
  details: string | null
  createdAt: string
}

/** How often the page re-reads the tracker in the background. */
const AUTO_PULL_INTERVAL_MS = 60_000

/** "12s ago" / "3m ago" — coarse on purpose; the exact time is in the tooltip. */
function sinceLabel(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

interface BugReport {
  id: string
  bugKey: string | null
  title: string
  severity: "Low" | "Medium" | "High" | "Critical"
  priority: "Low" | "Medium" | "High" | "Critical"
  status: "Open" | "InProgress" | "ReadyForRetest" | "Reopened" | "Resolved" | "Closed" | "Rejected" | "Duplicate"
  resolution?: "Fixed" | "WontFix" | "CannotReproduce" | "Duplicate" | "ByDesign" | null
  resolutionNote?: string | null
  tags?: string[]
  source?: string | null
  reporter?: { id: string; name: string | null; email: string } | null
  environment: string
  roleUsed: string
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
  screenshotPath: string | null
  consoleLogs: string | null
  networkErrors: string | null
  browser: string
  viewport: string
  pageUrl: string | null
  osInfo: string | null
  screenResolution: string | null
  videoUrl: string | null
  createdAt: string
  updatedAt: string
  testCaseId: string | null
  testRunId: string | null
  testCase?: { id: string; title: string } | null
  /** Module/service the defect is filed under; null = Unfiled. */
  suiteId?: string | null
  suite?: { id: string; name: string } | null
  testRun?: { id: string; status: string; browserType: string; createdAt: string } | null
  manualTestSession?: { id: string; name: string } | null
  // Present on the single-bug detail response. The LIST endpoint deliberately
  // returns counts instead — it used to ship every comment, activity and
  // occurrence for every bug to render rows that showed none of them.
  comments?: BugComment[]
  activities?: BugActivity[]
  occurrences?: BugOccurrence[]
  commentCount?: number
  activityCount?: number
  /** Times this defect has recurred across test runs. */
  occurrenceCount?: number
  /** Times this bug has been reopened after being settled. */
  reopenCount?: number
  /** Whole days since the bug was filed, computed server-side. */
  ageDays?: number
  openProjectSyncStatus?: string
  assignedTo?: string | null
  openProjectParentId?: string | null
  openProjectBoardId?: string | null
  openProjectBoardColumnId?: string | null
  openProjectCustomFields?: Record<string, { kind: string; value: any }> | null
}

interface OpBugField {
  key: string
  name: string
  required: boolean
  fieldType: string
  isMulti: boolean
  isLink: boolean
  isFormattable: boolean
  allowedValues: Array<{ href: string; title: string }>
}

interface OpBoardColumn {
  widgetId: number
  name: string
  queryId: string | null
  columnType: string
  attributeId: string | null
}

/**
 * The connected tracker's board, as returned by /bug-board-mirror — the columns
 * to render and which one each bug belongs in according to the tracker itself.
 */
interface MirroredColumn {
  statusId: string
  name: string
  appStatus: string | null
  isClosed: boolean
  fromBoard: boolean
}

interface BoardMirror {
  available: boolean
  provider: string | null
  trackerName: string | null
  boardId: string | null
  boardName: string | null
  boardUrl: string | null
  columns: MirroredColumn[]
  /** bug id -> tracker status id */
  placement: Record<string, string>
  links: Record<string, { externalId: string; url: string | null; statusName: string | null }>
  unsyncedBugIds: string[]
  error: string | null
}

type TabType = "overview" | "evidence" | "steps" | "test" | "activity" | "openproject"
type ViewMode = "list" | "board"

/**
 * Normalize a stored asset reference into a URL the browser can load.
 * - Uploaded bug evidence is stored under /uploads/... (served statically).
 * - Live QA session screenshots/recordings are stored as storage-relative paths
 *   (e.g. "screenshots/liveqa-….png") that are only reachable through the
 *   authenticated /api/files proxy — a raw <img src> to those 404s.
 */
function assetUrl(p?: string | null): string | null {
  if (!p) return null
  if (/^(https?:|data:|blob:)/i.test(p)) return p
  if (p.startsWith("/uploads/") || p.startsWith("/api/files/")) return p
  return `/api/files/${encodeURIComponent(p.replace(/^\/+/, ""))}`
}

/** Colored chip styles for the detail drawer triage fields. */
const SEVERITY_STYLES: Record<string, string> = {
  Critical: "bg-red-50 text-red-700 border-red-200",
  High: "bg-orange-50 text-orange-700 border-orange-200",
  Medium: "bg-blue-50 text-blue-700 border-blue-200",
  Low: "bg-muted/50 text-muted-foreground border-border",
}

const BUG_STATUS_STYLES: Record<string, { chip: string; dot: string; label: string }> = {
  Open: { chip: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500", label: "Open" },
  InProgress: { chip: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "In Progress" },
  ReadyForRetest: { chip: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", label: "Ready for Retest" },
  Reopened: { chip: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500", label: "Reopened" },
  Resolved: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Resolved" },
  Closed: { chip: "bg-muted text-muted-foreground border-border", dot: "bg-slate-400", label: "Closed" },
  Rejected: { chip: "bg-muted text-muted-foreground border-border", dot: "bg-slate-400", label: "Rejected" },
  Duplicate: { chip: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500", label: "Duplicate" },
}

/**
 * The strip above the board that says which board is being shown and where its
 * columns came from.
 *
 * Worth the space because the columns are no longer this app's: when the board
 * reads "Specified" and "To be scheduled", a person needs to know those are the
 * tracker's words, that a drag will move the card over there too, and how to get
 * back to the app's own six if they'd rather.
 */
function BoardMirrorBar({
  mirror,
  mirrorActive,
  mirrorLoading,
  trackerName,
  useMirror,
  onToggleMirror,
  onPull,
  pulling,
  unsyncedCount,
  autoPull,
  onToggleAutoPull,
  autoPulling,
  lastPulledAt,
}: {
  mirror: BoardMirror | null
  mirrorActive: boolean
  mirrorLoading: boolean
  trackerName: string | null
  useMirror: boolean
  onToggleMirror: (_v: boolean) => void
  onPull: () => void
  pulling: boolean
  unsyncedCount: number
  autoPull: boolean
  onToggleAutoPull: (_v: boolean) => void
  autoPulling: boolean
  lastPulledAt: number | null
}) {
  // Nothing connected: the app's own columns are the only columns, and saying
  // so on every board render would be noise.
  if (!mirror?.provider && !mirrorLoading) return null

  const label = mirror?.boardName
    ? `${mirror.boardName} · ${trackerName || mirror.provider}`
    : `${trackerName || mirror?.provider} workflow`

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/65 px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-semibold text-foreground min-w-0">
        <Kanban className="h-3.5 w-3.5 text-primary shrink-0" />
        {mirrorLoading ? (
          <span className="text-muted-foreground">Reading the tracker board…</span>
        ) : mirrorActive ? (
          <span className="truncate" dir="auto">{label}</span>
        ) : (
          <span className="text-muted-foreground">App statuses</span>
        )}
      </span>

      {mirrorActive && (
        <span className="text-xs font-semibold text-muted-foreground">
          {mirror!.columns.some((c) => c.fromBoard)
            ? "columns mirrored from the tracker board"
            : "columns mirrored from the tracker workflow"}
        </span>
      )}

      {mirror?.error && (
        <span className="flex items-center gap-1 text-xs font-semibold text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          {mirror.error}
        </span>
      )}

      {mirrorActive && unsyncedCount > 0 && (
        <span className="text-xs font-semibold text-amber-700">
          {unsyncedCount} not synced
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {mirror?.boardUrl && (
          <a
            href={mirror.boardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-xs font-semibold hover:bg-accent transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Open in {trackerName || mirror.provider}
          </a>
        )}

        {/* When the last read landed. Without it, "auto" is a claim the user
            has to take on faith while looking at a board that may be stale. */}
        {lastPulledAt && !pulling && (
          <span className="text-xs font-semibold text-muted-foreground" title={new Date(lastPulledAt).toLocaleTimeString()}>
            {autoPulling ? "Checking…" : `Updated ${sinceLabel(lastPulledAt)}`}
          </span>
        )}

        <button
          onClick={onPull}
          disabled={pulling}
          title={`Pull status changes made in ${trackerName || "the tracker"} right now`}
          className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-xs font-semibold hover:bg-accent transition-colors disabled:opacity-50"
        >
          <Download className={`h-3 w-3 ${pulling ? "animate-pulse" : ""}`} />
          {pulling ? "Pulling…" : "Pull changes"}
        </button>

        <button
          onClick={() => onToggleAutoPull(!autoPull)}
          title={
            autoPull
              ? "Stop checking the tracker automatically"
              : `Check ${trackerName || "the tracker"} every minute while this page is open`
          }
          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${
            autoPull
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-background hover:bg-accent"
          }`}
        >
          {autoPulling ? <BusyDot /> : <RefreshCw className="h-3 w-3" />}
          Auto {autoPull ? "on" : "off"}
        </button>

        {mirror?.available && (
          <button
            onClick={() => onToggleMirror(!useMirror)}
            title={
              useMirror
                ? "Show this app's own bug statuses as columns instead"
                : `Mirror the ${trackerName || "tracker"} board's columns`
            }
            className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-xs font-semibold hover:bg-accent transition-colors"
          >
            <GitCompare className="h-3 w-3 text-primary" />
            {useMirror ? "App statuses" : `${trackerName || "Tracker"} columns`}
          </button>
        )}
      </div>
    </div>
  )
}

/** Section heading used across the drawer Overview tab. */
function DrawerSection({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h4>
      {children}
    </section>
  )
}

/**
 * The next step in the bug workflow, surfaced as the header's primary button so
 * the common move is one click instead of a trip through the status menu.
 * Terminal states (Closed / Rejected / Duplicate) have no next step.
 */
const NEXT_BUG_STATUS: Record<string, { next: string; label: string }> = {
  Open: { next: "InProgress", label: "Start progress" },
  Reopened: { next: "InProgress", label: "Start progress" },
  InProgress: { next: "ReadyForRetest", label: "Ready for retest" },
  ReadyForRetest: { next: "Resolved", label: "Mark resolved" },
  Resolved: { next: "Closed", label: "Close bug" },
}

const BUG_STATUS_ORDER = [
  "Open", "InProgress", "ReadyForRetest", "Reopened", "Resolved", "Closed", "Rejected", "Duplicate",
] as const

/** Compact select used throughout the metadata sidebar. */
const SIDE_SELECT =
  "h-8 w-full cursor-pointer rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-foreground outline-none transition-colors hover:border-border hover:bg-background focus:border-border focus:bg-background focus:ring-2 focus:ring-primary/30"

/** One card in the right-hand metadata column. */
function SideCard({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b pb-4 last:border-0">
      <h4 className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h4>
      <div>{children}</div>
    </section>
  )
}

/** A label/value line inside a SideCard. */
function SideRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Header status control: a coloured pill that opens the full status list. */
function BugStatusPill({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const st = BUG_STATUS_STYLES[status] || BUG_STATUS_STYLES.Open
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1 text-xs font-semibold shadow-2xs transition-all hover:scale-105 ${st.chip}`}
        >
          <span className={`h-2 w-2 rounded-full ${st.dot}`} />
          {st.label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {BUG_STATUS_ORDER.map((s) => {
          const meta = BUG_STATUS_STYLES[s]
          return (
            <DropdownMenuItem key={s} onClick={() => { if (s !== status) onChange(s) }}>
              <span className={`mr-2 h-2 w-2 rounded-full ${meta.dot}`} />
              {meta.label}
              {s === status && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function ProjectBugReportsPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  // Connected tracker name (Jira / Azure DevOps / ClickUp / OpenProject) for labels.
  const { name: trackerName, provider: trackerProvider, connected: trackerConnected } = useProjectIntegration(projectId)

  // Project details
  const [project, setProject] = useState<any>(null)

  // Bugs list states
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  // Search and Advanced Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [filterSeverity, setFilterSeverity] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterSource, setFilterSource] = useState("all")
  // Module/service filter. "unfiled" is its own answer, not "no filter".
  // Seeded from ?suite= so the module counts on the project page can link
  // straight to the defects they are counting.
  const [filterModule, setFilterModule] = useState(() => searchParams.get("suite") || "all")
  // Seeded from ?testCaseId= — the test library's "Open in Bug Reports" link.
  const [filterTestCaseId, setFilterTestCaseId] = useState<string | null>(() => searchParams.get("testCaseId"))
  // The project's suite tree, shared by the filter, the drawer and bulk actions.
  const { modules: projectModules, refresh: refreshModules } = useProjectModules(projectId)
  // Triage filters — the two questions a triage session actually opens with.
  const [filterUnassigned, setFilterUnassigned] = useState(false)
  const [filterReopened, setFilterReopened] = useState(false)

  // Detail Drawer States
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null)
  // Linked user stories (BugReportRequirement links) for the open bug
  const [linkedStoryIds, setLinkedStoryIds] = useState<string[]>([])
  const [activeDetailTab, setActiveDetailTab] = useState<TabType>("overview")
  const [detailLoading, setDetailLoading] = useState(false)

  // Form states for manual creation
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRebuildModal, setShowRebuildModal] = useState(false)
  const [showCreateBoardModal, setShowCreateBoardModal] = useState(false)
  const [showStatusMappingModal, setShowStatusMappingModal] = useState(false)
  // Downloadable QA/UAT testing report composed from this project's suites and bugs.
  const [showQaReportModal, setShowQaReportModal] = useState(false)
  const [showImportPdfModal, setShowImportPdfModal] = useState(false)

  // Inline editing state inside Drawer
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState("")
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editDescValue, setEditDescValue] = useState("")

  // Buffered text-field values inside Drawer (saved on blur / Enter, not per keystroke)
  const [editParentValue, setEditParentValue] = useState("")
  const [editAssigneeValue, setEditAssigneeValue] = useState("")
  // New-tag text buffer for the Tags editor in the detail drawer.
  const [tagInput, setTagInput] = useState("")
  // Buffered resolution note (saved on blur / Enter).
  const [editResolutionNoteValue, setEditResolutionNoteValue] = useState("")
  const [editExpectedValue, setEditExpectedValue] = useState("")
  const [editActualValue, setEditActualValue] = useState("")
  // Board/column selections buffered locally so the dropdowns respond instantly
  // (the save PUT persists in the background).
  const [editBoardValue, setEditBoardValue] = useState("")
  const [editColumnValue, setEditColumnValue] = useState("")

  // Photo upload state
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Multi-select + bulk actions (assignee / board+column / parent / delete)
  const [selectedBugIds, setSelectedBugIds] = useState<string[]>([])
  const [bulkParentValue, setBulkParentValue] = useState("")
  const [bulkAssigneeValue, setBulkAssigneeValue] = useState("")
  // Bulk module filing. "" is a real choice here (Unfiled), so the Apply button
  // is always enabled rather than gated on a non-empty value.
  const [bulkModuleValue, setBulkModuleValue] = useState("")
  const [bulkBoardValue, setBulkBoardValue] = useState("")
  const [bulkColumnValue, setBulkColumnValue] = useState("")
  const [bulkBoardColumns, setBulkBoardColumns] = useState<OpBoardColumn[]>([])
  const [loadingBulkColumns, setLoadingBulkColumns] = useState(false)
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Delete confirmation (offers app-only vs. app + OpenProject)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; synced: boolean } | null>(null)

  // Board view drag-and-drop
  const [draggedBugId, setDraggedBugId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

  // ── Mirrored tracker board ────────────────────────────────────────────────
  // The board the team actually works on lives in the tracker, and its workflow
  // is wider than this app's eight bug statuses. Rather than show six local
  // columns that no one recognises, the board renders the tracker's own columns
  // when there is an integration, and falls back to the local ones when there
  // isn't (or the tracker can't be reached).
  const [mirror, setMirror] = useState<BoardMirror | null>(null)
  const [mirrorLoading, setMirrorLoading] = useState(false)
  /**
   * Whether the tracker has answered yet at all.
   *
   * Distinct from `mirror === null`, which also means "answered: no board".
   * Until the first answer arrives the board must not fall back to the app's own
   * six columns — that fallback is what made the old board flash up and get
   * replaced a moment later.
   */
  const [mirrorResolved, setMirrorResolved] = useState(false)
  const [pullingInbound, setPullingInbound] = useState(false)
  /** Background refresh: on by default, paused while the tab is hidden. */
  const [autoPull, setAutoPull] = useState(true)
  const [autoPulling, setAutoPulling] = useState(false)
  const [lastPulledAt, setLastPulledAt] = useState<number | null>(null)
  /** Escape hatch: show the app's own statuses even when a mirror is available. */
  const [useMirror, setUseMirror] = useState(true)

  // OpenProject integration details
  const [opSyncStatus, setOpSyncStatus] = useState<{ status: string; externalUrl: string | null; externalId: string | null } | null>(null)
  const [syncingOP, setSyncingOP] = useState(false)

  // Duplication management
  const [duplicateTargetId, setDuplicateTargetId] = useState("")

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Set when the server rejects a status change for want of a resolution, so we
  // can ask why the bug is being closed instead of just failing.
  const [resolutionPrompt, setResolutionPrompt] = useState<{ bugId: string; targetStatus: string } | null>(null)

  // OpenProject project members (assignable users)
  const [opMembers, setOpMembers] = useState<Array<{ id: string; name: string }>>([])
  // OpenProject boards the bug can be placed on
  const [opBoards, setOpBoards] = useState<Array<{ id: number; name: string; type?: string }>>([])
  // Columns of the currently selected board (loaded on demand)
  const [opBoardColumns, setOpBoardColumns] = useState<OpBoardColumn[]>([])
  const [loadingColumns, setLoadingColumns] = useState(false)
  // Required custom fields on the OpenProject bug type (e.g. Found in Build, Bug Componant)
  const [opBugFields, setOpBugFields] = useState<OpBugField[]>([])
  // "Bug Source" dropdown options, pulled from an OpenProject list field
  const [opSourceOptions, setOpSourceOptions] = useState<string[]>([])
  // Buffered per-bug custom-field values: { fieldKey: { kind, value } }
  const [editCustomFields, setEditCustomFields] = useState<Record<string, { kind: string; value: any }>>({})
  // Project-level fallbacks for the required bug fields, applied by every sync
  // to bugs that carry no value of their own.
  const [bugFieldDefaults, setBugFieldDefaults] = useState<Record<string, { kind: string; value: any }>>({})
  const [savingDefaults, setSavingDefaults] = useState(false)

  // Load project basic scope details
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(res => res.json())
      .then(data => setProject(data.project))
      .catch(err => console.error("Error loading project scope details:", err))
  }, [projectId])

  // Load the project's assignee pool (synced from Jira/Azure/OpenProject + manual).
  // Replaces the old OpenProject-only members endpoint so assignment works for
  // every tracker. Falls back to an empty list if the pool is empty.
  useEffect(() => {
    fetch(`/api/projects/${projectId}/team`)
      .then(res => (res.ok ? res.json() : { members: [] }))
      .then(data =>
        setOpMembers(
          Array.isArray(data.members)
            ? data.members
                .filter((m: any) => m.active)
                // Value is the tracker's own user id: BugReport.assignedTo is
                // sent straight to the tracker as the assignee, so storing the
                // pool's row id here left the synced work package unassigned.
                .map((m: any) => ({ id: m.externalId || m.id, name: m.name }))
            : []
        )
      )
      .catch(() => setOpMembers([]))
  }, [projectId])

  // Load OpenProject boards for bug placement (no-op if integration isn't configured)
  useEffect(() => {
    // Only for projects that use OpenProject; others got two errors per visit.
    if (trackerProvider !== "OpenProject") return
    fetch(`/api/projects/${projectId}/integrations/openproject/metadata`)
      .then(res => (res.ok ? res.json() : { boards: [] }))
      .then(data => setOpBoards(Array.isArray(data.boards) ? data.boards : []))
      .catch(() => setOpBoards([]))
  }, [projectId, trackerProvider])

  // Load the required custom fields of the OpenProject bug type (no-op if unconfigured)
  useEffect(() => {
    // Only for projects that use OpenProject; others got two errors per visit.
    if (trackerProvider !== "OpenProject") return
    fetch(`/api/projects/${projectId}/integrations/openproject/bug-fields`)
      .then(res => (res.ok ? res.json() : { fields: [] }))
      .then(data => {
        setOpBugFields(Array.isArray(data.fields) ? data.fields : [])
        setBugFieldDefaults(data.defaults && typeof data.defaults === "object" ? data.defaults : {})
      })
      .catch(() => setOpBugFields([]))
  }, [projectId, trackerProvider])

  // Load "Bug Source" options from OpenProject (no-op if unconfigured / no field)
  useEffect(() => {
    // Only for projects that use OpenProject; others got two errors per visit.
    if (trackerProvider !== "OpenProject") return
    fetch(`/api/projects/${projectId}/integrations/openproject/source-options`)
      .then(res => (res.ok ? res.json() : { options: [] }))
      .then(data => setOpSourceOptions(Array.isArray(data.options) ? data.options : []))
      .catch(() => setOpSourceOptions([]))
  }, [projectId, trackerProvider])

  // Declared above loadBugsList, which reads it. Safe either way here since
  // loadBugsList is only invoked from an effect, but keeping declarations ahead
  // of their use avoids the temporal-dead-zone trap.
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)

  // Load bugs list with queries
  const loadBugsList = async () => {
    setLoading(true)
    try {
      const qParams: string[] = []
      if (filterSeverity !== "all") qParams.push(`severity=${filterSeverity}`)
      if (filterPriority !== "all") qParams.push(`priority=${filterPriority}`)
      if (filterStatus !== "all") qParams.push(`status=${filterStatus}`)
      if (filterSource !== "all") qParams.push(`source=${filterSource}`)
      if (filterModule !== "all") qParams.push(`suite=${encodeURIComponent(filterModule)}`)
      if (filterTestCaseId) qParams.push(`testCaseId=${encodeURIComponent(filterTestCaseId)}`)
      if (debouncedSearch) qParams.push(`search=${encodeURIComponent(debouncedSearch)}`)
      if (filterUnassigned) qParams.push("assignee=unassigned")
      if (filterReopened) qParams.push("reopened=true")

      const queryStr = qParams.length > 0 ? `?${qParams.join("&")}` : ""
      const res = await fetch(`/api/projects/${projectId}/bug-reports${queryStr}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setBugs(data.bugReports || [])
    } catch (err) {
      console.error(err)
      // Without this the list just looked empty, as if there were no bugs.
      notify.error("The bug list could not be loaded.", { id: "bugs-load", action: { label: "Try again", onClick: () => loadBugsList() } })
    } finally {
      setLoading(false)
    }
  }

  // `searchQuery` used to sit directly in this dependency array with no
  // debounce, so typing "checkout" fired eight full list requests — each one
  // returning every bug in the project — and slower responses could land after
  // faster ones and settle the list on the wrong result. Dropdown filters still
  // apply immediately; only the typed query waits.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    loadBugsList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, filterSeverity, filterPriority, filterStatus, filterSource, filterModule, filterTestCaseId, debouncedSearch, filterUnassigned, filterReopened])

  // The open bug lives in the URL (?bugId=…): links can be shared, refresh
  // keeps it open, and Back closes it. URL → state:
  const urlBugRef = useRef<string | null>(null)
  useEffect(() => {
    // ?bug= is what older "Copy link" wrote; still accept it.
    const p = searchParams.get("bugId") || searchParams.get("bug")
    if (p && p !== selectedBugId) handleOpenDetail(p)
    else if (!p && selectedBugId && urlBugRef.current) setSelectedBugId(null)
    urlBugRef.current = p
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // State → URL: opening pushes a history entry, switching/closing replaces it.
  // Only after something was open: on first load the URL may name a bug that
  // is still being fetched, and clearing it here would close it again.
  const prevSelectedRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevSelectedRef.current
    prevSelectedRef.current = selectedBugId
    if (!selectedBugId && !prev) return
    const cur = searchParams.get("bugId")
    if ((selectedBugId ?? null) === (cur ?? null) && !searchParams.get("bug")) return
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete("bug")
    if (selectedBugId) sp.set("bugId", selectedBugId)
    else sp.delete("bugId")
    const qs = sp.toString()
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`
    if (selectedBugId && !cur) router.push(url, { scroll: false })
    else router.replace(url, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBugId])

  const bugLink = (id: string) => `${window.location.origin}/projects/${projectId}/bug-reports/${id}`

  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [triageSignal, setTriageSignal] = useState(0)

  const currentFilters: BugFilters = {
    search: searchQuery,
    severity: filterSeverity,
    priority: filterPriority,
    status: filterStatus,
    source: filterSource,
    module: filterModule,
    unassigned: filterUnassigned,
    reopened: filterReopened,
  }
  const applyFilters = (f: BugFilters) => {
    setSearchQuery(f.search)
    setFilterSeverity(f.severity)
    setFilterPriority(f.priority)
    setFilterStatus(f.status)
    setFilterSource(f.source)
    setFilterModule(f.module)
    setFilterUnassigned(f.unassigned)
    setFilterReopened(f.reopened)
  }

  const showToastMsg = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Load the columns of a given board so the user can pick a placement column
  const loadBoardColumns = async (boardId: string) => {
    if (!boardId) {
      setOpBoardColumns([])
      return
    }
    setLoadingColumns(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/board-columns?boardId=${boardId}`)
      const data = await res.json()
      setOpBoardColumns(Array.isArray(data.columns) ? data.columns : [])
    } catch {
      setOpBoardColumns([])
    } finally {
      setLoadingColumns(false)
    }
  }

  // Load individual bug details inside drawer
  const handleOpenDetail = async (bugId: string) => {
    setSelectedBugId(bugId)
    setDetailLoading(true)
    setActiveDetailTab("overview")
    setIsEditingTitle(false)
    setIsEditingDesc(false)
    setOpSyncStatus(null)

    try {
      const res = await fetch(`/api/bug-reports/${bugId}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedBug(data.bug)
        setLinkedStoryIds(((data.bug?.requirements || []) as any[]).map((l: any) => l.requirementId || l.requirement?.id).filter(Boolean))
        setEditTitleValue(data.bug.title)
        setEditDescValue(data.bug.stepsToReproduce) // Description maps to steps/details
        setEditParentValue(data.bug.openProjectParentId || "")
        setEditAssigneeValue(data.bug.assignedTo || "")
        setEditResolutionNoteValue(data.bug.resolutionNote || "")
        setTagInput("")
        setEditExpectedValue(data.bug.expectedResult || "")
        setEditActualValue(data.bug.actualResult || "")
        setEditBoardValue(data.bug.openProjectBoardId || "")
        setEditColumnValue(data.bug.openProjectBoardColumnId || "")
        setEditCustomFields(
          data.bug.openProjectCustomFields && typeof data.bug.openProjectCustomFields === "object"
            ? data.bug.openProjectCustomFields
            : {}
        )
        // Preload this board's columns so the column selector is populated.
        if (data.bug.openProjectBoardId) {
          loadBoardColumns(data.bug.openProjectBoardId)
        } else {
          setOpBoardColumns([])
        }
        
        // Fetch OP sync mappings status
        fetch(`/api/projects/${projectId}/integrations/openproject`)
          .then(opRes => {
            if (opRes.ok) {
              return opRes.json()
            }
          })
          .then(opData => {
            // The integration GET returns `{ integration: {...} | null }` — there is
            // no top-level `enabled` flag. Treat a configured integration with a
            // stored token as connected so the OpenProject tab exposes the Sync button.
            if (opData && opData.integration && opData.integration.hasToken) {
              setOpSyncStatus({
                status: data.bug.openProjectSyncStatus || "Not Synced",
                externalId: data.bug.openProjectWorkPackageId || null,
                externalUrl: data.bug.openProjectWorkPackageUrl || null
              })
            }
          })
          .catch(() => {})
      } else {
        // Say why instead of silently showing nothing.
        const data = await res.json().catch(() => ({}))
        showToastMsg(data.error || `Couldn't open this bug (error ${res.status}).`, "error")
        setSelectedBugId(null)
      }
    } catch (err) {
      console.error(err)
      showToastMsg("Network error opening the bug. Check your connection and try again.", "error")
      setSelectedBugId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  // Inline patch update details inside Drawer
  const handleInlineUpdate = async (fields: Partial<BugReport>) => {
    if (!selectedBugId) return

    try {
      const res = await fetch(`/api/bug-reports/${selectedBugId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields)
      })

      if (res.ok) {
        const data = await res.json()
        // The PUT response is a bare bug row (no comments/activities/testCase includes),
        // so merge the changed fields into the loaded bug instead of replacing it.
        setSelectedBug(prev => (prev ? { ...prev, ...data.bug } : data.bug))
        showToastMsg("Bug details updated successfully!")
        loadBugsList()
      } else {
        const data = await res.json().catch(() => ({}))
        showToastMsg(data.error || "Failed to save changes", "error")
      }
    } catch (err) {
      showToastMsg("Network error saving changes", "error")
    }
  }

  // Change a bug's status by id (used by board drag-and-drop). Optimistic update
  // with revert-on-failure.
  const handleChangeBugStatus = async (bugId: string, newStatus: string, resolution?: string) => {
    const target = bugs.find(b => b.id === bugId)
    if (!target || target.status === newStatus) return

    setBugs(prev => prev.map(b => (b.id === bugId ? { ...b, status: newStatus as any } : b)))
    if (selectedBugId === bugId) {
      setSelectedBug(prev => (prev ? { ...prev, status: newStatus as any } : prev))
    }

    try {
      const res = await fetch(`/api/bug-reports/${bugId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, ...(resolution ? { resolution } : {}) })
      })
      if (res.ok) {
        showToastMsg(`Moved to ${newStatus}`)
        // The bug's tracker card may have moved with it (auto-sync), so re-read
        // where the tracker has it rather than leaving a stale column on screen.
        if (viewMode === "board") loadBoardMirror({ silent: true })
        return
      }

      const err = await res.json().catch(() => ({}))

      // The server now enforces the workflow. Closing a bug needs a reason, so
      // ask for one and retry rather than reporting a dead-end failure.
      if (err.code === "RESOLUTION_REQUIRED") {
        loadBugsList() // undo the optimistic move until a reason is chosen
        setResolutionPrompt({ bugId, targetStatus: newStatus })
        return
      }

      // Illegal move (e.g. Closed straight back to InProgress) — the server
      // message names what IS allowed, so show it rather than a generic error.
      showToastMsg(err.error || "Failed to update status", "error")
      loadBugsList() // revert to server truth
    } catch {
      showToastMsg("Network error updating status", "error")
      loadBugsList()
    }
  }

  // ── Mirrored board ──────────────────────────────────────────────────────────

  /**
   * Read the tracker's board layout and where it currently has each bug.
   * Failures are deliberately quiet: the board falls back to local columns, and
   * a red banner over a working board helps nobody.
   */
  /**
   * The list loader, reachable from a memoised callback.
   *
   * `loadBugsList` is redeclared every render and closes over the current
   * filters. `runPull` is memoised so the background interval isn't torn down
   * and rebuilt on every render — which means it would otherwise hold the
   * FIRST render's loader and refetch with whatever filters were set when the
   * page opened.
   */
  const loadBugsListRef = useRef(loadBugsList)
  useEffect(() => {
    loadBugsListRef.current = loadBugsList
  })

  const loadBoardMirror = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setMirrorLoading(true)
      try {
        const res = await fetch(`/api/projects/${projectId}/bug-board-mirror`)
        if (res.ok) setMirror(await res.json())
        else setMirror(null)
      } catch {
        setMirror(null)
      } finally {
        setMirrorLoading(false)
        setMirrorResolved(true)
      }
    },
    [projectId]
  )

  /**
   * Fetched on mount rather than when the board is opened.
   *
   * It used to wait for the switch to board view, so the first paint of the
   * board always had `mirror === null` and rendered the app's own columns until
   * the request came back. Asking on mount means the answer is usually already
   * in hand by the time the board opens; `mirrorResolved` covers the rest.
   */
  useEffect(() => {
    loadBoardMirror()
  }, [loadBoardMirror])

  /**
   * Read the tracker and reconcile whatever has changed there.
   *
   * One implementation for both the button and the background refresh; only the
   * reporting differs. `silent` keeps the background pass from firing a toast
   * every minute — it still refreshes the data and the "updated" stamp.
   *
   * The pull is forced, meaning it ignores the project's `inboundSyncEnabled`
   * flag. That flag exists for the unattended worker; a person on this page has
   * asked for the tracker to be read.
   */
  const runPull = useCallback(
    async ({ silent }: { silent: boolean }) => {
      if (silent) setAutoPulling(true)
      else setPullingInbound(true)
      try {
        const res = await fetch(`/api/projects/${projectId}/integrations/poll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true })
        })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (!silent) showToastMsg(data.error || "Could not pull changes", "error")
          return
        }

        setLastPulledAt(Date.now())
        if (data.applied > 0) {
          await Promise.all([loadBugsListRef.current(), loadBoardMirror({ silent: true })])
        }

        if (silent) return

        // Say what actually happened. "Already up to date" used to be printed
        // even when the pull never reached the tracker, which is how a button
        // that did nothing looked like a button that worked.
        const tracker = trackerName || "the tracker"
        if (data.applied > 0) {
          showToastMsg(`Pulled ${data.applied} change${data.applied === 1 ? "" : "s"} from ${tracker}.`)
        } else if (data.skipped === "no-integration") {
          showToastMsg("This project has no tracker connected.", "error")
        } else if (data.skipped === "no-mappings") {
          showToastMsg(`No bugs are synced with ${tracker} yet — sync one first.`, "error")
        } else if (data.failed > 0 && data.checked === 0) {
          showToastMsg(`${tracker} could not be read: ${data.error || "request failed"}`, "error")
        } else if (data.failed > 0) {
          showToastMsg(`Up to date, but ${data.failed} item(s) could not be read from ${tracker}.`, "error")
        } else {
          showToastMsg(`Already up to date with ${tracker} (${data.checked} checked).`)
        }
      } catch {
        if (!silent) showToastMsg("Network error pulling changes", "error")
      } finally {
        if (silent) setAutoPulling(false)
        else setPullingInbound(false)
      }
    },
    [projectId, trackerName, loadBoardMirror]
  )

  const handlePullInbound = () => runPull({ silent: false })

  // A project with no tracker has nothing to pull; polling it every minute
  // would be a request whose only possible answer is "no integration".
  const hasTracker = !!mirror?.provider

  /**
   * Background refresh — read the tracker every minute while this page is open.
   *
   * Paused whenever the tab is hidden: a board nobody is looking at does not
   * need polling, and a laptop that slept for an hour should not wake and fire
   * the backlog of missed ticks. Returning to the tab pulls immediately
   * instead, which is the moment a stale board is most obvious.
   */
  useEffect(() => {
    if (!autoPull || !hasTracker) return

    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(() => runPull({ silent: true }), AUTO_PULL_INTERVAL_MS)
    }
    const stop = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        runPull({ silent: true })
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [autoPull, hasTracker, runPull])

  /**
   * Drop onto a mirrored column: move the card in the tracker, and let the local
   * status follow when the saved mapping gives that column a local meaning.
   */
  const handleMoveToTrackerColumn = async (
    bugId: string,
    column: MirroredColumn,
    resolution?: string
  ) => {
    const current = mirror?.placement[bugId]
    if (current === column.statusId) return

    // Optimistic: place the card immediately, revert on failure.
    setMirror((prev) =>
      prev ? { ...prev, placement: { ...prev.placement, [bugId]: column.statusId } } : prev
    )

    try {
      const res = await fetch(`/api/bug-reports/${bugId}/board-column`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: column.statusId, ...(resolution ? { resolution } : {}) }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        if (data.localStatusChanged) {
          setBugs((prev) =>
            prev.map((b) => (b.id === bugId ? { ...b, status: data.appStatus } : b))
          )
          if (selectedBugId === bugId) {
            setSelectedBug((prev) => (prev ? { ...prev, status: data.appStatus } : prev))
          }
          showToastMsg(`Moved to ${column.name}`)
        } else if (data.localSkipReason === "unmapped") {
          // Honest about the half-move: the card is where they dropped it, but
          // no app status means that column, so reports won't reflect it.
          showToastMsg(
            `Moved to ${column.name} in ${trackerName || "the tracker"}. No app status is mapped to that column — set one under "Status mapping" if you want reports to follow.`
          )
        } else if (data.localSkipReason === "workflow") {
          showToastMsg(
            `Moved to ${column.name} in ${trackerName || "the tracker"}, but the app's bug workflow doesn't allow that step, so its status here is unchanged.`
          )
        } else {
          showToastMsg(`Moved to ${column.name}`)
        }
        return
      }

      // Needs a reason before it can be closed — ask, then retry the same drop.
      if (data.code === "RESOLUTION_REQUIRED" && column.appStatus) {
        loadBoardMirror({ silent: true })
        setResolutionPrompt({ bugId, targetStatus: column.appStatus })
        return
      }

      showToastMsg(data.error || "Could not move the card", "error")
      loadBoardMirror({ silent: true })
    } catch {
      showToastMsg("Network error moving the card", "error")
      loadBoardMirror({ silent: true })
    }
  }

  // Handle retest trigger
  const handleTriggerRetest = async (bugId: string) => {
    try {
      const res = await fetch(`/api/bug-reports/${bugId}/retest`, {
        method: "POST"
      })
      if (res.ok) {
        showToastMsg("Automated retest successfully queued!")
        handleOpenDetail(bugId)
        loadBugsList()
      } else {
        const data = await res.json()
        showToastMsg(data.error || "Retest failed to trigger", "error")
      }
    } catch (err) {
      showToastMsg("Network error triggering retest", "error")
    }
  }

  // Link as duplicate
  const handleMarkDuplicate = async () => {
    if (!selectedBugId || !duplicateTargetId) return

    try {
      const res = await fetch(`/api/bug-reports/${selectedBugId}/mark-duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateOfId: duplicateTargetId })
      })

      if (res.ok) {
        showToastMsg("Bug successfully marked as duplicate.")
        setDuplicateTargetId("")
        handleOpenDetail(selectedBugId)
        loadBugsList()
      } else {
        showToastMsg("Failed to mark duplicate", "error")
      }
    } catch (err) {
      showToastMsg("Network error linking duplicates", "error")
    }
  }

  // Sync to OpenProject. When `placement` is supplied (from the drawer), the
  // parent/board/column are persisted atomically before syncing so they can't be
  // lost to a save race.
  const handleSyncToOpenProject = async (
    bugId: string,
    placement?: { parentId?: string; boardId?: string; boardColumnId?: string; customFields?: Record<string, { kind: string; value: any }> }
  ) => {
    setSyncingOP(true)
    try {
      const res = await fetch(`/api/bug-reports/${bugId}/sync/openproject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(placement || {})
      })
      if (res.ok) {
        // Board placement is best-effort and never fails the sync, so a card
        // that didn't move comes back as a warning on an otherwise-OK response.
        const data = await res.json().catch(() => ({}))
        if (data.warning) showToastMsg(data.warning, "error")
        else showToastMsg(`Synchronised with ${trackerName} successfully!`)
        handleOpenDetail(bugId)
        loadBugsList()
      } else {
        const data = await res.json()
        showToastMsg(data.error || "Sync failed", "error")
      }
    } catch (err) {
      showToastMsg(`Network error syncing with ${trackerName}`, "error")
    } finally {
      setSyncingOP(false)
    }
  }

  // Export bugs list to json file
  const handleExportBugs = () => {
    const jsonStr = JSON.stringify(bugs, null, 2)
    const blob = new Blob([jsonStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `bug-reports-export-${projectId}-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Open the delete confirmation, offering to also remove the OpenProject ticket
  // when this bug is synced.
  const handleDeleteBug = (bugId: string) => {
    const bug = bugs.find(b => b.id === bugId) || (selectedBug?.id === bugId ? selectedBug : null)
    const synced = !!bug && bug.openProjectSyncStatus === "Synced"
    setDeleteTarget({ id: bugId, synced })
  }

  // Deletes wait 10 s with an Undo before they reach the server.
  const undoable = useUndoableDelete({
    hide: (ids) => {
      setBugs((prev) => prev.filter((b) => !ids.includes(b.id)))
      if (selectedBugId && ids.includes(selectedBugId)) setSelectedBugId(null)
      setSelectedBugIds((prev) => prev.filter((id) => !ids.includes(id)))
    },
    restore: () => {
      loadBugsList()
      showToastMsg("Delete undone.")
    },
    done: (deleted, failed) => {
      if (failed.length) showToastMsg(`${failed.length} bug(s) not deleted: ${failed[0].error}`, "error")
      else if (deleted) showToastMsg(`Deleted ${deleted} bug(s).`)
      loadBugsList()
    },
  })

  const scheduleDelete = (ids: string[], deleteRemote: boolean) => {
    const names = ids.map((id) => bugs.find((b) => b.id === id)?.bugKey || (selectedBug?.id === id ? selectedBug?.bugKey : null) || "bug")
    undoable.schedule(ids, deleteRemote, ids.length === 1 ? `Deleted ${names[0]}` : `Deleted ${ids.length} bugs`)
    setDeleteTarget(null)
    setBulkDeleteOpen(false)
  }

  // J/K walk the bugs in the order the list shows them.
  const stepBug = (dir: 1 | -1) => {
    if (!bugs.length) return
    const i = bugs.findIndex((b) => b.id === selectedBugId)
    const next = bugs[(i + dir + bugs.length) % bugs.length]
    if (next && next.id !== selectedBugId) handleOpenDetail(next.id)
  }
  useBugShortcuts({
    open: !!selectedBugId && !!selectedBug,
    next: () => stepBug(1),
    prev: () => stepBug(-1),
    edit: () => setIsEditingTitle(true),
    remove: () => selectedBugId && handleDeleteBug(selectedBugId),
    copyLink: () => {
      if (!selectedBugId) return
      navigator.clipboard.writeText(bugLink(selectedBugId))
      showToastMsg("Link copied")
    },
    triage: () => {
      setActiveDetailTab("overview")
      setTriageSignal((n) => n + 1)
    },
    search: () => searchInputRef.current?.focus(),
    close: () => setSelectedBugId(null),
    help: () => setShowShortcuts((v) => !v),
  })



  // Upload a photo/screenshot to the currently open bug
  const handleUploadPhoto = async (file: File) => {
    if (!selectedBugId || !file) return
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/bug-reports/${selectedBugId}/attachments`, {
        method: "POST",
        body: formData
      })
      if (res.ok) {
        showToastMsg("Photo uploaded successfully!")
        handleOpenDetail(selectedBugId)
        loadBugsList()
      } else {
        const data = await res.json().catch(() => ({}))
        showToastMsg(data.error || "Failed to upload photo", "error")
      }
    } catch (err) {
      showToastMsg("Network error uploading photo", "error")
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Multi-select helpers
  const toggleBugSelection = (bugId: string) => {
    setSelectedBugIds(prev =>
      prev.includes(bugId) ? prev.filter(id => id !== bugId) : [...prev, bugId]
    )
  }

  const toggleSelectAll = () => {
    setSelectedBugIds(prev => (prev.length === bugs.length ? [] : bugs.map(b => b.id)))
  }

  // Load the columns of a board for the BULK toolbar (kept separate from the
  // detail drawer's opBoardColumns so the two selectors don't clobber each other).
  const loadBulkBoardColumns = async (boardId: string) => {
    if (!boardId) {
      setBulkBoardColumns([])
      return
    }
    setLoadingBulkColumns(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/board-columns?boardId=${boardId}`)
      const data = await res.json()
      setBulkBoardColumns(Array.isArray(data.columns) ? data.columns : [])
    } catch {
      setBulkBoardColumns([])
    } finally {
      setLoadingBulkColumns(false)
    }
  }

  // Generic bulk PUT: apply the same fields to every selected bug. Selection is
  // kept so several bulk changes can be chained; the user clears when done.
  const handleBulkUpdate = async (fields: Record<string, any>, label: string) => {
    if (selectedBugIds.length === 0) return
    setBulkApplying(true)
    try {
      const results = await Promise.all(
        selectedBugIds.map(id =>
          fetch(`/api/bug-reports/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields)
          })
        )
      )
      const failed = results.filter(r => !r.ok).length
      if (failed === 0) showToastMsg(`${label} applied to ${selectedBugIds.length} bug(s).`)
      else showToastMsg(`${failed} of ${selectedBugIds.length} update(s) failed.`, "error")
      loadBugsList()
    } catch {
      showToastMsg(`Network error applying ${label.toLowerCase()}`, "error")
    } finally {
      setBulkApplying(false)
    }
  }

  // Save the values currently in the drawer as the project's defaults, so every
  // other bug — including ones synced automatically — satisfies the required
  // fields without anyone opening them.
  const handleSaveFieldDefaults = async () => {
    setSavingDefaults(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/bug-fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: editCustomFields }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToastMsg(data.error || "Could not save the defaults", "error")
        return
      }
      setBugFieldDefaults(data.defaults || {})
      showToastMsg("Saved as the project's default bug fields.")
    } catch {
      showToastMsg("Network error saving the defaults", "error")
    } finally {
      setSavingDefaults(false)
    }
  }

  const handleBulkAssignParent = () => handleBulkUpdate({ openProjectParentId: bulkParentValue }, "Parent")
  const handleBulkAssignee = () => handleBulkUpdate({ assignedTo: bulkAssigneeValue }, "Assignee")

  /**
   * File every selected bug under one module.
   *
   * Uses the dedicated bulk endpoint rather than N single PUTs: it validates
   * once that the module and the bugs belong to the same project, and refuses
   * outright on a mixed-project selection instead of applying to half of it.
   */
  const handleBulkModule = async () => {
    if (selectedBugIds.length === 0) return
    setBulkApplying(true)
    try {
      const res = await fetch(`/api/bug-reports/bulk-update-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bugIds: selectedBugIds, suiteId: bulkModuleValue || null })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToastMsg(`${data.count || selectedBugIds.length} bug(s) filed under ${data.suiteName || "Unfiled"}.`)
        loadBugsList()
      } else {
        showToastMsg(data.error || "Failed to set the module", "error")
      }
    } catch {
      showToastMsg("Network error setting the module", "error")
    } finally {
      setBulkApplying(false)
    }
  }

  // Bulk board/column: for bugs already synced to OpenProject, run the sync so
  // the card actually MOVES to the chosen column (placeBugOnBoard reconciles it);
  // for not-yet-synced bugs, just store the target for their first sync.
  const handleBulkBoardColumn = async () => {
    if (selectedBugIds.length === 0 || !bulkBoardValue) return
    setBulkApplying(true)
    try {
      const results = await Promise.all(
        selectedBugIds.map(id => {
          const bug = bugs.find(b => b.id === id)
          if (bug && bug.openProjectSyncStatus === "Synced") {
            return fetch(`/api/bug-reports/${id}/sync/openproject`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ boardId: bulkBoardValue, boardColumnId: bulkColumnValue || null })
            })
          }
          return fetch(`/api/bug-reports/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ openProjectBoardId: bulkBoardValue, openProjectBoardColumnId: bulkColumnValue || null })
          })
        })
      )
      const failed = results.filter(r => !r.ok).length
      if (failed === 0) showToastMsg(`Board/column applied to ${selectedBugIds.length} bug(s).`)
      else showToastMsg(`${failed} of ${selectedBugIds.length} update(s) failed.`, "error")
      loadBugsList()
    } catch {
      showToastMsg("Network error applying board/column", "error")
    } finally {
      setBulkApplying(false)
    }
  }



  // ── Board columns ───────────────────────────────────────────────────────────
  // One shape for both worlds so the card rendering below doesn't care which it
  // got: `mirrored` is set only for a tracker column, and is what tells the drop
  // handler to go out to the tracker instead of writing a local status.
  type BoardColumnView = {
    key: string
    label: string
    color: string
    mirrored: MirroredColumn | null
  }

  const mirrorActive = useMirror && !!mirror?.available && mirror.columns.length > 0

  /** The app's own six, used when there is no tracker to mirror. */
  const LOCAL_BOARD_COLUMNS: BoardColumnView[] = [
    { key: "Open", label: "Open", color: "border-amber-400", mirrored: null },
    { key: "InProgress", label: "In Progress", color: "border-blue-400", mirrored: null },
    { key: "ReadyForRetest", label: "Retesting", color: "border-purple-400", mirrored: null },
    { key: "Resolved", label: "Resolved", color: "border-emerald-400", mirrored: null },
    { key: "Duplicate", label: "Duplicate", color: "border-border", mirrored: null },
    { key: "Closed", label: "Closed", color: "border-slate-400", mirrored: null },
  ]

  /**
   * No columns at all until the tracker has answered.
   *
   * The board used to render the app's own six the moment it opened and swap
   * them for the tracker's a moment later — the "old view" flashing past. An
   * empty lane plus the skeleton below is the honest state: we do not yet know
   * whose board this is.
   */
  const boardColumns: BoardColumnView[] = !mirrorResolved
    ? []
    : mirrorActive
    ? mirror!.columns.map((c) => ({
        key: c.statusId,
        label: c.name,
        // Closed columns read as settled, the rest as in-flight. Deliberately not
        // a colour per status: the tracker's workflow can hold a dozen, and a
        // rainbow of invented colours says less than a consistent one.
        color: c.isClosed ? "border-slate-400" : "border-primary",
        mirrored: c,
      }))
    : LOCAL_BOARD_COLUMNS

  /**
   * Which bugs belong in a column. Mirrored columns place by the tracker's own
   * status (as recorded by inbound sync); local columns by the app's status.
   */
  const bugsInColumn = (col: BoardColumnView) =>
    col.mirrored
      ? bugs.filter((b) => mirror?.placement[b.id] === col.mirrored!.statusId)
      : bugs.filter((b) => b.status === col.key)

  /** Bugs the mirrored board can't place — never synced, or in a column-less status. */
  const unplacedBugs = mirrorActive ? bugs.filter((b) => !mirror!.placement[b.id]) : []

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none">
      
      <UndoBar pending={undoable.pending} onUndo={undoable.undo} onCommit={undoable.commitNow} />
      {showShortcuts && <ShortcutHelp onClose={() => setShowShortcuts(false)} />}

      {/* Toast Feedback */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-2 border font-semibold text-white transition-all transform animate-in slide-in-from-bottom duration-300 ${
          toast.type === "success" ? "bg-emerald-600 border-emerald-500" : "bg-rose-600 border-rose-500"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* Delete confirmation: choose app-only or app + OpenProject */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[440px] bg-background rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 space-y-4 animate-in zoom-in-95 duration-200 text-xs font-semibold">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-rose-600" /> Delete bug
              </h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                You can undo it for 10 seconds.
                {deleteTarget.synced
                  ? ` This bug is synced to ${trackerName} — choose whether to also delete the linked work package.`
                  : ` This bug is not synced to ${trackerName}.`}
              </p>
            </div>

            <div className="space-y-2">
              <Button
                onClick={() => scheduleDelete([deleteTarget.id], false)}
                className="h-9 w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                Delete from app only
              </Button>
              {deleteTarget.synced && (
                <Button
                  onClick={() => scheduleDelete([deleteTarget.id], true)}
                  className="h-9 w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold"
                >
                  Delete from app and {trackerName}
                </Button>
              )}
              <Button
                onClick={() => setDeleteTarget(null)}
                variant="ghost"
                className="h-9 w-full font-semibold text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {bulkDeleteOpen && (() => {
        const syncedCount = selectedBugIds.filter(id => bugs.find(b => b.id === id)?.openProjectSyncStatus === "Synced").length
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[440px] bg-background rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 space-y-4 animate-in zoom-in-95 duration-200 text-xs font-semibold">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-rose-600" /> Delete {selectedBugIds.length} Defect{selectedBugIds.length === 1 ? "" : "s"}
                </h3>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                  You can undo it for 10 seconds.
                  {syncedCount > 0
                    ? ` ${syncedCount} of these ${syncedCount === 1 ? "is" : "are"} synced to ${trackerName} — choose whether to also delete the linked work package${syncedCount === 1 ? "" : "s"}.`
                    : ` None of these are synced to ${trackerName}.`}
                </p>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => scheduleDelete([...selectedBugIds], false)}
                  disabled={bulkApplying}
                  className="h-9 w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                >
                  {bulkApplying ? "Deleting…" : "Delete from app only"}
                </Button>
                {syncedCount > 0 && (
                  <Button
                    onClick={() => scheduleDelete([...selectedBugIds], true)}
                    disabled={bulkApplying}
                    className="h-9 w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold"
                  >
                    {bulkApplying ? "Deleting…" : `Delete from app and ${trackerName}`}
                  </Button>
                )}
                <Button
                  onClick={() => setBulkDeleteOpen(false)}
                  disabled={bulkApplying}
                  variant="ghost"
                  className="h-9 w-full font-semibold text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      <AppPageHeader
        title="Bug Reports"
        subtitle="Track, triage, and resolve defects for this project."
        breadcrumb="QA Workflows > Bug Reports"
        primaryAction={{
          label: "Create Bug",
          onClick: () => setShowCreateModal(true),
          icon: Plus
        }}
        secondaryActions={[
          {
            label: "Sync Bugs",
            onClick: () => {
              showToastMsg(`${trackerName} bugs synchronization started...`)
              bugs.forEach(b => {
                if (b.status !== "Closed" && b.status !== "Duplicate") {
                  handleSyncToOpenProject(b.id)
                }
              })
            },
            icon: RefreshCw
          },
          {
            label: "Import from PDF",
            onClick: () => setShowImportPdfModal(true),
            icon: FileUp
          },
          {
            label: "QA Report",
            onClick: () => setShowQaReportModal(true),
            icon: FileBarChart
          },
          {
            label: "Export",
            onClick: handleExportBugs
          }
        ]}
      />

      <ActiveProjectContextBar projectId={projectId} />

      {/* 4. Summary Metrics Row Section */}
      <div className="stagger grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: "Total", count: bugs.length, color: "text-foreground", filter: "all", field: "status" },
          // Same three statuses the filter below asks the server for.
          { label: "Open", count: bugs.filter(b => ["Open", "Reopened", "InProgress"].includes(b.status)).length, color: "text-amber-600", filter: "Open,Reopened,InProgress", field: "status" },
          { label: "Critical", count: bugs.filter(b => b.severity === "Critical").length, color: "text-rose-600", filter: "Critical", field: "severity" },
          // Matches the server's "Auto" source filter: from a test run or a test step.
          { label: "From test runs", count: bugs.filter(b => b.testRunId !== null || !!(b as any).testStepResultId).length, color: "text-primary", filter: "Auto", field: "source" },
          { label: "Synced to tracker", count: bugs.filter(b => b.openProjectSyncStatus === "Synced").length, color: "text-sky-600", filter: "", field: "info" },
          { label: "Duplicates", count: bugs.filter(b => b.status === "Duplicate").length, color: "text-muted-foreground", filter: "Duplicate", field: "status" }
        ].map((c, idx) => (
          c.field === "info" ? (
            <div key={idx} className="space-y-1 rounded-xl border border-border bg-card p-4 text-center">
              <span className="caption-4 text-muted-foreground">{c.label}</span>
              <div className={`text-2xl font-semibold ${c.color}`}><CountUp value={c.count} /></div>
            </div>
          ) : (
            <button
              type="button"
              key={idx}
              onClick={() => {
                // Each card shows exactly the bugs it counts; other filters reset.
                setFilterStatus(c.field === "status" ? c.filter : "all")
                setFilterSeverity(c.field === "severity" ? c.filter : "all")
                setFilterSource(c.field === "source" ? c.filter : "all")
              }}
              className="hover-lift space-y-1 rounded-xl border border-border bg-card p-4 text-center shadow-sm hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              <span className="caption-4 text-muted-foreground">{c.label}</span>
              <div className={`text-2xl font-semibold ${c.color}`}><CountUp value={c.count} /></div>
            </button>
          )
        ))}
      </div>

      {/* 5. Filters and Search Console */}
      <div className="p-4 border border-border shadow-sm bg-card rounded-xl flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
          <Input 
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, testcase, logs…  ( / )" 
            className="pl-8 h-9 text-xs bg-background"
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <select 
            value={filterSeverity} 
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="h-9 px-3 rounded-lg border text-xs bg-background outline-none min-w-[110px]"
          >
            <option value="all">Severity: All</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>

          {/* Triage toggles. Both are applied server-side. */}
          <button
            onClick={() => setFilterUnassigned(v => !v)}
            aria-pressed={filterUnassigned}
            title="Bugs with nobody assigned"
            className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${
              filterUnassigned
                ? "border-primary/25 bg-primary/10 text-primary"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Unassigned
          </button>
          <button
            onClick={() => setFilterReopened(v => !v)}
            aria-pressed={filterReopened}
            title="Bugs that have been reopened at least once"
            className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${
              filterReopened
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Reopened
          </button>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="h-9 px-3 rounded-lg border text-xs bg-background outline-none min-w-[110px]"
          >
            <option value="all">Priority: All</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>

          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 px-3 rounded-lg border text-xs bg-background outline-none min-w-[110px]"
          >
            <option value="all">Status: All</option>
            <option value="Open,Reopened,InProgress">Any open</option>
            <option value="Open">Open</option>
            <option value="InProgress">In Progress</option>
            <option value="ReadyForRetest">Ready for Retest</option>
            <option value="Reopened">Reopened</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
            <option value="Rejected">Rejected</option>
            <option value="Duplicate">Duplicate</option>
          </select>

          <select 
            value={filterSource} 
            onChange={(e) => setFilterSource(e.target.value)}
            className="h-9 px-3 rounded-lg border text-xs bg-background outline-none min-w-[110px]"
          >
            <option value="all">Source: All</option>
            <option value="Manual">Manual</option>
            <option value="Auto">Auto run</option>
          </select>

          {filterTestCaseId && (
            <button
              type="button"
              onClick={() => {
                setFilterTestCaseId(null)
                const p = new URLSearchParams(searchParams.toString())
                p.delete("testCaseId")
                router.replace(`?${p.toString()}`, { scroll: false })
              }}
              title="Showing only bugs filed against one test case — click to clear"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary"
            >
              One test case only <span aria-hidden="true">×</span>
            </button>
          )}

          {/* Module/service filter — the suites the test library files cases
              under, so defects and their coverage line up under one heading. */}
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="h-9 px-3 rounded-lg border text-xs bg-background outline-none min-w-[150px] max-w-[220px]"
          >
            <option value="all">Module: All</option>
            <option value="unfiled">Unfiled</option>
            {projectModules.map(m => (
              <option key={m.id} value={m.id}>{m.path}</option>
            ))}
          </select>

          {trackerProvider === "OpenProject" && (
            <button
              onClick={() => setShowCreateBoardModal(true)}
              title={`Create a board in ${trackerName || "the tracker"} with one column per status`}
              className="h-9 px-3 rounded-lg border bg-background text-xs font-semibold hover:bg-accent transition-colors shrink-0 flex items-center gap-2"
            >
              <Kanban className="h-3.5 w-3.5 text-primary" />
              Create bug board
            </button>
          )}

          {trackerName && (
            <button
              onClick={() => setShowStatusMappingModal(true)}
              title={`Choose which ${trackerName} status each bug status means`}
              className="h-9 px-3 rounded-lg border bg-background text-xs font-semibold hover:bg-accent transition-colors shrink-0 flex items-center gap-2"
            >
              <GitCompare className="h-3.5 w-3.5 text-primary" />
              Status mapping
            </button>
          )}

          {/* Only offered when a tracker is really connected: it deletes work items there. */}
          {trackerConnected && (
            <button
              onClick={() => setShowRebuildModal(true)}
              title={`Delete every bug work item in ${trackerName} and push this project's bugs back as a clean set`}
              className="h-9 px-3 rounded-lg border border-border bg-background text-muted-foreground text-xs font-semibold hover:bg-red-50 hover:text-red-700 transition-colors shrink-0 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Rebuild {trackerName}
            </button>
          )}

          <div className="flex border rounded-lg overflow-hidden shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`h-9 px-3 text-xs font-semibold transition-all ${viewMode === "list" ? "bg-muted text-foreground" : "bg-background hover:bg-muted/50 text-muted-foreground"}`}
            >
              List view
            </button>
            <button 
              onClick={() => setViewMode("board")}
              className={`h-9 px-3 text-xs font-semibold transition-all ${viewMode === "board" ? "bg-muted text-foreground" : "bg-background hover:bg-muted/50 text-muted-foreground"}`}
            >
              Board view
            </button>
          </div>
          <div className="basis-full">
            <SavedViews
              projectId={projectId}
              current={currentFilters}
              apply={applyFilters}
            />
          </div>
        </div>
      </div>

      {/* Bulk action bar: assignee / board+column / parent / delete for many bugs at once */}
      {selectedBugIds.length > 0 && (
        <div className="p-3 border border-primary/25 bg-primary/10 rounded-xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold text-primary text-xs">
              <CheckSquare className="h-4 w-4" />
              {selectedBugIds.length} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkApplying}
                size="sm"
                variant="ghost"
                className="h-8 font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0 gap-2"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button
                onClick={() => setSelectedBugIds([])}
                variant="ghost"
                size="sm"
                className="h-8 font-semibold text-muted-foreground shrink-0"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {/* Assignee */}
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <span className="text-xs font-medium text-primary/80 flex items-center gap-1"><UserPlus className="h-3 w-3" /> Assignee</span>
                {opMembers.length > 0 ? (
                  <select
                    value={bulkAssigneeValue}
                    onChange={(e) => setBulkAssigneeValue(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-xs font-semibold min-w-[150px]"
                  >
                    <option value="">Unassigned</option>
                    {opMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : (
                  <Input
                    value={bulkAssigneeValue}
                    onChange={(e) => setBulkAssigneeValue(e.target.value)}
                    placeholder="Assignee email…"
                    className="h-8 bg-background w-[150px]"
                  />
                )}
              </div>
              <Button onClick={handleBulkAssignee} disabled={bulkApplying} size="sm" className="h-8 bg-primary hover:bg-primary/90 text-white font-semibold shrink-0">Apply</Button>
            </div>

            {/* Module / service */}
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <span className="text-xs font-medium text-primary/80 flex items-center gap-1"><Layers className="h-3 w-3" /> Module</span>
                <select
                  value={bulkModuleValue}
                  onChange={(e) => setBulkModuleValue(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-xs font-semibold min-w-[150px] max-w-[220px]"
                >
                  <option value="">— Unfiled —</option>
                  {projectModules.map(m => <option key={m.id} value={m.id}>{m.path}</option>)}
                </select>
              </div>
              <Button onClick={handleBulkModule} disabled={bulkApplying} size="sm" className="h-8 bg-primary hover:bg-primary/90 text-white font-semibold shrink-0">Apply</Button>
            </div>

            {/* Board + column */}
            {opBoards.length > 0 && (
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-primary/80 flex items-center gap-1"><Kanban className="h-3 w-3" /> Board</span>
                  <select
                    value={bulkBoardValue}
                    onChange={(e) => { setBulkBoardValue(e.target.value); setBulkColumnValue(""); loadBulkBoardColumns(e.target.value) }}
                    className="h-8 rounded-md border bg-background px-2 text-xs font-semibold min-w-[140px]"
                  >
                    <option value="">— Board —</option>
                    {opBoards.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-primary/80">Column</span>
                  <select
                    value={bulkColumnValue}
                    onChange={(e) => setBulkColumnValue(e.target.value)}
                    disabled={!bulkBoardValue || loadingBulkColumns}
                    className="h-8 rounded-md border bg-background px-2 text-xs font-semibold min-w-[140px] disabled:opacity-50"
                  >
                    <option value="">{loadingBulkColumns ? "Loading…" : "First column"}</option>
                    {bulkBoardColumns.map(c => <option key={c.widgetId} value={String(c.widgetId)}>{c.name}</option>)}
                  </select>
                </div>
                <Button onClick={handleBulkBoardColumn} disabled={bulkApplying || !bulkBoardValue} size="sm" className="h-8 bg-primary hover:bg-primary/90 text-white font-semibold shrink-0">Apply</Button>
              </div>
            )}

            {/* Parent */}
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <span className="text-xs font-medium text-primary/80 flex items-center gap-1"><Layers className="h-3 w-3" /> Parent WP</span>
                <Input
                  value={bulkParentValue}
                  onChange={(e) => setBulkParentValue(e.target.value)}
                  placeholder="e.g. 1234"
                  className="h-8 bg-background w-[120px]"
                />
              </div>
              <Button onClick={handleBulkAssignParent} disabled={bulkApplying} size="sm" className="h-8 bg-primary hover:bg-primary/90 text-white font-semibold shrink-0">Apply</Button>
            </div>
          </div>
          {opBoards.length > 0 && (
            <p className="text-xs text-primary/70 font-semibold">Board/column moves already-synced bugs on {trackerName} immediately; others store the target for their next sync.</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center p-12 text-muted-foreground animate-pulse font-semibold">
          Querying defect sheets...
        </div>
      ) : bugs.length === 0 ? (
        /* Empty State */
        <div className="p-16 border border-dashed rounded-xl text-center space-y-4 max-w-xl mx-auto">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <Bug className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-sm text-foreground">No bugs reported yet</h3>
            <p className="text-xs text-muted-foreground font-medium max-w-xs mx-auto leading-relaxed">
              Create bugs manually, capture screenshots from Live QA Sessions, or auto-create them from failed playwright test runs.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => setShowCreateModal(true)} size="sm" className="bg-primary hover:bg-primary/90 text-white font-semibold h-9">
              + Create Bug
            </Button>
            <Button onClick={() => router.push(`/projects/${projectId}/live-qa-session`)} variant="outline" size="sm" className="h-9 hover:bg-muted/50 border-border">
              Live QA Session
            </Button>
            <Button onClick={() => setShowImportPdfModal(true)} variant="outline" size="sm" className="h-9 hover:bg-muted/50 border-border">
              Import from PDF
            </Button>
          </div>
        </div>
      ) : (
        /* MAIN VIEWS CONTROLLER */
        <div>
          {viewMode === "list" ? (
            /* 6. List View: Table/Card hybrid */
            <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-slate-500/[0.02] text-xs text-muted-foreground/80">
                      <th className="p-3 w-8">
                        <input
                          type="checkbox"
                          checked={bugs.length > 0 && selectedBugIds.length === bugs.length}
                          onChange={toggleSelectAll}
                          className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                          title="Select all"
                        />
                      </th>
                      <th className="p-3 font-semibold">Bug ID / Title</th>
                      <th className="p-3 font-semibold">Severity</th>
                      <th className="p-3 font-semibold">Priority</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3 font-semibold">Scope / Links</th>
                      <th className="p-3 font-semibold">Created</th>
                      <th className="p-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="stagger divide-y text-foreground">
                    {bugs.map((b) => {
                      const isAuto = b.testRunId !== null
                      return (
                        <tr 
                          key={b.id} 
                          className={`hover:bg-muted/50 cursor-pointer transition-colors ${selectedBugIds.includes(b.id) ? "bg-primary/10" : ""}`}
                          onClick={() => handleOpenDetail(b.id)}
                        >
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedBugIds.includes(b.id)}
                              onChange={() => toggleBugSelection(b.id)}
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                            />
                          </td>
                          <td className="p-3 space-y-1 max-w-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-semibold">
                                {b.bugKey || "BUG"}
                              </span>
                              <span className="font-semibold text-foreground truncate block hover:text-primary transition-colors" title={b.title} dir="auto">
                                {b.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                              <span>Env: {b.environment || "Staging"}</span>
                              <span>&bull;</span>
                              <span>Browser: {b.browser || "Chromium"}</span>
                              {b.screenshotPath && (
                                <>
                                  <span>&bull;</span>
                                  <span className="text-primary font-semibold flex items-center gap-0.5">
                                    <Eye className="h-3 w-3" /> Screenshot
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-semibold   text-xs ${
                              b.severity === "Critical" ? "bg-red-100 text-red-700" :
                              b.severity === "High" ? "bg-orange-100 text-orange-700" :
                              b.severity === "Medium" ? "bg-blue-100 text-blue-700" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {b.severity}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-slate-600 font-semibold">{b.priority}</span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-semibold   text-xs ${
                              b.status === "Open" ? "bg-amber-100 text-amber-700" :
                              b.status === "InProgress" ? "bg-blue-100 text-blue-700" :
                              b.status === "Resolved" || b.status === "Closed" ? "bg-emerald-100 text-emerald-700" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {b.status}
                            </span>
                          </td>
                          <td className="p-3 space-y-0.5 max-w-[200px]">
                            {b.suite && (
                              <div
                                className="flex items-center gap-1 text-xs font-semibold text-sky-700 truncate"
                                title="Module / service"
                              >
                                <Layers className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                                <span className="truncate">{b.suite.name}</span>
                              </div>
                            )}
                            {b.testCase && (
                              <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground truncate">
                                <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="truncate">{b.testCase.title}</span>
                              </div>
                            )}
                            {b.testRun && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="truncate">RUN-{b.testRun.id.slice(0, 8)}</span>
                              </div>
                            )}
                            {!b.testCase && !b.testRun && (
                              <span className="text-xs text-muted-foreground ">No execution link</span>
                            )}
                            {/* Recurrence. BugOccurrence rows have been written
                                by on-test-run-completed.ts all along and were
                                never shown anywhere — this is the signal that
                                separates a one-off from a live regression. */}
                            {(b.occurrenceCount ?? 0) > 1 && (
                              <div
                                className="flex items-center gap-1 text-xs font-semibold text-amber-700"
                                title={`This defect has reproduced ${b.occurrenceCount} times across test runs`}
                              >
                                <RefreshCw className="h-3 w-3 shrink-0" />
                                <span>Recurred ×{b.occurrenceCount}</span>
                              </div>
                            )}
                            {/* A bug reopened more than once has failed
                                verification repeatedly — a different problem
                                from one that simply bounced back after a fix. */}
                            {(b.reopenCount ?? 0) > 0 && (
                              <div
                                className="flex items-center gap-1 text-xs font-semibold text-rose-700"
                                title={`Reopened ${b.reopenCount} time(s) after being settled`}
                              >
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                <span>Reopened ×{b.reopenCount}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-xs font-medium text-muted-foreground">
                            <div>{new Date(b.createdAt).toLocaleDateString()}</div>
                            {/* Age, so a defect quietly sitting for months is
                                visible without doing date arithmetic by eye.
                                Only emphasised while the bug is still live. */}
                            {b.ageDays !== undefined &&
                              !["Closed", "Rejected", "Duplicate"].includes(b.status) && (
                                <div
                                  className={
                                    b.ageDays >= 30
                                      ? "font-semibold text-rose-600"
                                      : b.ageDays >= 14
                                        ? "font-semibold text-amber-600"
                                        : "text-muted-foreground"
                                  }
                                  title={`Open for ${b.ageDays} day(s)`}
                                >
                                  {b.ageDays === 0 ? "today" : `${b.ageDays}d open`}
                                </div>
                              )}
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleOpenDetail(b.id)}
                                className="h-7 w-7 p-0"
                                title="View details"
                              >
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleSyncToOpenProject(b.id)}
                                className="h-7 w-7 p-0"
                                title={`Sync with ${trackerName}`}
                              >
                                <RefreshCw className="h-4 w-4 text-primary" />
                              </Button>
                              {b.testCaseId && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => handleTriggerRetest(b.id)}
                                  className="h-7 w-7 p-0 hover:text-primary"
                                  title="Re-run Retest"
                                >
                                  <Play className="h-4 w-4" />
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleDeleteBug(b.id)}
                                className="h-7 w-7 p-0 hover:text-rose-600"
                                title="Delete bug"
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-rose-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* 15. Board View (Kanban) — mirrors the tracker's board when connected */
            <div className="space-y-3">
              <BoardMirrorBar
                mirror={mirror}
                mirrorActive={mirrorActive}
                mirrorLoading={mirrorLoading}
                trackerName={trackerName}
                useMirror={useMirror}
                onToggleMirror={setUseMirror}
                onPull={handlePullInbound}
                pulling={pullingInbound}
                unsyncedCount={mirrorActive ? mirror!.unsyncedBugIds.length : 0}
                autoPull={autoPull}
                onToggleAutoPull={setAutoPull}
                autoPulling={autoPulling}
                lastPulledAt={lastPulledAt}
              />

              {/* Waiting on the tracker: placeholder columns rather than the
                  app's own, which would be replaced a moment later. */}
              {!mirrorResolved && (
                <div className="flex gap-4 items-start overflow-hidden pb-3 -mx-1 px-1" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-[260px] shrink-0 space-y-2 animate-pulse">
                      <div className="h-7 rounded-lg bg-muted" />
                      <div className="h-20 rounded-xl bg-muted/50 border border-border" />
                      <div className="h-20 rounded-xl bg-muted/50 border border-border" />
                    </div>
                  ))}
                </div>
              )}

              {/* One horizontal lane: every column keeps a readable fixed width
                  and the lane scrolls sideways, so a tracker board with many
                  statuses shows all of them instead of squeezing the last ones
                  down to an unreadable sliver. */}
              <div className="flex gap-4 items-start overflow-x-auto overscroll-x-contain pb-3 -mx-1 px-1 snap-x">
              {boardColumns.map((col) => {
                const colBugs = bugsInColumn(col)
                const isDropTarget = dragOverStatus === col.key && draggedBugId !== null
                return (
                  <div
                    key={col.key}
                    onDragOver={(e) => {
                      if (!draggedBugId) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = "move"
                      if (dragOverStatus !== col.key) setDragOverStatus(col.key)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggedBugId) {
                        // A mirrored column is a tracker status, so the drop goes
                        // out to the tracker first and the local status follows;
                        // a local column is just the app's own status change.
                        if (col.mirrored) handleMoveToTrackerColumn(draggedBugId, col.mirrored)
                        else handleChangeBugStatus(draggedBugId, col.key)
                      }
                      setDraggedBugId(null)
                      setDragOverStatus(null)
                    }}
                    className={`w-[272px] shrink-0 snap-start p-3 border rounded-2xl shadow-sm space-y-3 min-h-[300px] transition-all ${
                      isDropTarget ? "bg-primary/10 border-primary/25 ring-2 ring-primary/30" : "bg-card/65"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b pb-2 select-none gap-1">
                      <span
                        className="font-medium text-foreground text-xs flex items-center gap-2 min-w-0"
                        title={
                          col.mirrored
                            ? col.mirrored.appStatus
                              ? `${trackerName || "Tracker"} status "${col.mirrored.name}" — mapped to ${col.mirrored.appStatus} in this app`
                              : `${trackerName || "Tracker"} status "${col.mirrored.name}" — no app status is mapped to it`
                            : col.label
                        }
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full bg-slate-500 border-2 ${col.color}`}></span>
                        <span className="truncate" dir="auto">{col.label}</span>
                        {/* A column the app has no word for still shows the cards
                            that are in it — the dot just says reports won't follow. */}
                        {col.mirrored && !col.mirrored.appStatus && (
                          <span
                            className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400"
                            title="No app status is mapped to this column"
                          />
                        )}
                      </span>
                      <span className="bg-muted text-foreground px-2 py-0.5 rounded-full text-xs font-semibold shrink-0">
                        {colBugs.length}
                      </span>
                    </div>

                    <div className="space-y-3 max-h-[560px] overflow-y-auto overflow-x-hidden pr-1">
                      {colBugs.length === 0 ? (
                        <div className="text-center py-8 text-xs text-muted-foreground ">No defects</div>
                      ) : (
                        colBugs.map(bug => (
                          <div
                            key={bug.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedBugId(bug.id)
                              e.dataTransfer.effectAllowed = "move"
                            }}
                            onDragEnd={() => {
                              setDraggedBugId(null)
                              setDragOverStatus(null)
                            }}
                            onClick={() => handleOpenDetail(bug.id)}
                            className={`p-3 border rounded-xl bg-card hover:bg-muted/50 hover:border-border cursor-grab active:cursor-grabbing shadow-sm space-y-2 transition-all ${
                              draggedBugId === bug.id ? "opacity-40" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between font-mono text-xs text-muted-foreground font-semibold">
                              <span>{bug.bugKey || "BUG"}</span>
                              <span className={`px-2 py-0.5 rounded text-xs  ${
                                bug.severity === "Critical" ? "bg-red-50 text-red-600" : "bg-muted text-muted-foreground"
                              }`}>
                                {bug.severity}
                              </span>
                            </div>

                            <span className="font-semibold text-foreground line-clamp-2 leading-tight block" dir="auto">
                              {bug.title}
                            </span>

                            {bug.suite && (
                              <div className="text-xs text-sky-700 font-semibold truncate flex items-center gap-1">
                                <Layers className="h-3 w-3 shrink-0" />
                                <span className="truncate">{bug.suite.name}</span>
                              </div>
                            )}

                            {bug.testCase && (
                              <div className="text-xs text-muted-foreground font-semibold bg-muted/50 p-2 rounded truncate">
                                Tc: {bug.testCase.title}
                              </div>
                            )}

                            <div className="flex justify-between items-center text-xs text-muted-foreground pt-1 border-t">
                              <span>Env: {bug.environment}</span>
                              <span className="font-medium">{new Date(bug.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
              </div>

              {/* Bugs the tracker has never seen have no column to sit in. Say so
                  rather than silently dropping them off the board. */}
              {mirrorActive && unplacedBugs.length > 0 && (
                <div className="p-3 border border-amber-200 bg-amber-50/60 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {unplacedBugs.length} defect{unplacedBugs.length === 1 ? "" : "s"} not on the {trackerName || "tracker"} board
                  </div>
                  <p className="text-xs text-amber-700">
                    These have not been synced to {trackerName || "the tracker"} yet, or sit in a
                    status this board has no column for. Sync them to place them.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unplacedBugs.map((bug) => (
                      <button
                        key={bug.id}
                        onClick={() => handleOpenDetail(bug.id)}
                        className="px-2 py-1 rounded-lg border border-amber-200 bg-background text-xs font-semibold hover:bg-amber-100/60 transition-colors max-w-[240px] truncate"
                        dir="auto"
                      >
                        {bug.bugKey || "BUG"} · {bug.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 7. Unified Right Slide-over Detail Drawer */}
      {selectedBugId && selectedBug && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedBugId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[88vh] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-xl border bg-background text-sm shadow-[0_8px_24px_rgba(0,0,0,0.08)] animate-in zoom-in-95 duration-200"
          >

            {/* ── Top bar: identity, status, and the one-click next step ── */}
            <div className="flex shrink-0 items-center justify-between border-b bg-card/60 px-6 py-3 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-rose-50 text-rose-600">
                  <Bug className="h-4 w-4" />
                </span>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedBug.bugKey || selectedBug.id)
                    showToastMsg("Bug key copied")
                  }}
                  title="Copy bug key"
                  className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/60 px-3 py-1 font-mono text-xs font-semibold text-muted-foreground transition-all hover:text-foreground"
                >
                  <span>{selectedBug.bugKey || "BUG-DETAIL"}</span>
                  <Copy className="h-3 w-3" />
                </button>

                <BugStatusPill
                  status={selectedBug.status}
                  onChange={(s) => handleChangeBugStatus(selectedBug.id, s)}
                />

                <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${SEVERITY_STYLES[selectedBug.severity] || SEVERITY_STYLES.Low}`}>
                  {selectedBug.severity} severity
                </span>
              </div>

              <div className="flex items-center gap-2">
                {NEXT_BUG_STATUS[selectedBug.status] && (
                  <Button
                    size="sm"
                    onClick={() => handleChangeBugStatus(selectedBug.id, NEXT_BUG_STATUS[selectedBug.status].next)}
                    className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary/90"
                  >
                    {NEXT_BUG_STATUS[selectedBug.status].label}
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="rounded-lg p-2 text-muted-foreground transition-all hover:bg-muted" title="More actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit title
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        navigator.clipboard.writeText(bugLink(selectedBug.id))
                        showToastMsg("Link copied")
                      }}
                    >
                      <Link2 className="mr-2 h-4 w-4" /> Copy link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open(bugLink(selectedBug.id), "_blank", "noopener")}>
                      <ExternalLink className="mr-2 h-4 w-4" /> Open in new tab
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleSyncToOpenProject(selectedBug.id, {
                        parentId: editParentValue,
                        boardId: editBoardValue,
                        boardColumnId: editColumnValue,
                        customFields: editCustomFields,
                      })}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" /> Sync to {trackerName || "tracker"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDeleteBug(selectedBug.id)} className="text-red-600 focus:text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete bug
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  onClick={() => setSelectedBugId(null)}
                  className="rounded-lg p-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* ── Split view: work content on the left, metadata on the right ── */}
            <div className="grid min-h-0 flex-1 grid-cols-[1fr_340px] divide-x divide-border overflow-hidden">
            <div className="flex min-w-0 flex-col overflow-hidden">

            {/* Title + provenance */}
            <div className="px-6 pt-6 pb-4">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setIsEditingTitle(false)
                        handleInlineUpdate({ title: editTitleValue })
                      }
                      if (e.key === "Escape") setIsEditingTitle(false)
                    }}
                    autoFocus
                    className="h-10 text-lg font-semibold"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      setIsEditingTitle(false)
                      handleInlineUpdate({ title: editTitleValue })
                    }}
                    className="h-10 bg-primary text-white"
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <h3
                  onClick={() => setIsEditingTitle(true)}
                  title="Click to edit title"
                  className="group -mx-1 flex cursor-text items-start justify-between rounded-lg px-1 py-0.5 text-2xl font-semibold leading-snug tracking-tight text-foreground transition-all hover:bg-muted/50"
                >
                  <span dir="auto">{selectedBug.title}</span>
                  <Pencil className="ml-2 mt-2 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" />
                </h3>
              )}

              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                  {(selectedBug.reporter?.name || selectedBug.reporter?.email || "?")[0]}
                </span>
                <span>
                  Reported by{" "}
                  <span className="font-semibold text-foreground">
                    {selectedBug.reporter?.name || selectedBug.reporter?.email || "Unknown"}
                  </span>
                  {" • "}created {new Date(selectedBug.createdAt).toLocaleDateString()}
                  {" • "}updated {new Date(selectedBug.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Tab switch row */}
            <div className="flex border-b px-6 gap-6 overflow-x-auto">
              {[
                { id: "overview", label: "Details" },
                { id: "test", label: "Test case" },
                { id: "activity", label: `Activity${selectedBug.activities?.length ? ` ${selectedBug.activities.length}` : ""}` },
                ...(trackerConnected ? [{ id: "openproject", label: trackerName === "tracker" ? "Tracker" : trackerName }] : []),
              ].map((tab) => {
                const isActive = activeDetailTab === tab.id
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveDetailTab(tab.id as TabType)}
                    className={`pb-3 pt-3 px-1 border-b-2 text-xs font-semibold transition-all ${
                      isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Tab contents scroll pane */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              
              {/* Tab 1: OVERVIEW */}
              {activeDetailTab === "overview" && (
                <div className="space-y-6">

                  {isEditingDesc ? (
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">How to reproduce</h4>
                      <p className="text-xs text-muted-foreground">
                        Put preconditions under a &quot;Preconditions:&quot; line and number each step (1. 2. 3.). Expected and actual results are below.
                      </p>
                      <div className="space-y-2">
                        <textarea
                          value={editDescValue}
                          onChange={(e) => setEditDescValue(e.target.value)}
                          rows={10}
                          autoFocus
                          className="w-full rounded-lg border bg-background p-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setIsEditingDesc(false)
                              handleInlineUpdate({ stepsToReproduce: editDescValue })
                            }}
                            className="bg-primary text-white"
                          >
                            Save steps
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setIsEditingDesc(false)}>Cancel</Button>
                        </div>
                      </div>

                    </section>
                  ) : (
                    <BugReproduction
                      text={selectedBug.stepsToReproduce}
                      expected={editExpectedValue}
                      actual={editActualValue}
                      onEdit={() => setIsEditingDesc(true)}
                      onExpectedChange={setEditExpectedValue}
                      onActualChange={setEditActualValue}
                      onExpectedBlur={() => {
                        if (editExpectedValue !== (selectedBug.expectedResult || "")) handleInlineUpdate({ expectedResult: editExpectedValue })
                      }}
                      onActualBlur={() => {
                        if (editActualValue !== (selectedBug.actualResult || "")) handleInlineUpdate({ actualResult: editActualValue })
                      }}
                    />
                  )}

                  <div className="space-y-4 border-t border-border/60 pt-6">
                  {/* Screenshots preview */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Paperclip className="h-3.5 w-3.5" /> Screenshot</span>
                      <label className={`inline-flex items-center gap-2 h-7 px-3 rounded-lg border bg-primary/10 text-primary font-semibold text-xs cursor-pointer hover:bg-primary/15 transition-colors ${uploadingPhoto ? "opacity-60 pointer-events-none" : ""}`}>
                        <Paperclip className="h-3.5 w-3.5" />
                        {uploadingPhoto ? "Uploading…" : selectedBug.screenshotPath ? "Replace" : "Add screenshot"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          className="hidden"
                          disabled={uploadingPhoto}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleUploadPhoto(file)
                            e.target.value = ""
                          }}
                        />
                      </label>
                    </div>
                    {selectedBug.screenshotPath ? (
                      <div className="border rounded-xl overflow-hidden shadow-sm">
                        <img
                          src={assetUrl(selectedBug.screenshotPath)!}
                          alt="Bug Screenshot Evidence"
                          className="max-h-[300px] w-full object-contain bg-muted hover:scale-[1.02] transition-transform cursor-pointer"
                          onClick={() => window.open(assetUrl(selectedBug.screenshotPath)!, "_blank")}
                        />
                      </div>
                    ) : (
                      <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground ">
                        No screenshot yet. Add one so developers can see the problem.
                      </div>
                    )}
                  </div>

                  {selectedBug.videoUrl && (
                  <div className="space-y-1 border-t pt-3">
                    <span className="text-xs font-medium text-muted-foreground">Video</span>
                    <div className="overflow-hidden rounded-xl border bg-black shadow-sm">
                      <video src={assetUrl(selectedBug.videoUrl)!} controls className="max-h-[300px] w-full" />
                    </div>
                  </div>
                  )}
                  {(selectedBug.consoleLogs || selectedBug.networkErrors) && (
                    <details className="group rounded-xl border">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                        <span>
                          Browser logs
                          {selectedBug.networkErrors ? " · network errors" : ""}
                          {selectedBug.consoleLogs ? " · console" : ""}
                        </span>
                        <span className="group-open:hidden">Show</span>
                        <span className="hidden group-open:inline">Hide</span>
                      </summary>
                      <div className="space-y-2 border-t p-3">
                        {selectedBug.networkErrors && (
                          <pre className="max-h-[160px] select-all overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 font-mono text-xs text-rose-300">{selectedBug.networkErrors}</pre>
                        )}
                        {selectedBug.consoleLogs && (
                          <pre className="max-h-[160px] select-all overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 font-mono text-xs text-emerald-300">{selectedBug.consoleLogs}</pre>
                        )}
                      </div>
                    </details>
                  )}
                  </div>

                  {/* LinkedEntities renders its own "Linked items" heading —
                      wrapping it in a DrawerSection would show it twice. */}
                  <div className="border-t border-border/60 pt-6">
                    <LinkedEntities
                      projectId={projectId}
                      entityId={selectedBug.id}
                      entityType="BUG_REPORT"
                    />
                  </div>

                  {/* Duplicates + AI triage (professional-tester rules) */}
                  <div className="border-t border-border/60 pt-6">
                    <BugTriagePanel
                      bugId={selectedBug.id}
                      projectId={projectId}
                      title={selectedBug.title}
                      steps={selectedBug.stepsToReproduce ?? null}
                      severity={selectedBug.severity}
                      priority={selectedBug.priority}
                      onApply={(fields) => handleInlineUpdate(fields as Partial<BugReport>)}
                      onOpenBug={(id) => handleOpenDetail(id)}
                      runSignal={triageSignal}
                    />
                  </div>

                </div>
              )}

              {/* Tab 4: LINKED TEST / RUN */}
              {activeDetailTab === "test" && (
                <div className="space-y-4">
                  {selectedBug.testCase ? (
                    <div className="p-4 border border-border bg-slate-500/[0.01] rounded-xl space-y-3 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-muted-foreground/60">Linked TestCase</span>
                          <h4 className="font-semibold text-foreground">{selectedBug.testCase.title}</h4>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => router.push(`/projects/${projectId}/test-cases?case=${selectedBug.testCase!.id}`)}
                          className="h-7 bg-primary text-white font-semibold"
                        >
                          Open case
                        </Button>
                      </div>

                      {selectedBug.testRun && (
                        <div className="border-t pt-3 space-y-2">
                          <div className="flex justify-between items-center text-xs text-slate-600 font-semibold">
                            <span>Test run</span>
                            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">RUN-{selectedBug.testRun.id.slice(0, 8)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs text-slate-600 font-semibold">
                            <span>Status</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold  ${
                              selectedBug.testRun.status === "Passed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            }`}>{selectedBug.testRun.status}</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="border-t pt-3 flex gap-2">
                        <Button 
                          onClick={() => handleTriggerRetest(selectedBug.id)}
                          className="h-8 px-3 bg-primary text-white font-semibold w-full flex items-center justify-center gap-1"
                        >
                          <Play className="h-4 w-4" /> Trigger Retest Run
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground ">
                        This defect report is not linked to any test cases.
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Link TestCase ID</Label>
                        <Input 
                          placeholder="Paste TestCase UUID..."
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleInlineUpdate({ testCaseId: e.currentTarget.value })
                            }
                          }}
                          className="h-9 bg-background"
                        />
                      </div>
                    </div>
                  )}

                  {/* Linked User Stories — optional, editable any time */}
                  <div className="p-4 border border-border rounded-xl space-y-3 shadow-sm">
                    <span className="text-xs font-medium text-muted-foreground/60 block">
                      Linked User Stories ({linkedStoryIds.length})
                    </span>
                    {(((selectedBug as any).requirements) || []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {((selectedBug as any).requirements as any[]).map((l) => l.requirement && (
                          <RequirementLink key={l.requirementId || l.requirement.id} projectId={projectId} requirementId={l.requirementId || l.requirement.id} requirementKey={l.requirement.requirementKey} />
                        ))}
                      </div>
                    )}
                    <LinkedRequirementsSelector
                      projectId={projectId}
                      selectedIds={linkedStoryIds}
                      onChange={(ids) => {
                        setLinkedStoryIds(ids)
                        handleInlineUpdate({ requirementIds: ids } as any)
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Tab 5: ACTIVITY */}
              {activeDetailTab === "activity" && (
                <div className="space-y-4">
                  
                  {/* Mark as duplicate section */}
                  {selectedBug.status !== "Duplicate" && (
                    <div className="p-3 border border-dashed rounded-xl bg-muted/50 space-y-3">
                      <span className="font-medium text-xs text-muted-foreground block">Link as Duplicate defect</span>
                      <div className="flex gap-2">
                        <select 
                          value={duplicateTargetId} 
                          onChange={(e) => setDuplicateTargetId(e.target.value)}
                          className="h-8 flex-1 rounded border bg-background text-xs font-semibold px-2 outline-none"
                        >
                          <option value="">Choose original bug...</option>
                          {bugs.filter(b => b.id !== selectedBug.id && b.status !== "Duplicate").map(b => (
                            <option key={b.id} value={b.id}>{b.bugKey || "BUG"} &bull; {b.title.slice(0, 40)}...</option>
                          ))}
                        </select>
                        <Button 
                          onClick={handleMarkDuplicate}
                          disabled={!duplicateTargetId}
                          size="sm"
                          className="h-8 bg-slate-800 text-white font-semibold"
                        >
                          Link duplicate
                        </Button>
                      </div>
                    </div>
                  )}

                  <span className="text-xs text-muted-foreground block select-none">Audit log activities ({selectedBug.activities?.length ?? 0})</span>
                  {(selectedBug.activities?.length ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground">No activity logged.</p>
                  ) : (
                    <div className="space-y-3">
                      {(selectedBug.activities ?? []).map((act) => (
                        <div key={act.id} className="p-3 border rounded-xl bg-muted/50 space-y-1 text-xs font-medium leading-relaxed">
                          <div className="flex justify-between items-center text-muted-foreground font-semibold">
                            <span className="text-primary">{act.action}</span>
                            <span className="text-xs text-muted-foreground font-normal">{new Date(act.createdAt).toLocaleDateString()} {new Date(act.createdAt).toLocaleTimeString()}</span>
                          </div>
                          {act.details && <p className="text-muted-foreground text-xs">{act.details}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 6: OPENPROJECT */}
              {activeDetailTab === "openproject" && (
                <div className="space-y-4">
                  {/* Required custom fields on the bug type (e.g. Found in Build, Bug Componant) */}
                  {opBugFields.length > 0 && (
                    <div className="p-4 border rounded-xl bg-amber-50/40 border-amber-100 space-y-3">
                      <span className="text-xs font-medium text-amber-700 block">
                        Required Bug Fields ({trackerName})
                      </span>
                      {opBugFields.map(f => {
                        const kind = f.isFormattable ? "formattable" : f.isLink ? (f.isMulti ? "link-multi" : "link-single") : "text"
                        const current = editCustomFields[f.key]?.value
                        return (
                          <div key={f.key} className="space-y-1">
                            <Label className="text-muted-foreground text-xs block">
                              {f.name}{f.required && <span className="text-rose-500"> *</span>}
                            </Label>
                            {f.isLink ? (
                              <select
                                value={f.isMulti ? (Array.isArray(current) ? (current[0] || "") : "") : (current || "")}
                                onChange={(e) => {
                                  const v = e.target.value
                                  const value = f.isMulti ? (v ? [v] : []) : v
                                  const next = { ...editCustomFields, [f.key]: { kind, value } }
                                  setEditCustomFields(next)
                                  handleInlineUpdate({ openProjectCustomFields: next } as any)
                                }}
                                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                              >
                                <option value="">— Select —</option>
                                {f.allowedValues.map(o => (
                                  <option key={o.href} value={o.href}>{o.title}</option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                value={current || ""}
                                onChange={(e) => setEditCustomFields(prev => ({ ...prev, [f.key]: { kind, value: e.target.value } }))}
                                onBlur={() => handleInlineUpdate({ openProjectCustomFields: editCustomFields } as any)}
                                placeholder={f.name}
                                className="h-8 bg-background"
                              />
                            )}
                          </div>
                        )
                      })}
                      <div className="space-y-2 pt-1">
                        <p className="text-xs text-muted-foreground">
                          Required by the {trackerName} bug type — sent when you sync.
                          {Object.keys(bugFieldDefaults).length > 0
                            ? " Bugs with no value of their own fall back to the project defaults."
                            : " Bugs with no value here fail to sync — save defaults so every bug has one."}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingDefaults || Object.keys(editCustomFields).length === 0}
                          onClick={handleSaveFieldDefaults}
                          className="h-7 text-xs font-semibold"
                        >
                          {savingDefaults ? "Saving…" : "Use these as project defaults"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {opSyncStatus ? (
                    <div className="p-4 border rounded-xl bg-muted/50 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Sync status</span>
                        <span className={`px-2 py-0.5 rounded font-semibold  text-xs ${
                          opSyncStatus.status === "Synced" ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"
                        }`}>{opSyncStatus.status}</span>
                      </div>

                      {opSyncStatus.externalId && (
                        <div className="flex justify-between items-center text-xs font-semibold">
                          <span className="text-muted-foreground">Work Package ID</span>
                          <span className="font-mono text-foreground">#{opSyncStatus.externalId}</span>
                        </div>
                      )}

                      {opSyncStatus.externalUrl && (
                        <div className="pt-2 border-t flex justify-end">
                          <a 
                            href={opSyncStatus.externalUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
                          >
                            View in {trackerName} <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      )}

                      <div className="pt-2 border-t space-y-2">
                        <Button
                          onClick={() => handleSyncToOpenProject(selectedBug.id, {
                            parentId: editParentValue,
                            boardId: editBoardValue,
                            boardColumnId: editColumnValue,
                            customFields: editCustomFields
                          })}
                          disabled={syncingOP}
                          className="h-8 px-4 bg-primary text-white font-semibold w-full"
                        >
                          {syncingOP ? "Syncing..." : "Sync / Update Mapped Ticket"}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          Uses the Parent / Board / Column set in the sidebar.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground ">
                      {trackerName} integrations connection is disabled for active project. Check Settings.
                    </div>
                  )}
                </div>
              )}
            </div>

            </div>{/* end left column */}

            {/* ── Right metadata sidebar ── */}
            <div className="min-w-0 space-y-4 overflow-y-auto bg-muted/30 p-5">

              <SideCard icon={Tag} title="Details">
                <SideRow label="Type">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Bug className="h-3.5 w-3.5 text-rose-500" /> Bug
                  </span>
                </SideRow>

                <SideRow label="Assignee">
                  {opMembers.length > 0 ? (
                    <select
                      value={selectedBug.assignedTo || ""}
                      onChange={(e) => handleInlineUpdate({ assignedTo: e.target.value })}
                      className={SIDE_SELECT}
                    >
                      <option value="">Unassigned</option>
                      {selectedBug.assignedTo && !opMembers.some(m => m.id === selectedBug.assignedTo) && (
                        <option value={selectedBug.assignedTo}>{selectedBug.assignedTo}</option>
                      )}
                      {opMembers.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={editAssigneeValue}
                      onChange={(e) => setEditAssigneeValue(e.target.value)}
                      onBlur={() => {
                        if (editAssigneeValue !== (selectedBug.assignedTo || "")) {
                          handleInlineUpdate({ assignedTo: editAssigneeValue })
                        }
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                      placeholder="Developer email…"
                      className="h-8 bg-background text-xs"
                    />
                  )}
                </SideRow>

                <SideRow label="Reporter">
                  <span className="flex items-center gap-2 truncate text-xs font-semibold text-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                      {(selectedBug.reporter?.name || selectedBug.reporter?.email || "?")[0]}
                    </span>
                    <span className="truncate">{selectedBug.reporter?.name || selectedBug.reporter?.email || "Unknown"}</span>
                  </span>
                </SideRow>

                {/* Module/service. Auto-filled from the linked test case's suite
                    when the bug was created, and changeable here. */}
                <SideRow label="Module">
                  <ModuleSelect
                    projectId={projectId}
                    value={selectedBug.suiteId || ""}
                    onChange={(next) => {
                      if (next !== (selectedBug.suiteId || "")) {
                        handleInlineUpdate({ suiteId: next || null } as Partial<BugReport>)
                      }
                    }}
                    className={SIDE_SELECT}
                  />
                </SideRow>

                <SideRow label="Severity">
                  <select
                    value={selectedBug.severity}
                    onChange={(e) => handleInlineUpdate({ severity: e.target.value as any })}
                    className={`${SIDE_SELECT} ${SEVERITY_STYLES[selectedBug.severity] || ""}`}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </SideRow>

                <SideRow label="Priority">
                  <select
                    value={selectedBug.priority}
                    onChange={(e) => handleInlineUpdate({ priority: e.target.value as any })}
                    className={`${SIDE_SELECT} ${SEVERITY_STYLES[selectedBug.priority] || ""}`}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </SideRow>

                <SideRow label="Resolution">
                  <select
                    value={selectedBug.resolution || ""}
                    onChange={(e) => handleInlineUpdate({ resolution: (e.target.value || null) as BugReport["resolution"] })}
                    className={SIDE_SELECT}
                  >
                    <option value="">Unresolved</option>
                    <option value="Fixed">Fixed</option>
                    <option value="WontFix">Won&apos;t Fix</option>
                    <option value="CannotReproduce">Cannot Reproduce</option>
                    <option value="Duplicate">Duplicate</option>
                    <option value="ByDesign">By Design</option>
                  </select>
                </SideRow>

                {selectedBug.resolution && (
                  <SideRow label="Note">
                    <Input
                      value={editResolutionNoteValue}
                      onChange={(e) => setEditResolutionNoteValue(e.target.value)}
                      onBlur={() => {
                        if (editResolutionNoteValue !== (selectedBug.resolutionNote || "")) {
                          handleInlineUpdate({ resolutionNote: editResolutionNoteValue })
                        }
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                      placeholder="Optional…"
                      className="h-8 bg-background text-xs"
                    />
                  </SideRow>
                )}

                {opSourceOptions.length > 0 && (
                  <SideRow label="Source">
                    <select
                      value={selectedBug.source || ""}
                      onChange={(e) => handleInlineUpdate({ source: e.target.value } as any)}
                      className={SIDE_SELECT}
                    >
                      <option value="">— Select —</option>
                      {selectedBug.source && !opSourceOptions.includes(selectedBug.source) && (
                        <option value={selectedBug.source}>{selectedBug.source}</option>
                      )}
                      {opSourceOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </SideRow>
                )}

                <SideRow label="Labels">
                  <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border bg-background p-2">
                    {(selectedBug.tags || []).map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {t}
                        <button
                          type="button"
                          onClick={() => handleInlineUpdate({ tags: (selectedBug.tags || []).filter((x) => x !== t) })}
                          className="hover:text-primary"
                          aria-label={`Remove ${t}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault()
                          const t = tagInput.trim().replace(/,$/, "")
                          if (t && !(selectedBug.tags || []).includes(t)) {
                            handleInlineUpdate({ tags: [...(selectedBug.tags || []), t] })
                          }
                          setTagInput("")
                        } else if (e.key === "Backspace" && !tagInput && (selectedBug.tags || []).length > 0) {
                          handleInlineUpdate({ tags: (selectedBug.tags || []).slice(0, -1) })
                        }
                      }}
                      placeholder={(selectedBug.tags || []).length ? "Add…" : "Add + Enter"}
                      className="min-w-[60px] flex-1 bg-transparent text-xs font-medium outline-none"
                    />
                  </div>
                </SideRow>
              </SideCard>

              <SideCard icon={Globe} title="Environment">
                <SideRow label="Env">
                  <span className={`truncate text-xs ${selectedBug.environment ? "font-medium text-foreground" : "text-muted-foreground"}`}>{selectedBug.environment || "Not recorded"}</span>
                </SideRow>
                <SideRow label="Browser">
                  <span className={`truncate text-xs ${selectedBug.browser ? "font-medium text-foreground" : "text-muted-foreground"}`}>{selectedBug.browser || "Not recorded"}</span>
                </SideRow>
                <SideRow label="Viewport">
                  <span className={`truncate text-xs ${selectedBug.viewport ? "font-medium text-foreground" : "text-muted-foreground"}`}>{selectedBug.viewport || "Not recorded"}</span>
                </SideRow>
              </SideCard>

              {trackerConnected && (
              <SideCard icon={Kanban} title={`${trackerName || "Tracker"} placement`}>
                <SideRow label="Parent">
                  <Input
                    value={editParentValue}
                    onChange={(e) => setEditParentValue(e.target.value)}
                    onBlur={() => {
                      if (editParentValue !== (selectedBug.openProjectParentId || "")) {
                        handleInlineUpdate({ openProjectParentId: editParentValue })
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                    placeholder="e.g. 1234"
                    className="h-8 bg-background text-xs"
                  />
                </SideRow>

                {opBoards.length > 0 && (
                  <SideRow label="Board">
                    <select
                      value={editBoardValue}
                      onChange={(e) => {
                        const boardId = e.target.value
                        setEditBoardValue(boardId)
                        setEditColumnValue("")
                        loadBoardColumns(boardId)
                        handleInlineUpdate({ openProjectBoardId: boardId, openProjectBoardColumnId: "" })
                      }}
                      className={SIDE_SELECT}
                    >
                      <option value="">No board</option>
                      {opBoards.map(b => (
                        <option key={b.id} value={String(b.id)}>
                          {b.name}{b.type ? ` (${b.type})` : ""}
                        </option>
                      ))}
                    </select>
                  </SideRow>
                )}

                {opBoards.length > 0 && editBoardValue && (
                  <SideRow label="Column">
                    <select
                      value={editColumnValue}
                      onChange={(e) => {
                        setEditColumnValue(e.target.value)
                        handleInlineUpdate({ openProjectBoardColumnId: e.target.value })
                      }}
                      disabled={loadingColumns}
                      className={`${SIDE_SELECT} disabled:opacity-60`}
                    >
                      <option value="">{loadingColumns ? "Loading…" : "First column"}</option>
                      {opBoardColumns.map(c => (
                        <option key={c.widgetId} value={String(c.widgetId)}>{c.name}</option>
                      ))}
                    </select>
                  </SideRow>
                )}
              </SideCard>
              )}

            </div>
            </div>{/* end split view */}

            <div className="flex shrink-0 items-center justify-end border-t px-6 py-2">
              <button
                onClick={() => setShowShortcuts(true)}
                className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
              >
                Keyboard shortcuts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create the OpenProject bug board: name it, columns come from the workflow. */}
      <BugStatusMappingModal
        projectId={projectId}
        open={showStatusMappingModal}
        onClose={() => setShowStatusMappingModal(false)}
        onSaved={() => showToastMsg("Bug status mapping saved.")}
      />

      <CreateBugBoardModal
        projectId={projectId}
        open={showCreateBoardModal}
        onClose={() => setShowCreateBoardModal(false)}
        onCreated={(board) => showToastMsg(`Board created with ${board.columns.length} column(s).`)}
      />

      {/* Tracker rebuild — wipe the tracker's bug work items and push ours back. */}
      <RebuildTrackerBugsModal
        projectId={projectId}
        trackerName={trackerName || "the tracker"}
        open={showRebuildModal}
        onClose={() => setShowRebuildModal(false)}
        onCompleted={loadBugsList}
      />

      {/* Bugs from an automation run's bug report PDF, with their screenshots. */}
      <ImportPdfBugsModal
        projectId={projectId}
        open={showImportPdfModal}
        onClose={() => setShowImportPdfModal(false)}
        modules={projectModules}
        onImported={loadBugsList}
        onOpenBug={handleOpenDetail}
      />

      {/* Downloadable QA/UAT testing report — pre-filled, editable, self-contained. */}
      <QaReportModal
        projectId={projectId}
        open={showQaReportModal}
        onClose={() => setShowQaReportModal(false)}
        // A module named in the report is created in the project, so the filter
        // and the drawer's picker on this page have to learn about it without a
        // reload. A rename reaches the bugs filed under it, so the list is
        // reloaded too.
        onModulesChanged={() => {
          refreshModules()
          loadBugsList()
        }}
        // A defect re-filed, re-prioritised or moved through its workflow in the
        // report is saved to the bug itself — the list behind this dialog would
        // otherwise go on showing the values it loaded.
        onDefectsChanged={loadBugsList}
      />

      {/* 8. Manual Create Bug Modal */}
      <CreateBugModal
        projectId={projectId}
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        sourceOptions={opSourceOptions}
        onCreated={(bug, { syncedToOpenProject }) => {
          showToastMsg(`Defect ${bug.bugKey || ""} successfully reported!`)
          if (syncedToOpenProject) showToastMsg(`Synchronised with ${trackerName} successfully!`)
          loadBugsList()
        }}
      />

      {/* 9. Resolution prompt — shown when the workflow requires a reason for
             moving a bug to Resolved / Closed / Rejected. Without this the
             status change would just fail with no way forward. */}
      {resolutionPrompt && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setResolutionPrompt(null)}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-6 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <h3 className="text-base font-semibold">
                Why is this moving to {resolutionPrompt.targetStatus}?
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Recording a reason is what makes fix-rate and reopen reporting possible later.
              </p>
            </div>

            <div className="space-y-2">
              {(["Fixed", "WontFix", "CannotReproduce", "Duplicate", "ByDesign"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    const { bugId, targetStatus } = resolutionPrompt
                    setResolutionPrompt(null)
                    handleChangeBugStatus(bugId, targetStatus, r)
                  }}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <span className="font-medium">
                    {r === "WontFix" ? "Won't fix" : r === "CannotReproduce" ? "Cannot reproduce" : r === "ByDesign" ? "By design" : r}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>

            <button
              onClick={() => setResolutionPrompt(null)}
              className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
