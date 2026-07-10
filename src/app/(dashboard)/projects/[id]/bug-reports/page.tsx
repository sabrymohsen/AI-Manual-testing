"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { ActiveProjectContextBar } from "@/components/ui/active-project-context-bar"
import { CreateBugModal } from "@/components/bug-reports/create-bug-modal"
import { LinkedRequirementsSelector } from "@/components/test-cases/linked-requirements-selector"
import { OpenOnBoardLink } from "@/components/board/open-on-board-link"
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
  Kanban
} from "lucide-react"

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
  testRun?: { id: string; status: string; browserType: string; createdAt: string } | null
  manualTestSession?: { id: string; name: string } | null
  comments: BugComment[]
  activities: BugActivity[]
  occurrences: BugOccurrence[]
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

export default function ProjectBugReportsPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  // Connected tracker name (Jira / Azure DevOps / ClickUp / OpenProject) for labels.
  const { name: trackerName } = useProjectIntegration(projectId)

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

  // Detail Drawer States
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null)
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null)
  // Linked user stories (BugReportRequirement links) for the open bug
  const [linkedStoryIds, setLinkedStoryIds] = useState<string[]>([])
  const [activeDetailTab, setActiveDetailTab] = useState<TabType>("overview")
  const [detailLoading, setDetailLoading] = useState(false)

  // Form states for manual creation
  const [showCreateModal, setShowCreateModal] = useState(false)

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

  // OpenProject integration details
  const [opSyncStatus, setOpSyncStatus] = useState<{ status: string; externalUrl: string | null; externalId: string | null } | null>(null)
  const [syncingOP, setSyncingOP] = useState(false)

  // Duplication management
  const [duplicateTargetId, setDuplicateTargetId] = useState("")

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

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

  // Load project basic scope details
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(res => res.json())
      .then(data => setProject(data.project))
      .catch(err => console.error("Error loading project scope details:", err))
  }, [projectId])

  // Load assignable OpenProject members (no-op if integration isn't configured)
  useEffect(() => {
    fetch(`/api/projects/${projectId}/integrations/openproject/members`)
      .then(res => (res.ok ? res.json() : { members: [] }))
      .then(data => setOpMembers(Array.isArray(data.members) ? data.members : []))
      .catch(() => setOpMembers([]))
  }, [projectId])

  // Load OpenProject boards for bug placement (no-op if integration isn't configured)
  useEffect(() => {
    fetch(`/api/projects/${projectId}/integrations/openproject/metadata`)
      .then(res => (res.ok ? res.json() : { boards: [] }))
      .then(data => setOpBoards(Array.isArray(data.boards) ? data.boards : []))
      .catch(() => setOpBoards([]))
  }, [projectId])

  // Load the required custom fields of the OpenProject bug type (no-op if unconfigured)
  useEffect(() => {
    fetch(`/api/projects/${projectId}/integrations/openproject/bug-fields`)
      .then(res => (res.ok ? res.json() : { fields: [] }))
      .then(data => setOpBugFields(Array.isArray(data.fields) ? data.fields : []))
      .catch(() => setOpBugFields([]))
  }, [projectId])

  // Load "Bug Source" options from OpenProject (no-op if unconfigured / no field)
  useEffect(() => {
    fetch(`/api/projects/${projectId}/integrations/openproject/source-options`)
      .then(res => (res.ok ? res.json() : { options: [] }))
      .then(data => setOpSourceOptions(Array.isArray(data.options) ? data.options : []))
      .catch(() => setOpSourceOptions([]))
  }, [projectId])

  // Load bugs list with queries
  const loadBugsList = async () => {
    setLoading(true)
    try {
      const qParams: string[] = []
      if (filterSeverity !== "all") qParams.push(`severity=${filterSeverity}`)
      if (filterPriority !== "all") qParams.push(`priority=${filterPriority}`)
      if (filterStatus !== "all") qParams.push(`status=${filterStatus}`)
      if (filterSource !== "all") qParams.push(`source=${filterSource}`)
      if (searchQuery) qParams.push(`search=${encodeURIComponent(searchQuery)}`)

      const queryStr = qParams.length > 0 ? `?${qParams.join("&")}` : ""
      const res = await fetch(`/api/projects/${projectId}/bug-reports${queryStr}`)
      if (res.ok) {
        const data = await res.json()
        setBugs(data.bugReports || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBugsList()
  }, [projectId, filterSeverity, filterPriority, filterStatus, filterSource, searchQuery])

  // Read query params on load to automatically open detail drawer
  useEffect(() => {
    const bugIdParam = searchParams.get("bugId")
    if (bugIdParam) {
      handleOpenDetail(bugIdParam)
    }
  }, [searchParams])

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
      }
    } catch (err) {
      console.error(err)
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
        showToastMsg("Failed to save changes", "error")
      }
    } catch (err) {
      showToastMsg("Network error saving changes", "error")
    }
  }

  // Change a bug's status by id (used by board drag-and-drop). Optimistic update
  // with revert-on-failure.
  const handleChangeBugStatus = async (bugId: string, newStatus: string) => {
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
        body: JSON.stringify({ status: newStatus })
      })
      if (res.ok) {
        showToastMsg(`Moved to ${newStatus}`)
      } else {
        showToastMsg("Failed to update status", "error")
        loadBugsList() // revert to server truth
      }
    } catch {
      showToastMsg("Network error updating status", "error")
      loadBugsList()
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
        showToastMsg(`Synchronised with ${trackerName} successfully!`)
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

  // Perform the actual deletion; deleteRemote also removes the linked OP work package.
  const performDeleteBug = async (bugId: string, deleteRemote: boolean) => {
    try {
      const res = await fetch(`/api/bug-reports/${bugId}?deleteRemote=${deleteRemote ? "true" : "false"}`, {
        method: "DELETE"
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (deleteRemote && data.remoteError) {
          showToastMsg(`Bug deleted, but OpenProject removal failed: ${data.remoteError}`, "error")
        } else if (deleteRemote && data.remoteDeleted) {
          showToastMsg("Defect deleted from the app and OpenProject.")
        } else {
          showToastMsg("Defect successfully deleted.")
        }
        setDeleteTarget(null)
        setSelectedBugId(null)
        loadBugsList()
      } else {
        showToastMsg("Failed to delete bug report", "error")
      }
    } catch (err) {
      showToastMsg("Network error deleting bug report", "error")
    }
  }

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

  const handleBulkAssignParent = () => handleBulkUpdate({ openProjectParentId: bulkParentValue }, "Parent")
  const handleBulkAssignee = () => handleBulkUpdate({ assignedTo: bulkAssigneeValue }, "Assignee")

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

  // Bulk delete every selected bug (optionally removing the linked OP work package).
  const performBulkDelete = async (deleteRemote: boolean) => {
    if (selectedBugIds.length === 0) return
    setBulkApplying(true)
    try {
      const results = await Promise.all(
        selectedBugIds.map(id =>
          fetch(`/api/bug-reports/${id}?deleteRemote=${deleteRemote ? "true" : "false"}`, { method: "DELETE" })
        )
      )
      const failed = results.filter(r => !r.ok).length
      if (failed === 0) showToastMsg(`Deleted ${selectedBugIds.length} bug(s)${deleteRemote ? " (app + OpenProject)" : ""}.`)
      else showToastMsg(`${failed} of ${selectedBugIds.length} deletion(s) failed.`, "error")
      setBulkDeleteOpen(false)
      setSelectedBugIds([])
      if (selectedBugId && selectedBugIds.includes(selectedBugId)) setSelectedBugId(null)
      loadBugsList()
    } catch {
      showToastMsg("Network error deleting bugs", "error")
    } finally {
      setBulkApplying(false)
    }
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none">
      
      {/* Toast Feedback */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-2 border font-bold text-white transition-all transform animate-in slide-in-from-bottom duration-300 ${
          toast.type === "success" ? "bg-emerald-600 border-emerald-500" : "bg-rose-600 border-rose-500"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4.5 w-4.5" /> : <XCircle className="h-4.5 w-4.5" />}
          {toast.message}
        </div>
      )}

      {/* Delete confirmation: choose app-only or app + OpenProject */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[440px] bg-background rounded-2xl border shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-200 text-xs font-semibold">
            <div className="space-y-1.5">
              <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
                <Trash2 className="h-4.5 w-4.5 text-rose-600" /> Delete Defect
              </h3>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                This action is irreversible.
                {deleteTarget.synced
                  ? " This bug is synced to OpenProject — choose whether to also delete the linked work package."
                  : " This bug is not synced to OpenProject."}
              </p>
            </div>

            <div className="space-y-2">
              <Button
                onClick={() => performDeleteBug(deleteTarget.id, false)}
                className="h-9 w-full bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                Delete from app only
              </Button>
              {deleteTarget.synced && (
                <Button
                  onClick={() => performDeleteBug(deleteTarget.id, true)}
                  className="h-9 w-full bg-slate-800 hover:bg-slate-900 text-white font-bold"
                >
                  Delete from app and OpenProject
                </Button>
              )}
              <Button
                onClick={() => setDeleteTarget(null)}
                variant="ghost"
                className="h-9 w-full font-bold text-slate-600"
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
            <div className="w-[440px] bg-background rounded-2xl border shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-200 text-xs font-semibold">
              <div className="space-y-1.5">
                <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
                  <Trash2 className="h-4.5 w-4.5 text-rose-600" /> Delete {selectedBugIds.length} Defect{selectedBugIds.length === 1 ? "" : "s"}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  This action is irreversible.
                  {syncedCount > 0
                    ? ` ${syncedCount} of these ${syncedCount === 1 ? "is" : "are"} synced to OpenProject — choose whether to also delete the linked work package${syncedCount === 1 ? "" : "s"}.`
                    : " None of these are synced to OpenProject."}
                </p>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => performBulkDelete(false)}
                  disabled={bulkApplying}
                  className="h-9 w-full bg-rose-600 hover:bg-rose-700 text-white font-bold"
                >
                  {bulkApplying ? "Deleting…" : "Delete from app only"}
                </Button>
                {syncedCount > 0 && (
                  <Button
                    onClick={() => performBulkDelete(true)}
                    disabled={bulkApplying}
                    className="h-9 w-full bg-slate-800 hover:bg-slate-900 text-white font-bold"
                  >
                    {bulkApplying ? "Deleting…" : "Delete from app and OpenProject"}
                  </Button>
                )}
                <Button
                  onClick={() => setBulkDeleteOpen(false)}
                  disabled={bulkApplying}
                  variant="ghost"
                  className="h-9 w-full font-bold text-slate-600"
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
              showToastMsg("OpenProject bugs synchronization started...")
              bugs.forEach(b => {
                if (b.status !== "Closed" && b.status !== "Duplicate") {
                  handleSyncToOpenProject(b.id)
                }
              })
            },
            icon: RefreshCw
          },
          {
            label: "Export",
            onClick: handleExportBugs
          }
        ]}
      />

      <ActiveProjectContextBar projectId={projectId} />

      {/* 4. Summary Metrics Row Section */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: "Total Bugs", count: bugs.length, color: "text-slate-800", filter: "all", field: "status" },
          { label: "Open Bugs", count: bugs.filter(b => ["Open", "Reopened", "InProgress"].includes(b.status)).length, color: "text-amber-600", filter: "Open", field: "status" },
          { label: "Critical Bugs", count: bugs.filter(b => b.severity === "Critical" || b.severity === "High").length, color: "text-rose-600", filter: "Critical", field: "severity" },
          { label: "Auto-Created", count: bugs.filter(b => b.testRunId !== null).length, color: "text-indigo-600", filter: "Auto", field: "source" },
          { label: "OP Synced", count: bugs.filter(b => b.openProjectSyncStatus === "Synced").length, color: "text-sky-600", filter: "Synced", field: "openproject" },
          { label: "Duplicates", count: bugs.filter(b => b.status === "Duplicate").length, color: "text-slate-450", filter: "Duplicate", field: "status" }
        ].map((c, idx) => (
          <div 
            key={idx}
            onClick={() => {
              if (c.field === "status") setFilterStatus(c.filter)
              if (c.field === "severity") setFilterSeverity(c.filter)
              if (c.field === "source") setFilterSource(c.filter)
            }}
            className="p-4 border rounded-2xl bg-card hover:bg-slate-50/50 cursor-pointer border-slate-100 shadow-sm transition-all text-center space-y-1"
          >
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground/60">{c.label}</span>
            <div className={`text-xl font-extrabold ${c.color}`}>{c.count}</div>
          </div>
        ))}
      </div>

      {/* 5. Filters and Search Console */}
      <div className="p-4 border border-slate-100 shadow-sm bg-card rounded-2xl flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
          <Input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, testcase, logs..." 
            className="pl-9 h-9 text-xs bg-background"
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
            <option value="Auto">Auto Run</option>
          </select>

          <div className="flex border rounded-lg overflow-hidden shrink-0">
            <button 
              onClick={() => setViewMode("list")}
              className={`h-9 px-3 text-xs font-bold transition-all ${viewMode === "list" ? "bg-slate-100 text-slate-800" : "bg-background hover:bg-slate-50 text-muted-foreground"}`}
            >
              List View
            </button>
            <button 
              onClick={() => setViewMode("board")}
              className={`h-9 px-3 text-xs font-bold transition-all ${viewMode === "board" ? "bg-slate-100 text-slate-800" : "bg-background hover:bg-slate-50 text-muted-foreground"}`}
            >
              Board View
            </button>
          </div>
        </div>
      </div>

      {/* Bulk action bar: assignee / board+column / parent / delete for many bugs at once */}
      {selectedBugIds.length > 0 && (
        <div className="p-3 border border-indigo-100 bg-indigo-50/60 rounded-2xl space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-extrabold text-indigo-700 text-[11px]">
              <CheckSquare className="h-4 w-4" />
              {selectedBugIds.length} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkApplying}
                size="sm"
                variant="ghost"
                className="h-8 font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 shrink-0 gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button
                onClick={() => setSelectedBugIds([])}
                variant="ghost"
                size="sm"
                className="h-8 font-bold text-slate-600 shrink-0"
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {/* Assignee */}
            <div className="flex items-end gap-1.5">
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold uppercase tracking-wide text-indigo-600/80 flex items-center gap-1"><UserPlus className="h-3 w-3" /> Assignee</span>
                {opMembers.length > 0 ? (
                  <select
                    value={bulkAssigneeValue}
                    onChange={(e) => setBulkAssigneeValue(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-xs font-bold min-w-[150px]"
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
              <Button onClick={handleBulkAssignee} disabled={bulkApplying} size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shrink-0">Apply</Button>
            </div>

            {/* Board + column */}
            {opBoards.length > 0 && (
              <div className="flex items-end gap-1.5">
                <div className="space-y-1">
                  <span className="text-[9px] font-extrabold uppercase tracking-wide text-indigo-600/80 flex items-center gap-1"><Kanban className="h-3 w-3" /> Board</span>
                  <select
                    value={bulkBoardValue}
                    onChange={(e) => { setBulkBoardValue(e.target.value); setBulkColumnValue(""); loadBulkBoardColumns(e.target.value) }}
                    className="h-8 rounded-md border bg-background px-2 text-xs font-bold min-w-[140px]"
                  >
                    <option value="">— Board —</option>
                    {opBoards.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-extrabold uppercase tracking-wide text-indigo-600/80">Column</span>
                  <select
                    value={bulkColumnValue}
                    onChange={(e) => setBulkColumnValue(e.target.value)}
                    disabled={!bulkBoardValue || loadingBulkColumns}
                    className="h-8 rounded-md border bg-background px-2 text-xs font-bold min-w-[140px] disabled:opacity-50"
                  >
                    <option value="">{loadingBulkColumns ? "Loading…" : "First column"}</option>
                    {bulkBoardColumns.map(c => <option key={c.widgetId} value={String(c.widgetId)}>{c.name}</option>)}
                  </select>
                </div>
                <Button onClick={handleBulkBoardColumn} disabled={bulkApplying || !bulkBoardValue} size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shrink-0">Apply</Button>
              </div>
            )}

            {/* Parent */}
            <div className="flex items-end gap-1.5">
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold uppercase tracking-wide text-indigo-600/80 flex items-center gap-1"><Layers className="h-3 w-3" /> Parent WP</span>
                <Input
                  value={bulkParentValue}
                  onChange={(e) => setBulkParentValue(e.target.value)}
                  placeholder="e.g. 1234"
                  className="h-8 bg-background w-[120px]"
                />
              </div>
              <Button onClick={handleBulkAssignParent} disabled={bulkApplying} size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shrink-0">Apply</Button>
            </div>
          </div>
          {opBoards.length > 0 && (
            <p className="text-[9px] text-indigo-500/70 font-semibold">Board/column moves already-synced bugs on OpenProject immediately; others store the target for their next sync.</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center p-12 text-muted-foreground animate-pulse font-bold">
          Querying defect sheets...
        </div>
      ) : bugs.length === 0 ? (
        /* Empty State */
        <div className="p-16 border border-dashed rounded-3xl text-center space-y-4 max-w-xl mx-auto">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <Bug className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-extrabold text-sm text-slate-800">No bugs reported yet</h3>
            <p className="text-[10px] text-muted-foreground font-medium max-w-xs mx-auto leading-relaxed">
              Create bugs manually, capture screenshots from Live QA Sessions, or auto-create them from failed playwright test runs.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => setShowCreateModal(true)} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9">
              + Create Bug
            </Button>
            <Button onClick={() => router.push(`/projects/${projectId}/live-qa-session`)} variant="outline" size="sm" className="h-9 hover:bg-slate-50 border-slate-200">
              Live QA Session
            </Button>
          </div>
        </div>
      ) : (
        /* MAIN VIEWS CONTROLLER */
        <div>
          {viewMode === "list" ? (
            /* 6. List View: Table/Card hybrid */
            <div className="border border-slate-100 rounded-2xl bg-card overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-slate-500/[0.02] text-[10px] uppercase text-muted-foreground/80 tracking-wider">
                      <th className="p-3 w-8">
                        <input
                          type="checkbox"
                          checked={bugs.length > 0 && selectedBugIds.length === bugs.length}
                          onChange={toggleSelectAll}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          title="Select all"
                        />
                      </th>
                      <th className="p-3 font-extrabold">Bug ID / Title</th>
                      <th className="p-3 font-extrabold">Severity</th>
                      <th className="p-3 font-extrabold">Priority</th>
                      <th className="p-3 font-extrabold">Status</th>
                      <th className="p-3 font-extrabold">Scope / Links</th>
                      <th className="p-3 font-extrabold">Created Date</th>
                      <th className="p-3 font-extrabold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700">
                    {bugs.map((b) => {
                      const isAuto = b.testRunId !== null
                      return (
                        <tr 
                          key={b.id} 
                          className={`hover:bg-slate-50/50 cursor-pointer transition-colors ${selectedBugIds.includes(b.id) ? "bg-indigo-50/40" : ""}`}
                          onClick={() => handleOpenDetail(b.id)}
                        >
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedBugIds.includes(b.id)}
                              onChange={() => toggleBugSelection(b.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 space-y-1 max-w-sm">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-extrabold">
                                {b.bugKey || "BUG"}
                              </span>
                              <span className="font-extrabold text-slate-800 truncate block hover:text-indigo-600 transition-colors" title={b.title}>
                                {b.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[9px] text-slate-450 font-medium">
                              <span>Env: {b.environment || "Staging"}</span>
                              <span>&bull;</span>
                              <span>Browser: {b.browser || "Chromium"}</span>
                              {b.screenshotPath && (
                                <>
                                  <span>&bull;</span>
                                  <span className="text-indigo-600 font-bold flex items-center gap-0.5">
                                    <Eye className="h-3 w-3" /> Screenshot
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[8px] ${
                              b.severity === "Critical" ? "bg-red-100 text-red-700" :
                              b.severity === "High" ? "bg-orange-100 text-orange-700" :
                              b.severity === "Medium" ? "bg-blue-100 text-blue-700" :
                              "bg-slate-100 text-slate-600"
                            }`}>
                              {b.severity}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-slate-650 font-bold">{b.priority}</span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[8px] ${
                              b.status === "Open" ? "bg-amber-100 text-amber-700" :
                              b.status === "InProgress" ? "bg-blue-100 text-blue-750" :
                              b.status === "Resolved" || b.status === "Closed" ? "bg-emerald-100 text-emerald-700" :
                              "bg-slate-100 text-slate-500"
                            }`}>
                              {b.status}
                            </span>
                          </td>
                          <td className="p-3 space-y-0.5 max-w-[200px]">
                            {b.testCase && (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 truncate">
                                <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                <span className="truncate">{b.testCase.title}</span>
                              </div>
                            )}
                            {b.testRun && (
                              <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono">
                                <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                                <span className="truncate">RUN-{b.testRun.id.slice(0, 8)}</span>
                              </div>
                            )}
                            {!b.testCase && !b.testRun && (
                              <span className="text-[10px] text-slate-400 italic">No execution link</span>
                            )}
                          </td>
                          <td className="p-3 text-[10px] font-medium text-slate-450">
                            {new Date(b.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleOpenDetail(b.id)}
                                className="h-7 w-7 p-0"
                                title="View Details"
                              >
                                <Eye className="h-4 w-4 text-slate-600" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleSyncToOpenProject(b.id)}
                                className="h-7 w-7 p-0"
                                title="Sync with OpenProject"
                              >
                                <RefreshCw className="h-4 w-4 text-indigo-650" />
                              </Button>
                              {b.testCaseId && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => handleTriggerRetest(b.id)}
                                  className="h-7 w-7 p-0 hover:text-indigo-700"
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
                                title="Delete Bug"
                              >
                                <Trash2 className="h-4 w-4 text-slate-450 hover:text-rose-600" />
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
            /* 15. Board View (Kanban) */
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-start">
              {[
                { key: "Open", label: "Open", color: "border-amber-400" },
                { key: "InProgress", label: "In Progress", color: "border-blue-400" },
                { key: "ReadyForRetest", label: "Retesting", color: "border-purple-400" },
                { key: "Resolved", label: "Resolved", color: "border-emerald-400" },
                { key: "Duplicate", label: "Duplicate", color: "border-slate-300" },
                { key: "Closed", label: "Closed", color: "border-slate-400" }
              ].map((col) => {
                const colBugs = bugs.filter(b => b.status === col.key)
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
                      if (draggedBugId) handleChangeBugStatus(draggedBugId, col.key)
                      setDraggedBugId(null)
                      setDragOverStatus(null)
                    }}
                    className={`p-3 border rounded-2xl shadow-sm space-y-3 min-h-[300px] transition-all ${
                      isDropTarget ? "bg-indigo-50/50 border-indigo-300 ring-2 ring-indigo-200" : "bg-card/65"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b pb-2 select-none">
                      <span className="font-extrabold text-slate-800 text-[10px] uppercase flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full bg-slate-500 border-2 ${col.color}`}></span>
                        {col.label}
                      </span>
                      <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold">
                        {colBugs.length}
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                      {colBugs.length === 0 ? (
                        <div className="text-center py-8 text-[10px] text-slate-400 italic">No defects</div>
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
                            className={`p-3 border rounded-xl bg-card hover:bg-slate-50/50 hover:border-slate-300 cursor-grab active:cursor-grabbing shadow-sm space-y-2 transition-all ${
                              draggedBugId === bug.id ? "opacity-40" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between font-mono text-[9px] text-slate-400 font-extrabold">
                              <span>{bug.bugKey || "BUG"}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase ${
                                bug.severity === "Critical" ? "bg-red-50 text-red-650" : "bg-slate-100 text-slate-600"
                              }`}>
                                {bug.severity}
                              </span>
                            </div>

                            <span className="font-bold text-slate-800 line-clamp-2 leading-tight block">
                              {bug.title}
                            </span>

                            {bug.testCase && (
                              <div className="text-[9px] text-slate-500 font-semibold bg-slate-50 p-1.5 rounded truncate">
                                Tc: {bug.testCase.title}
                              </div>
                            )}

                            <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1 border-t">
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
          )}
        </div>
      )}

      {/* 7. Unified Right Slide-over Detail Drawer */}
      {selectedBugId && selectedBug && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[600px] bg-background h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300 select-none text-xs font-semibold">
            
            {/* Header info */}
            <div className="p-5 border-b flex items-center justify-between bg-slate-500/[0.01]">
              <div className="space-y-1">
                <span className="font-mono text-[9px] font-extrabold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                  {selectedBug.bugKey || "BUG-DETAIL"}
                </span>
                {isEditingTitle ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input 
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      className="h-8 text-xs font-extrabold"
                    />
                    <Button 
                      size="sm" 
                      onClick={() => {
                        setIsEditingTitle(false)
                        handleInlineUpdate({ title: editTitleValue })
                      }}
                      className="h-8 bg-indigo-600 text-white font-bold"
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <h3 
                    onClick={() => setIsEditingTitle(true)}
                    className="font-extrabold text-sm text-slate-800 hover:bg-slate-50 p-1 rounded cursor-pointer flex items-center gap-1.5"
                  >
                    {selectedBug.title}
                  </h3>
                )}
              </div>
              <button 
                onClick={() => setSelectedBugId(null)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab switch row */}
            <div className="flex border-b bg-slate-500/[0.01] px-4 gap-4">
              {[
                { id: "overview", label: "Overview" },
                { id: "evidence", label: "Evidence" },
                { id: "steps", label: "Steps" },
                { id: "test", label: "Linked Run" },
                { id: "activity", label: "Activity Logs" },
                { id: "openproject", label: "OpenProject" }
              ].map((tab) => {
                const isActive = activeDetailTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDetailTab(tab.id as TabType)}
                    className={`pb-2.5 pt-3 px-1 border-b-2 text-xs font-bold transition-all ${
                      isActive ? "border-indigo-650 text-indigo-650" : "border-transparent text-muted-foreground hover:text-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Tab contents scroll pane */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* Tab 1: OVERVIEW */}
              {activeDetailTab === "overview" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-slate-500 text-[10px] uppercase block">Severity</Label>
                      <select 
                        value={selectedBug.severity}
                        onChange={(e) => handleInlineUpdate({ severity: e.target.value as any })}
                        className="h-8 w-full border bg-background rounded-lg px-2"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-slate-500 text-[10px] uppercase block">Priority</Label>
                      <select 
                        value={selectedBug.priority}
                        onChange={(e) => handleInlineUpdate({ priority: e.target.value as any })}
                        className="h-8 w-full border bg-background rounded-lg px-2"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-slate-500 text-[10px] uppercase block">Status Phase</Label>
                      <select 
                        value={selectedBug.status}
                        onChange={(e) => handleInlineUpdate({ status: e.target.value as any })}
                        className="h-8 w-full border bg-background rounded-lg px-2 font-bold"
                      >
                        <option value="Open">Open</option>
                        <option value="InProgress">In Progress</option>
                        <option value="ReadyForRetest">Ready for Retest</option>
                        <option value="Reopened">Reopened</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Duplicate">Duplicate</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-slate-500 text-[10px] uppercase block">Resolution</Label>
                      <select
                        value={selectedBug.resolution || ""}
                        onChange={(e) => handleInlineUpdate({ resolution: (e.target.value || null) as BugReport["resolution"] })}
                        className="h-8 w-full border bg-background rounded-lg px-2 font-bold"
                      >
                        <option value="">— Unresolved —</option>
                        <option value="Fixed">Fixed</option>
                        <option value="WontFix">Won&apos;t Fix</option>
                        <option value="CannotReproduce">Cannot Reproduce</option>
                        <option value="Duplicate">Duplicate</option>
                        <option value="ByDesign">By Design</option>
                      </select>
                      {selectedBug.resolution && (
                        <Input
                          value={editResolutionNoteValue}
                          onChange={(e) => setEditResolutionNoteValue(e.target.value)}
                          onBlur={() => {
                            if (editResolutionNoteValue !== (selectedBug.resolutionNote || "")) {
                              handleInlineUpdate({ resolutionNote: editResolutionNoteValue })
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                          placeholder="Resolution note (optional)…"
                          className="h-8 bg-background mt-1"
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-slate-500 text-[10px] uppercase block">Reporter</Label>
                      <div className="h-8 flex items-center px-2 rounded-lg border bg-slate-50 text-xs font-semibold text-slate-600">
                        {selectedBug.reporter?.name || selectedBug.reporter?.email || "—"}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-slate-500 text-[10px] uppercase block">Tags</Label>
                      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-lg border bg-background min-h-8">
                        {(selectedBug.tags || []).map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                            {t}
                            <button
                              type="button"
                              onClick={() => handleInlineUpdate({ tags: (selectedBug.tags || []).filter((x) => x !== t) })}
                              className="hover:text-indigo-900"
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
                          placeholder={(selectedBug.tags || []).length ? "Add…" : "Add tag + Enter"}
                          className="flex-1 min-w-[70px] bg-transparent outline-none text-xs font-semibold"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-slate-500 text-[10px] uppercase block">Assigned Developer</Label>
                      {opMembers.length > 0 ? (
                        <select
                          value={selectedBug.assignedTo || ""}
                          onChange={(e) => handleInlineUpdate({ assignedTo: e.target.value })}
                          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {/* Preserve any legacy free-text value that isn't a known member */}
                          {selectedBug.assignedTo &&
                            !opMembers.some(m => m.id === selectedBug.assignedTo) && (
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
                          placeholder="Developer email..."
                          className="h-8 bg-background"
                        />
                      )}
                    </div>

                    {/* Bug Source — options pulled from an OpenProject list field */}
                    {opSourceOptions.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-slate-500 text-[10px] uppercase block">Bug Source</Label>
                        <select
                          value={selectedBug.source || ""}
                          onChange={(e) => handleInlineUpdate({ source: e.target.value } as any)}
                          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                        >
                          <option value="">— Select source —</option>
                          {/* Preserve any stored value not in the current option list */}
                          {selectedBug.source && !opSourceOptions.includes(selectedBug.source) && (
                            <option value={selectedBug.source}>{selectedBug.source}</option>
                          )}
                          {opSourceOptions.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-slate-500 text-[10px] uppercase block">Parent Task (OpenProject WP ID)</Label>
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
                        className="h-8 bg-background"
                      />
                      <p className="text-[9px] text-slate-400">Synced bug will be nested under this work package.</p>
                    </div>

                    {opBoards.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-slate-500 text-[10px] uppercase block">Target Board</Label>
                        <select
                          value={editBoardValue}
                          onChange={(e) => {
                            const boardId = e.target.value
                            // Update the dropdown instantly, clear the column, load the
                            // new board's columns, then persist in the background.
                            setEditBoardValue(boardId)
                            setEditColumnValue("")
                            loadBoardColumns(boardId)
                            handleInlineUpdate({ openProjectBoardId: boardId, openProjectBoardColumnId: "" })
                          }}
                          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                        >
                          <option value="">No board</option>
                          {opBoards.map(b => (
                            <option key={b.id} value={String(b.id)}>
                              {b.name}{b.type ? ` (${b.type})` : ""}
                            </option>
                          ))}
                        </select>
                        <p className="text-[9px] text-slate-400">Synced bug will be placed on this board.</p>
                      </div>
                    )}

                    {/* Column selector — appears once a board is chosen (#4) */}
                    {opBoards.length > 0 && editBoardValue && (
                      <div className="space-y-1">
                        <Label className="text-slate-500 text-[10px] uppercase block">Board Column</Label>
                        <select
                          value={editColumnValue}
                          onChange={(e) => {
                            setEditColumnValue(e.target.value)
                            handleInlineUpdate({ openProjectBoardColumnId: e.target.value })
                          }}
                          disabled={loadingColumns}
                          className="h-8 w-full rounded-md border bg-background px-2 text-xs disabled:opacity-60"
                        >
                          <option value="">
                            {loadingColumns ? "Loading columns..." : "First column (default)"}
                          </option>
                          {opBoardColumns.map(c => (
                            <option key={c.widgetId} value={String(c.widgetId)}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-[9px] text-slate-400">Synced bug will be placed under this column.</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4 space-y-1.5">
                    <Label className="text-slate-500 text-[10px] uppercase block">Description / Action details</Label>
                    {isEditingDesc ? (
                      <div className="space-y-2">
                        <textarea 
                          value={editDescValue}
                          onChange={(e) => setEditDescValue(e.target.value)}
                          rows={4}
                          className="w-full border rounded-lg p-2 bg-background font-semibold text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => {
                              setIsEditingDesc(false)
                              handleInlineUpdate({ stepsToReproduce: editDescValue })
                            }}
                            className="bg-indigo-600 text-white font-bold"
                          >
                            Save description
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setIsEditingDesc(false)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <p 
                        onClick={() => setIsEditingDesc(true)}
                        className="bg-slate-500/[0.01] hover:bg-slate-50 border p-3 rounded-xl whitespace-pre-wrap leading-relaxed cursor-pointer font-medium"
                      >
                        {selectedBug.stepsToReproduce || "No description provided. Click to add details."}
                      </p>
                    )}
                  </div>

                  <div className="border-t pt-4 grid grid-cols-2 gap-y-3.5 gap-x-2 text-[11px] font-medium text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Environment</span>
                      <span>{selectedBug.environment || "Staging"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Browser Type</span>
                      <span>{selectedBug.browser || "Chromium"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Viewport Scale</span>
                      <span>{selectedBug.viewport || "Desktop (1280x800)"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Created At</span>
                      <span>{new Date(selectedBug.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: EVIDENCE */}
              {activeDetailTab === "evidence" && (
                <div className="space-y-4">
                  {/* Screenshots preview */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-550 text-[10px] uppercase">Screenshot attachment</Label>
                      <label className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border bg-indigo-50 text-indigo-650 font-bold text-[10px] cursor-pointer hover:bg-indigo-100 transition-colors ${uploadingPhoto ? "opacity-60 pointer-events-none" : ""}`}>
                        <Paperclip className="h-3.5 w-3.5" />
                        {uploadingPhoto ? "Uploading..." : "Upload Photo"}
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
                      <div className="border rounded-2xl overflow-hidden shadow-sm">
                        <img
                          src={assetUrl(selectedBug.screenshotPath)!}
                          alt="Bug Screenshot Evidence"
                          className="max-h-[300px] w-full object-contain bg-slate-100 hover:scale-[1.02] transition-transform cursor-pointer"
                          onClick={() => window.open(assetUrl(selectedBug.screenshotPath)!, "_blank")}
                        />
                      </div>
                    ) : (
                      <div className="p-8 border border-dashed rounded-2xl text-center text-slate-400 italic">
                        No screenshots attached to this defect.
                      </div>
                    )}
                  </div>

                  {/* Video player for screen records */}
                  <div className="space-y-1 border-t pt-3">
                    <Label className="text-slate-550 text-[10px] uppercase">Web Video Recording (Session play)</Label>
                    {selectedBug.videoUrl ? (
                      <div className="border rounded-2xl overflow-hidden shadow-sm bg-black">
                        <video
                          src={assetUrl(selectedBug.videoUrl)!}
                          controls
                          className="w-full max-h-[300px]"
                        />
                      </div>
                    ) : (
                      <div className="p-8 border border-dashed rounded-2xl text-center text-slate-400 italic">
                        No video logs linked to this defect.
                      </div>
                    )}
                  </div>

                  {/* Logs tabs */}
                  <div className="space-y-2 border-t pt-3">
                    <span className="text-[10px] text-slate-500 uppercase block">Console logs output</span>
                    {selectedBug.consoleLogs ? (
                      <pre className="p-3 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[9px] overflow-x-auto max-h-[150px] whitespace-pre-wrap select-all">
                        {selectedBug.consoleLogs}
                      </pre>
                    ) : (
                      <p className="text-[10px] italic text-slate-400 pl-1">No console logs output recorded.</p>
                    )}

                    <span className="text-[10px] text-slate-500 uppercase block mt-2">Network Errors Logs</span>
                    {selectedBug.networkErrors ? (
                      <pre className="p-3 rounded-xl bg-slate-900 text-rose-450 font-mono text-[9px] overflow-x-auto max-h-[150px] whitespace-pre-wrap select-all">
                        {selectedBug.networkErrors}
                      </pre>
                    ) : (
                      <p className="text-[10px] italic text-slate-400 pl-1">No network errors logs recorded.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: REPRODUCTION STEPS */}
              {activeDetailTab === "steps" && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500 uppercase block">Expected Result</span>
                    <textarea
                      value={editExpectedValue}
                      onChange={(e) => setEditExpectedValue(e.target.value)}
                      onBlur={() => {
                        if (editExpectedValue !== (selectedBug.expectedResult || "")) {
                          handleInlineUpdate({ expectedResult: editExpectedValue })
                        }
                      }}
                      rows={3}
                      placeholder="What should happen..."
                      className="w-full p-2.5 rounded-lg border bg-slate-50 leading-relaxed font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1 border-t pt-3">
                    <span className="text-[10px] text-slate-500 uppercase block">Actual Result</span>
                    <textarea
                      value={editActualValue}
                      onChange={(e) => setEditActualValue(e.target.value)}
                      onBlur={() => {
                        if (editActualValue !== (selectedBug.actualResult || "")) {
                          handleInlineUpdate({ actualResult: editActualValue })
                        }
                      }}
                      rows={3}
                      placeholder="What happened instead..."
                      className="w-full p-2.5 rounded-lg border border-rose-100 bg-rose-50/50 leading-relaxed font-bold text-rose-700 outline-none focus:ring-1 focus:ring-rose-400"
                    />
                  </div>
                </div>
              )}

              {/* Tab 4: LINKED TEST / RUN */}
              {activeDetailTab === "test" && (
                <div className="space-y-4">
                  {selectedBug.testCase ? (
                    <div className="p-4 border border-slate-100 bg-slate-500/[0.01] rounded-2xl space-y-3.5 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5">
                          <span className="text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground/60">Linked TestCase</span>
                          <h4 className="font-extrabold text-slate-800">{selectedBug.testCase.title}</h4>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => router.push(`/projects/${projectId}/test-cases`)}
                          className="h-7 bg-indigo-600 text-white font-bold"
                        >
                          Open Case
                        </Button>
                      </div>

                      {selectedBug.testRun && (
                        <div className="border-t pt-3 space-y-2">
                          <div className="flex justify-between items-center text-[10px] text-slate-650 font-bold">
                            <span>Test Run Reference</span>
                            <span className="font-mono text-[9px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">RUN-{selectedBug.testRun.id.slice(0, 8)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-slate-650 font-bold">
                            <span>Status</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                              selectedBug.testRun.status === "Passed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            }`}>{selectedBug.testRun.status}</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="border-t pt-3 flex gap-2">
                        <Button 
                          onClick={() => handleTriggerRetest(selectedBug.id)}
                          className="h-8 px-3 bg-indigo-650 text-white font-bold w-full flex items-center justify-center gap-1"
                        >
                          <Play className="h-4 w-4" /> Trigger Retest Run
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-8 border border-dashed rounded-2xl text-center text-slate-400 italic">
                        This defect report is not linked to any test cases.
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-500 text-[10px] uppercase">Link TestCase ID</Label>
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
                  <div className="p-4 border border-slate-100 rounded-2xl space-y-3 shadow-sm">
                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-muted-foreground/60 block">
                      Linked User Stories ({linkedStoryIds.length})
                    </span>
                    {(((selectedBug as any).requirements) || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {((selectedBug as any).requirements as any[]).map((l) => l.requirement && (
                          <OpenOnBoardLink key={l.requirementId || l.requirement.id} projectId={projectId} requirementId={l.requirementId || l.requirement.id} requirementKey={l.requirement.requirementKey} />
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
                    <div className="p-3.5 border border-dashed rounded-2xl bg-slate-50 space-y-2.5">
                      <span className="font-bold text-[10px] uppercase tracking-wider text-slate-600 block">Link as Duplicate defect</span>
                      <div className="flex gap-2">
                        <select 
                          value={duplicateTargetId} 
                          onChange={(e) => setDuplicateTargetId(e.target.value)}
                          className="h-8 flex-1 rounded border bg-background text-[11px] font-semibold px-2 outline-none"
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
                          className="h-8 bg-slate-800 text-white font-bold"
                        >
                          Link Duplicate
                        </Button>
                      </div>
                    </div>
                  )}

                  <span className="text-[10px] text-slate-500 uppercase block select-none">Audit log activities ({selectedBug.activities.length})</span>
                  {selectedBug.activities.length === 0 ? (
                    <p className="text-[10px] italic text-slate-400">No activity logged.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedBug.activities.map((act) => (
                        <div key={act.id} className="p-2.5 border rounded-xl bg-slate-50/50 space-y-1 text-[11px] font-medium leading-relaxed">
                          <div className="flex justify-between items-center text-slate-600 font-bold">
                            <span className="text-indigo-650">{act.action}</span>
                            <span className="text-[9px] text-slate-400 font-normal">{new Date(act.createdAt).toLocaleDateString()} {new Date(act.createdAt).toLocaleTimeString()}</span>
                          </div>
                          {act.details && <p className="text-slate-500 text-[10px]">{act.details}</p>}
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
                    <div className="p-4 border rounded-2xl bg-amber-50/40 border-amber-100 space-y-3">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 block">
                        Required Bug Fields (OpenProject)
                      </span>
                      {opBugFields.map(f => {
                        const kind = f.isFormattable ? "formattable" : f.isLink ? (f.isMulti ? "link-multi" : "link-single") : "text"
                        const current = editCustomFields[f.key]?.value
                        return (
                          <div key={f.key} className="space-y-1">
                            <Label className="text-slate-500 text-[10px] uppercase block">
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
                      <p className="text-[9px] text-slate-400">Required by the OpenProject bug type — sent when you sync.</p>
                    </div>
                  )}

                  {opSyncStatus ? (
                    <div className="p-4 border rounded-2xl bg-slate-50/50 space-y-3.5">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500">Sync status</span>
                        <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[8px] ${
                          opSyncStatus.status === "Synced" ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-650"
                        }`}>{opSyncStatus.status}</span>
                      </div>

                      {opSyncStatus.externalId && (
                        <div className="flex justify-between items-center text-[11px] font-bold">
                          <span className="text-slate-550">Work Package ID</span>
                          <span className="font-mono text-slate-800">#{opSyncStatus.externalId}</span>
                        </div>
                      )}

                      {opSyncStatus.externalUrl && (
                        <div className="pt-2 border-t flex justify-end">
                          <a 
                            href={opSyncStatus.externalUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-xs font-bold text-indigo-650 flex items-center gap-1 hover:underline"
                          >
                            View in OpenProject <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      )}

                      <div className="pt-2 border-t space-y-1.5">
                        <Button
                          onClick={() => handleSyncToOpenProject(selectedBug.id, {
                            parentId: editParentValue,
                            boardId: editBoardValue,
                            boardColumnId: editColumnValue,
                            customFields: editCustomFields
                          })}
                          disabled={syncingOP}
                          className="h-8 px-4 bg-indigo-600 text-white font-bold w-full"
                        >
                          {syncingOP ? "Syncing..." : "Sync / Update Mapped Ticket"}
                        </Button>
                        <p className="text-[9px] text-slate-400 text-center">
                          Uses the Parent / Board / Column set in the Overview tab.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 border border-dashed rounded-2xl text-center text-slate-400 italic">
                      OpenProject integrations connection is disabled for active project. Check Settings.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer deletion */}
            <div className="p-4 border-t bg-slate-500/[0.01] flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Updated {new Date(selectedBug.updatedAt).toLocaleDateString()}</span>
              <Button 
                onClick={() => handleDeleteBug(selectedBug.id)}
                variant="destructive" 
                size="sm"
                className="bg-red-600 text-white font-bold flex items-center gap-1 shadow-sm"
              >
                <Trash2 className="h-4 w-4" /> Delete Defect
              </Button>
            </div>
          </div>
        </div>
      )}

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

    </div>
  )
}
