"use client"

import { useEffect, useState, Fragment } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/ui/back-button"
import {
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  Eye,
  Trash2,
  Sparkles,
  Link as LinkIcon,
  Video,
  Play,
  Layers,
  HelpCircle,
  AlertTriangle,
  CheckCircle,
  FileText,
  VideoOff,
  Clock,
  Compass,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Loader2,
  CloudUpload,
  CloudDownload,
  ListOrdered,
  ListTree,
  Rows3,
  Pencil,
  FolderKanban,
  X
} from "lucide-react"
import { ImportRequirementsModal } from "@/components/requirements/import-modal"
import { HierarchySelector } from "@/components/hierarchy/hierarchy-selector"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface Epic {
  id: string
  epicKey: string
  title: string
  description: string | null
  priority: string
  status: string
  orderIndex: number
  _count?: { requirements: number }
}

interface Requirement {
  id: string
  requirementKey: string
  title: string
  description: string | null
  acceptanceCriteria: string | null
  priority: string
  status: string
  source: string
  epicId: string | null
  epic: { id: string; epicKey: string; title: string } | null
  moduleId: string | null
  featureId: string | null
  componentId: string | null
  module: { id: string; name: string } | null
  feature: { id: string; name: string } | null
  component: { id: string; name: string } | null
  figmaUrl: string | null
  externalUrl: string | null
  externalSystem: string | null
  testCases: Array<{
    testCaseId: string
    testCase: {
      id: string
      title: string
      bugReports?: Array<{ id: string; bugKey: string | null; title: string; severity: string; status: string }>
    }
  }>
  bugReports: Array<{ bugReport: { id: string; title: string; severity: string } }>
  computedCoverage: "Uncovered" | "PartiallyCovered" | "Covered" | "Failed" | "Blocked" | "NotExecuted"
  openBugsCount: number
  openProjectSyncStatus: "Synced" | "Failed" | "NotSynced"
  openProjectWorkPackageUrl: string | null
}

interface CoverageStats {
  total: number
  covered: number
  partiallyCovered: number
  uncovered: number
  failed: number
  blocked: number
  notExecuted: number
  coveragePercentage: number
  requirementsWithBugs: number
}

export default function RequirementsDashboard() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [stats, setStats] = useState<CoverageStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Modals & triggers
  const [showImportModal, setShowImportModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [selectedReq, setSelectedReq] = useState<Requirement | null>(null)
  const [requirementToDelete, setRequirementToDelete] = useState<string | null>(null)

  // Epic hierarchy
  const [epics, setEpics] = useState<Epic[]>([])
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree")
  const [collapsedEpicIds, setCollapsedEpicIds] = useState<Set<string>>(new Set())
  const [showEpicModal, setShowEpicModal] = useState(false)
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null)
  const [epicForm, setEpicForm] = useState({ epicKey: "", title: "", description: "", priority: "Medium", status: "Active" })
  const [savingEpic, setSavingEpic] = useState(false)
  const [epicToDelete, setEpicToDelete] = useState<Epic | null>(null)
  const [epicDeleteMode, setEpicDeleteMode] = useState<"unlink" | "delete">("unlink")
  const [deletingEpic, setDeletingEpic] = useState(false)
  const [epicFilter, setEpicFilter] = useState("ALL") // ALL | NONE | <epicId>

  // Bulk selection & actions
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [bulkWorking, setBulkWorking] = useState(false)

  // Create Form states
  const [newReqKey, setNewReqKey] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [newCriteria, setNewCriteria] = useState("")
  const [newPriority, setNewPriority] = useState("Medium")
  const [newStatus, setNewStatus] = useState("Draft")
  const [newFigmaUrl, setNewFigmaUrl] = useState("")
  const [newExternalUrl, setNewExternalUrl] = useState("")
  const [newExternalSystem, setNewExternalSystem] = useState("Jira")
  const [newModuleId, setNewModuleId] = useState("")
  const [newFeatureId, setNewFeatureId] = useState("")
  const [newComponentId, setNewComponentId] = useState("")
  const [newEpicId, setNewEpicId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // OpenProject story sync
  const [syncingReqId, setSyncingReqId] = useState<string | null>(null)
  const [importingStories, setImportingStories] = useState(false)

  const handleSyncStory = async (reqId: string) => {
    setSyncingReqId(reqId)
    try {
      const res = await fetch(`/api/requirements/${reqId}/sync/openproject`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        fetchRequirementsData()
      } else {
        alert(data.error || "Story sync to OpenProject failed")
      }
    } catch {
      alert("Network error during story sync")
    } finally {
      setSyncingReqId(null)
    }
  }

  const handleImportStories = async () => {
    setImportingStories(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/import-stories`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        alert(`OpenProject import: ${data.imported} new, ${data.updated} updated${data.skipped ? `, ${data.skipped} skipped` : ""} (of ${data.total} found)`)
        fetchRequirementsData()
      } else {
        alert(data.error || "Import from OpenProject failed")
      }
    } catch {
      alert("Network error during import")
    } finally {
      setImportingStories(false)
    }
  }

  // Traceability: which requirement rows are expanded to show cases → bugs
  const [expandedReqIds, setExpandedReqIds] = useState<Set<string>>(new Set())
  const toggleExpanded = (id: string) =>
    setExpandedReqIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Link cases states
  const [availableTestCases, setAvailableTestCases] = useState<any[]>([])
  const [selectedCaseIdsToLink, setSelectedCaseIdsToLink] = useState<string[]>([])
  const [linking, setLinking] = useState(false)
  // Picker search/filters
  const [linkSearch, setLinkSearch] = useState("")
  const [linkModuleFilter, setLinkModuleFilter] = useState("ALL")
  const [linkPriorityFilter, setLinkPriorityFilter] = useState("ALL")
  const [linkExecFilter, setLinkExecFilter] = useState("ALL")
  const [linkUnlinkedOnly, setLinkUnlinkedOnly] = useState(false)

  // Filters
  const [search, setSearch] = useState("")
  const [modFilter, setModFilter] = useState("ALL")
  const [priorityFilter, setPriorityFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [coverageFilter, setCoverageFilter] = useState("ALL")
  const [sourceFilter, setSourceFilter] = useState("ALL")
  const [casesFilter, setCasesFilter] = useState("ALL") // ALL, WITH_CASES, NO_CASES
  const [bugsFilter, setBugsFilter] = useState("ALL") // ALL, WITH_BUGS, NO_BUGS

  // Hierarchy for filters
  const [projectModules, setProjectModules] = useState<any[]>([])

  useEffect(() => {
    fetchRequirementsData()
    fetchStatsData()
    fetchModules()
    fetchEpics()
  }, [projectId])

  const fetchEpics = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/epics`)
      if (res.ok) {
        const data = await res.json()
        setEpics(data.epics || [])
      }
    } catch {}
  }

  const fetchRequirementsData = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/requirements`)
      if (res.ok) {
        const data = await res.json()
        setRequirements(data.requirements || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  const fetchStatsData = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/coverage-summary`)
      if (res.ok) {
        const data = await res.json()
        setStats(data.summary)
      }
    } catch {}
  }

  const fetchModules = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/modules`)
      if (res.ok) {
        const data = await res.json()
        setProjectModules(data.modules || [])
      }
    } catch {}
  }

  const handleCreateRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReqKey.trim() || !newTitle.trim()) return
    setSubmitting(true)

    try {
      const res = await fetch(`/api/projects/${projectId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirementKey: newReqKey.trim(),
          title: newTitle.trim(),
          description: newDesc,
          acceptanceCriteria: newCriteria,
          priority: newPriority,
          status: newStatus,
          epicId: newEpicId || null,
          moduleId: newModuleId || null,
          featureId: newFeatureId || null,
          componentId: newComponentId || null,
          figmaUrl: newFigmaUrl,
          externalUrl: newExternalUrl,
          externalSystem: newExternalSystem
        })
      })

      if (res.ok) {
        setShowCreateModal(false)
        setNewReqKey("")
        setNewTitle("")
        setNewDesc("")
        setNewCriteria("")
        setNewFigmaUrl("")
        setNewExternalUrl("")
        setNewModuleId("")
        setNewFeatureId("")
        setNewComponentId("")
        setNewEpicId("")
        fetchRequirementsData()
        fetchStatsData()
        fetchEpics()
      } else {
        const err = await res.json()
        alert(err.error || "Failed to create requirement")
      }
    } catch {
      alert("Network error creating requirement")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Epic CRUD ──────────────────────────────────────────────────────────────

  const openCreateEpicModal = () => {
    setEditingEpic(null)
    setEpicForm({ epicKey: "", title: "", description: "", priority: "Medium", status: "Active" })
    setShowEpicModal(true)
  }

  const openEditEpicModal = (epic: Epic) => {
    setEditingEpic(epic)
    setEpicForm({
      epicKey: epic.epicKey,
      title: epic.title,
      description: epic.description || "",
      priority: epic.priority,
      status: epic.status
    })
    setShowEpicModal(true)
  }

  const handleSaveEpic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!epicForm.title.trim()) return
    setSavingEpic(true)
    try {
      const res = await fetch(
        editingEpic ? `/api/epics/${editingEpic.id}` : `/api/projects/${projectId}/epics`,
        {
          method: editingEpic ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            epicKey: epicForm.epicKey.trim() || undefined,
            title: epicForm.title.trim(),
            description: epicForm.description || null,
            priority: epicForm.priority,
            status: epicForm.status
          })
        }
      )
      if (res.ok) {
        setShowEpicModal(false)
        fetchEpics()
        fetchRequirementsData()
      } else {
        const err = await res.json()
        alert(err.error || "Failed to save epic")
      }
    } catch {
      alert("Network error saving epic")
    } finally {
      setSavingEpic(false)
    }
  }

  const confirmDeleteEpic = async () => {
    if (!epicToDelete) return
    setDeletingEpic(true)
    try {
      const res = await fetch(
        `/api/epics/${epicToDelete.id}${epicDeleteMode === "delete" ? "?deleteStories=true" : ""}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        setEpicToDelete(null)
        setEpicDeleteMode("unlink")
        setSelectedIds([])
        fetchEpics()
        fetchRequirementsData()
        fetchStatsData()
      } else {
        const err = await res.json()
        alert(err.error || "Failed to delete epic")
      }
    } catch {
      alert("Network error deleting epic")
    } finally {
      setDeletingEpic(false)
    }
  }

  // ── Bulk selection & actions (same pattern as the Test Cases page) ────────

  const toggleSelectReq = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleSelectAllVisible = (visible: Requirement[]) => {
    const visibleIds = visible.map((r) => r.id)
    const allSelected = visibleIds.every((id) => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  // Shared runner: fires the single-item endpoint per selected story and
  // reports a success/failure summary.
  const runBulk = async (
    run: (id: string) => Promise<Response>,
    label: string,
    clearSelection: boolean
  ) => {
    if (selectedIds.length === 0) return
    setBulkWorking(true)
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => run(id)))
      const succeeded = results.filter(
        (r) => r.status === "fulfilled" && r.value.ok
      ).length
      const failed = selectedIds.length - succeeded
      alert(failed === 0 ? `${succeeded} stor${succeeded === 1 ? "y" : "ies"} ${label}.` : `${succeeded} ${label}, ${failed} failed.`)
      if (clearSelection) setSelectedIds([])
      fetchRequirementsData()
      fetchStatsData()
      fetchEpics()
    } catch {
      alert(`Network error during bulk ${label}`)
    } finally {
      setBulkWorking(false)
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleteConfirmOpen(false)
    await runBulk(
      (id) => fetch(`/api/requirements/${id}`, { method: "DELETE" }),
      "deleted",
      true
    )
  }

  const handleBulkStatus = (status: string) =>
    runBulk(
      (id) =>
        fetch(`/api/requirements/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        }),
      "updated",
      false
    )

  const handleBulkPriority = (priority: string) =>
    runBulk(
      (id) =>
        fetch(`/api/requirements/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority })
        }),
      "updated",
      false
    )

  const handleBulkMoveToEpic = (epicId: string | null) =>
    runBulk(
      (id) =>
        fetch(`/api/requirements/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ epicId })
        }),
      "moved",
      false
    )

  const handleDeleteRequirement = (id: string) => {
    setRequirementToDelete(id)
  }

  const confirmDeleteRequirement = async () => {
    if (!requirementToDelete) return
    const res = await fetch(`/api/requirements/${requirementToDelete}`, { method: "DELETE" })
    if (!res.ok) {
      throw new Error("Failed to delete requirement")
    }
    setRequirementToDelete(null)
    fetchRequirementsData()
    fetchStatsData()
  }

  const openLinkTestCasesModal = async (req: Requirement) => {
    setSelectedReq(req)
    setSelectedCaseIdsToLink(req.testCases.map(tc => tc.testCaseId))
    setLinkSearch("")
    setLinkModuleFilter("ALL")
    setLinkPriorityFilter("ALL")
    setLinkExecFilter("ALL")
    setLinkUnlinkedOnly(false)
    setShowLinkModal(true)

    try {
      const res = await fetch(`/api/projects/${projectId}/test-cases`)
      if (res.ok) {
        const data = await res.json()
        setAvailableTestCases(data.testCases || [])
      }
    } catch {}
  }

  const handleLinkTestCases = async () => {
    if (!selectedReq) return
    setLinking(true)

    try {
      // Unlink removed ones
      const originalIds = selectedReq.testCases.map(tc => tc.testCaseId)
      const toUnlink = originalIds.filter(id => !selectedCaseIdsToLink.includes(id))
      const toLink = selectedCaseIdsToLink.filter(id => !originalIds.includes(id))

      if (toUnlink.length > 0) {
        await fetch(`/api/requirements/${selectedReq.id}/unlink-test-cases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testCaseIds: toUnlink })
        })
      }

      if (toLink.length > 0) {
        await fetch(`/api/requirements/${selectedReq.id}/link-test-cases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testCaseIds: toLink })
        })
      }

      setShowLinkModal(false)
      fetchRequirementsData()
      fetchStatsData()
    } catch {
      alert("Failed to update linked test cases")
    } finally {
      setLinking(false)
    }
  }

  // Filter logic
  const filteredRequirements = requirements.filter((req) => {
    const searchLower = search.toLowerCase()
    const matchSearch =
      req.requirementKey.toLowerCase().includes(searchLower) ||
      req.title.toLowerCase().includes(searchLower) ||
      (req.description && req.description.toLowerCase().includes(searchLower))

    if (!matchSearch) return false
    if (epicFilter === "NONE" && req.epicId !== null) return false
    if (epicFilter !== "ALL" && epicFilter !== "NONE" && req.epicId !== epicFilter) return false
    if (modFilter !== "ALL" && req.moduleId !== modFilter) return false
    if (priorityFilter !== "ALL" && req.priority !== priorityFilter) return false
    if (statusFilter !== "ALL" && req.status !== statusFilter) return false
    if (coverageFilter !== "ALL" && req.computedCoverage !== coverageFilter) return false
    if (sourceFilter !== "ALL" && req.source !== sourceFilter) return false

    if (casesFilter === "WITH_CASES" && req.testCases.length === 0) return false
    if (casesFilter === "NO_CASES" && req.testCases.length > 0) return false

    if (bugsFilter === "WITH_BUGS" && req.openBugsCount === 0) return false
    if (bugsFilter === "NO_BUGS" && req.openBugsCount > 0) return false

    return true
  })

  // Tree view grouping: epics in their configured order, then the No-Epic bucket
  const noEpicStories = filteredRequirements.filter((r) => !r.epicId)
  const storiesByEpic = new Map<string, Requirement[]>()
  filteredRequirements.forEach((r) => {
    if (!r.epicId) return
    const list = storiesByEpic.get(r.epicId) || []
    list.push(r)
    storiesByEpic.set(r.epicId, list)
  })

  const toggleEpicCollapsed = (id: string) =>
    setCollapsedEpicIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const epicRollup = (stories: Requirement[]) => {
    const covered = stories.filter((s) => s.computedCoverage === "Covered").length
    const cases = stories.reduce((sum, s) => sum + s.testCases.length, 0)
    return { covered, cases }
  }

  const colCount = viewMode === "flat" ? 12 : 11

  // Bulk-link picker: candidate test cases after search + filters
  const filteredPickerCases = availableTestCases.filter((tc) => {
    const q = linkSearch.toLowerCase()
    if (q && !tc.title?.toLowerCase().includes(q)) return false
    if (linkModuleFilter !== "ALL" && tc.moduleId !== linkModuleFilter) return false
    if (linkPriorityFilter !== "ALL" && tc.priority !== linkPriorityFilter) return false
    if (linkExecFilter !== "ALL" && tc.executionType !== linkExecFilter) return false
    if (linkUnlinkedOnly) {
      // Orphans only: cases linked to no story at all (a link to the current
      // story counts — unchecking it here is how you'd remove that link).
      const links = tc.requirements || []
      const linkedElsewhere = links.some((l: any) => l.requirementId !== selectedReq?.id)
      if (linkedElsewhere) return false
    }
    return true
  })

  const allPickerVisibleSelected =
    filteredPickerCases.length > 0 &&
    filteredPickerCases.every((tc) => selectedCaseIdsToLink.includes(tc.id))

  const togglePickerSelectAll = () => {
    const visibleIds = filteredPickerCases.map((tc) => tc.id)
    if (allPickerVisibleSelected) {
      setSelectedCaseIdsToLink((prev) => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelectedCaseIdsToLink((prev) => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  // One story row (+ its expandable traceability panel) — shared by both views
  const renderStoryRow = (req: Requirement) => {
    const linkedCases = req.testCases || []
    const traceBugs = linkedCases.flatMap((c) => c.testCase.bugReports || [])
    const isOpen = expandedReqIds.has(req.id)
    const isSelected = selectedIds.includes(req.id)
    return (
      <Fragment key={req.id}>
        <tr className={`transition-colors ${isSelected ? "bg-blue-50/40" : "hover:bg-slate-50/50"}`}>
          <td className="p-4 w-8">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelectReq(req.id)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </td>
          <td className={`p-4 font-bold text-slate-900 ${viewMode === "tree" ? "pl-8" : ""}`}>
            <button
              onClick={() => toggleExpanded(req.id)}
              className="inline-flex items-center gap-1.5 hover:text-blue-600 transition-colors"
              title="Show traceability (test cases & bugs)"
            >
              <ChevronRight
                size={14}
                className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              {req.requirementKey}
            </button>
          </td>
          <td className="p-4 max-w-xs truncate" title={req.title}>{req.title}</td>
          {viewMode === "flat" && (
            <td className="p-4 text-[11px]">
              {req.epic ? (
                <span className="bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-violet-100">
                  {req.epic.epicKey}
                </span>
              ) : (
                <span className="text-slate-300">-</span>
              )}
            </td>
          )}
          <td className="p-4 text-slate-400 text-[11px]">
            {req.module ? (
              <span>
                {req.module.name}
                {req.feature && ` / ${req.feature.name}`}
                {req.component && ` / ${req.component.name}`}
              </span>
            ) : (
              "Unassigned"
            )}
          </td>
          <td className="p-4">{getPriorityBadge(req.priority)}</td>
          <td className="p-4">{getStatusBadge(req.status)}</td>
          <td className="p-4">
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-blue-100">
              {req.testCases.length} case{req.testCases.length !== 1 && "s"}
            </span>
          </td>
          <td className="p-4">{getCoverageBadge(req.computedCoverage)}</td>
          <td className="p-4">
            {req.openBugsCount > 0 ? (
              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-red-100">
                {req.openBugsCount} active
              </span>
            ) : (
              <span className="text-slate-300">-</span>
            )}
          </td>
          <td className="p-4 text-slate-400">{req.source}</td>
          <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
            <Link href={`/projects/${projectId}/requirements/${req.id}`}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-slate-100 text-slate-500 rounded-lg">
                <Eye size={14} />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openLinkTestCasesModal(req)}
              className="h-7 w-7 p-0 hover:bg-slate-100 text-blue-600 rounded-lg"
              title="Link Test Cases"
            >
              <LinkIcon size={14} />
            </Button>
            {req.openProjectSyncStatus === "Synced" && req.openProjectWorkPackageUrl ? (
              <a href={req.openProjectWorkPackageUrl} target="_blank" rel="noreferrer">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-emerald-50 text-emerald-600 rounded-lg"
                  title="Synced — open in OpenProject"
                >
                  <CheckCircle size={14} />
                </Button>
              </a>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSyncStory(req.id)}
                disabled={syncingReqId === req.id}
                className={`h-7 w-7 p-0 hover:bg-slate-100 rounded-lg ${
                  req.openProjectSyncStatus === "Failed" ? "text-red-500" : "text-teal-600"
                }`}
                title={req.openProjectSyncStatus === "Failed" ? "Sync failed — retry" : "Sync story to OpenProject"}
              >
                {syncingReqId === req.id ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteRequirement(req.id)}
              className="h-7 w-7 p-0 hover:bg-slate-100 text-red-600 rounded-lg"
            >
              <Trash2 size={14} />
            </Button>
          </td>
        </tr>

        {isOpen && (
          <tr className="bg-slate-50/60">
            <td colSpan={colCount} className="px-6 pb-5 pt-1">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <Compass size={13} /> Traceability — Story → Test Cases → Bugs
                </div>

                {linkedCases.length === 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 border border-dashed border-slate-200 px-3 py-2.5">
                    <span className="text-xs text-slate-400">No test cases linked to this user story yet.</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openLinkTestCasesModal(req)}
                      className="h-7 border-blue-200 text-blue-700 hover:bg-blue-50 text-[11px] font-semibold"
                    >
                      <LinkIcon size={12} className="mr-1" /> Link Test Cases
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {linkedCases.map((c) => {
                      const bugs = c.testCase.bugReports || []
                      return (
                        <div key={c.testCaseId} className="rounded-lg border border-slate-100 bg-slate-50/40">
                          <div className="flex items-center justify-between gap-3 px-3 py-2">
                            <Link
                              href={`/projects/${projectId}/test-cases?caseId=${c.testCase.id}`}
                              className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-blue-600 truncate"
                              title={c.testCase.title}
                            >
                              <FileText size={13} className="text-blue-500 shrink-0" />
                              <span className="truncate">{c.testCase.title}</span>
                            </Link>
                            {bugs.length > 0 ? (
                              <span className="shrink-0 bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-red-100">
                                {bugs.length} bug{bugs.length !== 1 && "s"}
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] font-semibold text-emerald-600">No bugs</span>
                            )}
                          </div>
                          {bugs.length > 0 && (
                            <div className="border-t border-slate-100 px-3 py-2 space-y-1.5">
                              {bugs.map((bug) => (
                                <Link
                                  key={bug.id}
                                  href={`/projects/${projectId}/bug-reports?bugId=${bug.id}`}
                                  className="flex items-center gap-2 text-[11px] text-slate-600 hover:text-red-600"
                                >
                                  <AlertTriangle size={11} className="text-red-400 shrink-0" />
                                  <span className="font-bold text-slate-500">{bug.bugKey || "BUG"}</span>
                                  <span className="truncate flex-1" title={bug.title}>{bug.title}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    bug.severity === "Critical" ? "bg-red-100 text-red-700" :
                                    bug.severity === "High" ? "bg-orange-100 text-orange-700" :
                                    bug.severity === "Medium" ? "bg-amber-100 text-amber-700" :
                                    "bg-slate-100 text-slate-500"
                                  }`}>{bug.severity}</span>
                                  <span className="text-[9px] font-semibold text-slate-400 w-16 text-right">{bug.status}</span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                      <span>{linkedCases.length} case{linkedCases.length !== 1 && "s"} · {traceBugs.length} bug{traceBugs.length !== 1 && "s"} traced</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openLinkTestCasesModal(req)}
                        className="h-6 text-blue-600 hover:bg-blue-50 text-[10px] font-semibold"
                      >
                        <LinkIcon size={11} className="mr-1" /> Manage links
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  // Epic group header row for the tree view — tinted band with coverage bar
  const renderEpicHeader = (epic: Epic, stories: Requirement[]) => {
    const collapsed = collapsedEpicIds.has(epic.id)
    const { covered, cases } = epicRollup(stories)
    const pct = stories.length > 0 ? Math.round((covered / stories.length) * 100) : 0
    return (
      <tr key={`epic-${epic.id}`} className="bg-gradient-to-r from-violet-50/90 to-violet-50/30 border-y border-violet-100/80 shadow-[inset_2px_0_0_theme(colors.violet.400)]">
        <td className="p-3 w-8"></td>
        <td colSpan={colCount - 2} className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => toggleEpicCollapsed(epic.id)}
              className="inline-flex items-center gap-1.5 font-bold text-violet-900 hover:text-violet-600 transition-colors"
            >
              <ChevronRight
                size={15}
                className={`text-violet-400 transition-transform ${collapsed ? "" : "rotate-90"}`}
              />
              <FolderKanban size={14} className="text-violet-500" />
              {epic.epicKey}
              <span className="font-semibold text-violet-800 max-w-md truncate" title={epic.title}>— {epic.title}</span>
            </button>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              epic.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
              epic.status === "Completed" ? "bg-blue-50 text-blue-700 border-blue-100" :
              epic.status === "Archived" ? "bg-slate-100 text-slate-500 border-slate-200" :
              "bg-amber-50 text-amber-700 border-amber-100"
            }`}>{epic.status}</span>
            {getPriorityBadge(epic.priority)}
            <span className="text-[10px] font-semibold text-violet-500 whitespace-nowrap">
              {stories.length} stor{stories.length === 1 ? "y" : "ies"} · {cases} case{cases !== 1 && "s"}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-24 rounded-full bg-violet-100 overflow-hidden">
                <span className="block h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-[10px] font-bold text-violet-600 tabular-nums">{covered}/{stories.length} covered</span>
            </span>
          </div>
        </td>
        <td className="p-3 text-right whitespace-nowrap space-x-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setNewEpicId(epic.id); setShowCreateModal(true) }}
            className="h-7 px-2 hover:bg-violet-100 text-violet-700 rounded-lg text-[10px] font-semibold"
            title="Add a user story under this epic"
          >
            <Plus size={12} className="mr-0.5" /> Story
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditEpicModal(epic)}
            className="h-7 w-7 p-0 hover:bg-violet-100 text-violet-600 rounded-lg"
            title="Edit epic"
          >
            <Pencil size={13} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setEpicDeleteMode("unlink"); setEpicToDelete(epic) }}
            className="h-7 w-7 p-0 hover:bg-red-50 text-red-500 rounded-lg"
            title="Delete epic"
          >
            <Trash2 size={13} />
          </Button>
        </td>
      </tr>
    )
  }

  // Consistent pill color coding, reused across rows, headers, and the picker
  const PRIORITY_STYLES: Record<string, string> = {
    Critical: "bg-red-50 text-red-700 border-red-100",
    High: "bg-orange-50 text-orange-700 border-orange-100",
    Medium: "bg-amber-50 text-amber-700 border-amber-100",
    Low: "bg-slate-50 text-slate-500 border-slate-100"
  }
  const getPriorityBadge = (p: string) => (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${PRIORITY_STYLES[p] || PRIORITY_STYLES.Low}`}>
      {p}
    </span>
  )

  const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
    Draft: { label: "Draft", cls: "bg-slate-50 text-slate-500 border-slate-200" },
    ReadyForTesting: { label: "Ready", cls: "bg-blue-50 text-blue-700 border-blue-100" },
    InTesting: { label: "In Testing", cls: "bg-amber-50 text-amber-700 border-amber-100" },
    Covered: { label: "Covered", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    PartiallyCovered: { label: "Partial", cls: "bg-yellow-50 text-yellow-700 border-yellow-100" },
    Failed: { label: "Failed", cls: "bg-red-50 text-red-700 border-red-100" },
    Blocked: { label: "Blocked", cls: "bg-orange-50 text-orange-700 border-orange-100" },
    Deprecated: { label: "Deprecated", cls: "bg-slate-100 text-slate-400 border-slate-200" }
  }
  const getStatusBadge = (s: string) => {
    const style = STATUS_STYLES[s] || { label: s, cls: "bg-slate-50 text-slate-500 border-slate-200" }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${style.cls}`}>
        {style.label}
      </span>
    )
  }

  // Format Status badge colors
  const getCoverageBadge = (cov: string) => {
    switch (cov) {
      case "Covered":
        return <span className="text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 px-2.5 py-0.5 rounded-full uppercase">Covered</span>
      case "PartiallyCovered":
        return <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 px-2.5 py-0.5 rounded-full uppercase">Partial</span>
      case "Uncovered":
        return <span className="text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400 px-2.5 py-0.5 rounded-full uppercase">Uncovered</span>
      case "Failed":
        return <span className="text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 px-2.5 py-0.5 rounded-full uppercase">Failed</span>
      case "Blocked":
        return <span className="text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 px-2.5 py-0.5 rounded-full uppercase">Blocked</span>
      case "NotExecuted":
        return <span className="text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 px-2.5 py-0.5 rounded-full uppercase">Not Executed</span>
      default:
        return <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full uppercase">{cov}</span>
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl text-slate-800">
      
      {/* Header breadcrumb & actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-5 gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Requirements Traceability
            </h1>
            <p className="text-sm text-slate-500 mt-1">Directly trace requirement user stories, test cases, and active bugs.</p>
          </div>
        </div>

        {/* One accent-filled primary action; everything else is a uniform
            outline secondary so the hierarchy reads at a glance. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs shadow-sm">
            <Plus size={15} /> Create Story
          </Button>
          <Button onClick={openCreateEpicModal} variant="outline" className="border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs">
            <FolderKanban size={15} className="text-violet-500" /> New Epic
          </Button>
          <Button onClick={() => setShowImportModal(true)} variant="outline" className="border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs">
            <FileSpreadsheet size={15} className="text-blue-500" /> Import Excel
          </Button>
          <Button
            onClick={handleImportStories}
            disabled={importingStories}
            variant="outline"
            className="border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs"
          >
            {importingStories ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} className="text-teal-500" />}
            OpenProject
          </Button>
          <Link href={`/projects/${projectId}/backlog`}>
            <Button variant="outline" className="border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs">
              <ListOrdered size={15} className="text-slate-400" /> Backlog
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/generate-from-file`}>
            <Button variant="outline" className="border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs">
              <Sparkles size={15} className="text-violet-500" /> Generate
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/coverage-matrix`}>
            <Button variant="outline" className="border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs">
              <Layers size={15} className="text-indigo-500" /> Matrix
            </Button>
          </Link>
        </div>
      </div>

      {/* Compact stat strip: one grouped row, muted label over larger number */}
      {stats && (
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/50 grid grid-cols-3 sm:grid-cols-6 divide-x divide-slate-100 overflow-hidden">
          {[
            { label: "Total Stories", value: stats.total, color: "text-slate-800" },
            { label: "Covered", value: stats.covered, color: "text-emerald-600" },
            { label: "Failed", value: stats.failed, color: "text-red-600" },
            { label: "Blocked", value: stats.blocked, color: "text-orange-600" },
            { label: "Uncovered", value: stats.uncovered, color: "text-slate-500" },
            { label: "Coverage", value: `${stats.coveragePercentage}%`, color: "text-indigo-600" }
          ].map((s) => (
            <div key={s.label} className="px-5 py-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">{s.label}</span>
              <span className={`text-2xl font-semibold mt-0.5 block tabular-nums ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters bar */}
      <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by key, title, description..."
              className="w-full bg-slate-50 border border-slate-200 pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
            />
          </div>
          
          <select
            value={epicFilter}
            onChange={(e) => setEpicFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none text-slate-700"
          >
            <option value="ALL">All Epics</option>
            <option value="NONE">No Epic</option>
            {epics.map(ep => <option key={ep.id} value={ep.id}>{ep.epicKey} — {ep.title}</option>)}
          </select>

          <select
            value={modFilter}
            onChange={(e) => setModFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none text-slate-700"
          >
            <option value="ALL">All Modules</option>
            {projectModules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none text-slate-700"
          >
            <option value="ALL">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="ReadyForTesting">Ready For Testing</option>
            <option value="InTesting">In Testing</option>
            <option value="Deprecated">Deprecated</option>
          </select>

          <select
            value={coverageFilter}
            onChange={(e) => setCoverageFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none text-slate-700"
          >
            <option value="ALL">All Coverage</option>
            <option value="Covered">Covered</option>
            <option value="PartiallyCovered">Partially Covered</option>
            <option value="Uncovered">Uncovered</option>
            <option value="Failed">Failed</option>
            <option value="Blocked">Blocked</option>
            <option value="NotExecuted">Not Executed</option>
          </select>

          {/* Tree/Flat segmented control caps the filter row */}
          <div className="flex items-center bg-slate-100 rounded-xl p-0.5 shrink-0 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`px-3 py-1.5 flex items-center gap-1.5 rounded-[10px] text-xs font-semibold transition-all ${
                viewMode === "tree" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
              title="Group stories under their epics"
            >
              <ListTree size={13} /> Tree
            </button>
            <button
              type="button"
              onClick={() => setViewMode("flat")}
              className={`px-3 py-1.5 flex items-center gap-1.5 rounded-[10px] text-xs font-semibold transition-all ${
                viewMode === "flat" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
              title="Flat list of all stories"
            >
              <Rows3 size={13} /> Flat
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 pt-3 border-t border-slate-100">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1">Quick filters</span>

          <button
            type="button"
            onClick={() => setCasesFilter(casesFilter === "NO_CASES" ? "ALL" : "NO_CASES")}
            className={`px-3 py-1 rounded-full border transition-colors ${casesFilter === "NO_CASES" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}
          >
            No Test Cases
          </button>

          <button
            type="button"
            onClick={() => setBugsFilter(bugsFilter === "WITH_BUGS" ? "ALL" : "WITH_BUGS")}
            className={`px-3 py-1 rounded-full border transition-colors ${bugsFilter === "WITH_BUGS" ? "bg-red-100 text-red-800 border-red-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}
          >
            Has Active Bugs
          </button>
        </div>
      </div>

      {/* Main Grid Table */}
      <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20">
            <Loader2 className="animate-spin text-blue-600 h-10 w-10 mb-4" />
            <p className="text-slate-500 text-sm">Fetching project requirements matrix...</p>
          </div>
        ) : filteredRequirements.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-4">
            <Layers className="mx-auto text-slate-300 h-12 w-12" />
            <p className="text-sm font-semibold">No requirements found matching filters.</p>
            <p className="text-xs text-slate-400">Click &quot;Create Requirement&quot; or &quot;Import Excel&quot; to register manual stories.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-4 w-8">
                    <input
                      type="checkbox"
                      checked={filteredRequirements.length > 0 && filteredRequirements.every((r) => selectedIds.includes(r.id))}
                      onChange={() => toggleSelectAllVisible(filteredRequirements)}
                      title="Select all visible stories"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-4">Key</th>
                  <th className="p-4">Title</th>
                  {viewMode === "flat" && <th className="p-4">Epic</th>}
                  <th className="p-4">Module path</th>
                  <th className="p-4">Priority</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Linked Cases</th>
                  <th className="p-4">Coverage Status</th>
                  <th className="p-4">Bugs</th>
                  <th className="p-4">Source</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {viewMode === "flat" ? (
                  filteredRequirements.map(renderStoryRow)
                ) : (
                  <>
                    {epics
                      .filter((ep) => epicFilter === "ALL" || epicFilter === ep.id)
                      .map((epic) => {
                        const stories = storiesByEpic.get(epic.id) || []
                        return (
                          <Fragment key={epic.id}>
                            {renderEpicHeader(epic, stories)}
                            {!collapsedEpicIds.has(epic.id) && stories.map(renderStoryRow)}
                            {!collapsedEpicIds.has(epic.id) && stories.length === 0 && (
                              <tr>
                                <td colSpan={colCount} className="px-10 py-3 text-[11px] text-slate-400 italic">
                                  No user stories in this epic yet — use &quot;+ Story&quot; to add one, or move existing stories here.
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    {(epicFilter === "ALL" || epicFilter === "NONE") && noEpicStories.length > 0 && (
                      <Fragment key="no-epic">
                        <tr className="bg-gradient-to-r from-slate-100/90 to-slate-50/40 border-y border-slate-200/70 shadow-[inset_2px_0_0_theme(colors.slate.300)]">
                          <td className="p-3 w-8"></td>
                          <td colSpan={colCount - 1} className="p-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <button
                                onClick={() => toggleEpicCollapsed("__none__")}
                                className="inline-flex items-center gap-1.5 font-bold text-slate-500 hover:text-slate-700 transition-colors"
                              >
                                <ChevronRight
                                  size={15}
                                  className={`text-slate-400 transition-transform ${collapsedEpicIds.has("__none__") ? "" : "rotate-90"}`}
                                />
                                <FolderKanban size={14} className="text-slate-400" />
                                No Epic
                              </button>
                              <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                                {noEpicStories.length} stor{noEpicStories.length === 1 ? "y" : "ies"} awaiting assignment
                              </span>
                              <span className="inline-flex items-center gap-2">
                                <span className="h-1.5 w-24 rounded-full bg-slate-200 overflow-hidden">
                                  <span
                                    className="block h-full rounded-full bg-slate-400 transition-all"
                                    style={{ width: `${noEpicStories.length > 0 ? Math.round((epicRollup(noEpicStories).covered / noEpicStories.length) * 100) : 0}%` }}
                                  />
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                                  {epicRollup(noEpicStories).covered}/{noEpicStories.length} covered
                                </span>
                              </span>
                            </div>
                          </td>
                        </tr>
                        {!collapsedEpicIds.has("__none__") && noEpicStories.map(renderStoryRow)}
                      </Fragment>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal Dialog */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateRequirement} className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Create Requirement</h2>
              <p className="text-xs text-slate-500 mt-1">Register a new manual traceability target.</p>
            </div>
            
            <div className="flex-grow p-6 overflow-y-auto space-y-4 text-slate-700">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Req Key *</label>
                  <input
                    type="text"
                    required
                    value={newReqKey}
                    onChange={(e) => setNewReqKey(e.target.value)}
                    placeholder="REQ-AUTH-001"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Title *</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="User login validation with token credentials"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Description (Optional)</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Requirement details..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 h-16 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Acceptance Criteria (Optional)</label>
                <textarea
                  value={newCriteria}
                  onChange={(e) => setNewCriteria(e.target.value)}
                  placeholder="GIVEN a user... WHEN credentials are valid... THEN login succeeds"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 h-16 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Parent Epic (Optional)</label>
                <select
                  value={newEpicId}
                  onChange={(e) => setNewEpicId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                >
                  <option value="">No Epic</option>
                  {epics.map(ep => (
                    <option key={ep.id} value={ep.id}>{ep.epicKey} — {ep.title}</option>
                  ))}
                </select>
              </div>

              {/* Hierarchy coordinates linking */}
              <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <span className="text-xs font-bold text-slate-600 block">Link Hierarchy path (Optional)</span>
                <HierarchySelector
                  projectId={projectId}
                  moduleId={newModuleId}
                  onChangeModuleId={setNewModuleId}
                  featureId={newFeatureId}
                  onChangeFeatureId={setNewFeatureId}
                  componentId={newComponentId}
                  onChangeComponentId={setNewComponentId}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Draft">Draft</option>
                    <option value="ReadyForTesting">Ready For Testing</option>
                    <option value="InTesting">In Testing</option>
                    <option value="Deprecated">Deprecated</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">External System</label>
                  <select
                    value={newExternalSystem}
                    onChange={(e) => setNewExternalSystem(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Jira">Jira</option>
                    <option value="AzureDevOps">Azure DevOps</option>
                    <option value="GitHub">GitHub</option>
                    <option value="Manual">Manual</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">External URL</label>
                  <input
                    type="url"
                    value={newExternalUrl}
                    onChange={(e) => setNewExternalUrl(e.target.value)}
                    placeholder="https://jira-domain.atlassian.net/browse/REQ-1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Figma URL (Optional)</label>
                <input
                  type="url"
                  value={newFigmaUrl}
                  onChange={(e) => setNewFigmaUrl(e.target.value)}
                  placeholder="https://figma.com/file/..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none text-slate-800"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2 shrink-0">
              <Button variant="outline" type="button" onClick={() => { setShowCreateModal(false); setNewEpicId("") }} className="text-xs h-9 rounded-lg">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow">
                {submitting ? <Loader2 className="animate-spin h-3 w-3" /> : null}
                Save Requirement
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Link Test Cases Modal Dialog — searchable multi-select picker */}
      {showLinkModal && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Link Test Cases</h2>
              <p className="text-xs text-slate-500 mt-1">
                Select test cases to associate with <span className="font-bold">{selectedReq.requirementKey}</span> — {selectedCaseIdsToLink.length} selected.
              </p>
            </div>

            {/* Picker search & filters */}
            <div className="px-6 pt-4 pb-3 border-b border-slate-100 flex flex-wrap gap-2 items-center shrink-0">
              <div className="relative flex-grow min-w-[180px]">
                <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder="Search test cases by title..."
                  className="w-full bg-slate-50 border border-slate-200 pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <select
                value={linkModuleFilter}
                onChange={(e) => setLinkModuleFilter(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 bg-white rounded-lg text-[11px] focus:outline-none text-slate-700"
              >
                <option value="ALL">All Modules</option>
                {projectModules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select
                value={linkPriorityFilter}
                onChange={(e) => setLinkPriorityFilter(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 bg-white rounded-lg text-[11px] focus:outline-none text-slate-700"
              >
                <option value="ALL">All Priorities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
              <select
                value={linkExecFilter}
                onChange={(e) => setLinkExecFilter(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 bg-white rounded-lg text-[11px] focus:outline-none text-slate-700"
              >
                <option value="ALL">Manual & Automated</option>
                <option value="Manual">Manual</option>
                <option value="Automated">Automated</option>
              </select>
              <button
                type="button"
                onClick={() => setLinkUnlinkedOnly(v => !v)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                  linkUnlinkedOnly ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-500"
                }`}
                title="Show only test cases not linked to any user story"
              >
                Unlinked only
              </button>
            </div>

            {/* Select-all row */}
            <div className="px-6 py-2 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
              <button
                type="button"
                onClick={togglePickerSelectAll}
                disabled={filteredPickerCases.length === 0}
                className="font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-300"
              >
                {allPickerVisibleSelected ? "Deselect" : "Select"} all {filteredPickerCases.length} shown
              </button>
              <span>{availableTestCases.length} total in project</span>
            </div>

            <div className="flex-grow px-6 py-4 overflow-y-auto space-y-2">
              {filteredPickerCases.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-12">
                  {availableTestCases.length === 0 ? "No test cases found in this project." : "No test cases match the current filters."}
                </p>
              ) : (
                filteredPickerCases.map((tc) => {
                  const isChecked = selectedCaseIdsToLink.includes(tc.id)
                  const links = tc.requirements || []
                  const linkedToThis = selectedReq.testCases.some(l => l.testCaseId === tc.id)
                  const otherLinks = links.filter((l: any) => l.requirementId !== selectedReq.id).length
                  const pathParts = [tc.moduleRelation?.name, tc.feature?.name, tc.component?.name].filter(Boolean)
                  return (
                    <div
                      key={tc.id}
                      onClick={() => {
                        setSelectedCaseIdsToLink(prev =>
                          prev.includes(tc.id) ? prev.filter(id => id !== tc.id) : [...prev, tc.id]
                        )
                      }}
                      className={`p-3 rounded-xl border cursor-pointer hover:bg-slate-50 transition-colors flex items-center gap-3 ${
                        isChecked ? "bg-blue-50/20 border-blue-200" : "bg-white border-slate-200"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                        isChecked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-350 bg-white"
                      }`}>
                        {isChecked && <span className="text-[9px] font-bold">✓</span>}
                      </div>
                      <div className="flex-grow min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate" title={tc.title}>{tc.title}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                          {pathParts.length > 0 ? pathParts.join(" / ") : (tc.module || "Unassigned")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {getPriorityBadge(tc.priority)}
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-50 text-slate-500 border border-slate-100">
                          {tc.executionType}
                        </span>
                        {linkedToThis && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            Linked
                          </span>
                        )}
                        {otherLinks > 0 && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-50 text-violet-600 border border-violet-100"
                            title={`Also linked to ${otherLinks} other stor${otherLinks === 1 ? "y" : "ies"}`}
                          >
                            +{otherLinks} stor{otherLinks === 1 ? "y" : "ies"}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2 shrink-0">
              <Button variant="outline" type="button" onClick={() => setShowLinkModal(false)} className="text-xs h-9 rounded-lg">
                Cancel
              </Button>
              <Button
                onClick={handleLinkTestCases}
                disabled={linking}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow"
              >
                {linking ? <Loader2 className="animate-spin h-3 w-3" /> : null}
                Save Links
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Spreadsheet Importer trigger */}
      <ImportRequirementsModal
        projectId={projectId}
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={() => {
          fetchRequirementsData()
          fetchStatsData()
          fetchEpics()
        }}
      />

      <ConfirmDialog
        open={requirementToDelete !== null}
        title="Delete Requirement"
        description="Are you sure you want to delete this requirement? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDeleteRequirement}
        onCancel={() => setRequirementToDelete(null)}
      />

      {/* Epic Create / Edit Modal */}
      {showEpicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form onSubmit={handleSaveEpic} className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 bg-violet-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FolderKanban size={18} className="text-violet-600" />
                {editingEpic ? `Edit Epic ${editingEpic.epicKey}` : "New Epic"}
              </h2>
              <p className="text-xs text-slate-500 mt-1">Epics group user stories one level above the requirement list.</p>
            </div>

            <div className="p-6 space-y-4 text-slate-700">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Epic Key</label>
                  <input
                    type="text"
                    value={epicForm.epicKey}
                    onChange={(e) => setEpicForm({ ...epicForm, epicKey: e.target.value })}
                    placeholder="Auto (EP-1)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Title *</label>
                  <input
                    type="text"
                    required
                    value={epicForm.title}
                    onChange={(e) => setEpicForm({ ...epicForm, title: e.target.value })}
                    placeholder="Checkout Revamp"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Description (Optional)</label>
                <textarea
                  value={epicForm.description}
                  onChange={(e) => setEpicForm({ ...epicForm, description: e.target.value })}
                  placeholder="Scope of this epic..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 h-16 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Priority</label>
                  <select
                    value={epicForm.priority}
                    onChange={(e) => setEpicForm({ ...epicForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Status</label>
                  <select
                    value={epicForm.status}
                    onChange={(e) => setEpicForm({ ...epicForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2 shrink-0">
              <Button variant="outline" type="button" onClick={() => setShowEpicModal(false)} className="text-xs h-9 rounded-lg">
                Cancel
              </Button>
              <Button type="submit" disabled={savingEpic} className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow">
                {savingEpic ? <Loader2 className="animate-spin h-3 w-3" /> : null}
                {editingEpic ? "Save Changes" : "Create Epic"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Epic Delete Confirmation — explicit unlink-vs-delete choice */}
      {epicToDelete && (() => {
        const affected = requirements.filter((r) => r.epicId === epicToDelete.id)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 bg-red-50/50">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-600" />
                  Delete Epic {epicToDelete.epicKey}?
                </h2>
                <p className="text-xs text-slate-500 mt-1 truncate" title={epicToDelete.title}>{epicToDelete.title}</p>
              </div>

              <div className="p-6 space-y-4 text-slate-700">
                {affected.length === 0 ? (
                  <p className="text-xs text-slate-500">This epic has no linked user stories. It will be permanently deleted.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">
                        This epic has {affected.length} linked user stor{affected.length === 1 ? "y" : "ies"}:
                      </p>
                      <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 p-2 space-y-1">
                        {affected.map((r) => (
                          <div key={r.id} className="text-[11px] text-slate-500 truncate">
                            <span className="font-bold text-slate-600">{r.requirementKey}</span> — {r.title}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                        epicDeleteMode === "unlink" ? "border-blue-300 bg-blue-50/40" : "border-slate-200 hover:bg-slate-50"
                      }`}>
                        <input
                          type="radio"
                          name="epicDeleteMode"
                          checked={epicDeleteMode === "unlink"}
                          onChange={() => setEpicDeleteMode("unlink")}
                          className="mt-0.5"
                        />
                        <span className="text-xs">
                          <span className="font-bold text-slate-700 block">Unlink {affected.length} stor{affected.length === 1 ? "y" : "ies"} — keep them</span>
                          <span className="text-slate-500">Stories move to the &quot;No Epic&quot; bucket. Nothing else changes.</span>
                        </span>
                      </label>
                      <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                        epicDeleteMode === "delete" ? "border-red-300 bg-red-50/40" : "border-slate-200 hover:bg-slate-50"
                      }`}>
                        <input
                          type="radio"
                          name="epicDeleteMode"
                          checked={epicDeleteMode === "delete"}
                          onChange={() => setEpicDeleteMode("delete")}
                          className="mt-0.5"
                        />
                        <span className="text-xs">
                          <span className="font-bold text-red-700 block">Also delete these {affected.length} stor{affected.length === 1 ? "y" : "ies"}</span>
                          <span className="text-slate-500">Their test-case and bug links are removed. Test cases and bugs themselves are kept.</span>
                        </span>
                      </label>
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2 shrink-0">
                <Button variant="outline" type="button" onClick={() => { setEpicToDelete(null); setEpicDeleteMode("unlink") }} className="text-xs h-9 rounded-lg">
                  Cancel
                </Button>
                <Button
                  onClick={confirmDeleteEpic}
                  disabled={deletingEpic}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow"
                >
                  {deletingEpic ? <Loader2 className="animate-spin h-3 w-3" /> : null}
                  {epicDeleteMode === "delete" && affected.length > 0
                    ? `Delete Epic + ${affected.length} Stor${affected.length === 1 ? "y" : "ies"}`
                    : "Delete Epic"}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold whitespace-nowrap">
            {selectedIds.length} stor{selectedIds.length === 1 ? "y" : "ies"} selected
          </span>

          <select
            value=""
            disabled={bulkWorking}
            onChange={(e) => { if (e.target.value) handleBulkStatus(e.target.value) }}
            className="bg-slate-800 border border-slate-600 rounded-lg text-[11px] px-2 py-1.5 focus:outline-none cursor-pointer"
          >
            <option value="" disabled>Set Status…</option>
            <option value="Draft">Draft</option>
            <option value="ReadyForTesting">Ready For Testing</option>
            <option value="InTesting">In Testing</option>
            <option value="Blocked">Blocked</option>
            <option value="Deprecated">Deprecated</option>
          </select>

          <select
            value=""
            disabled={bulkWorking}
            onChange={(e) => { if (e.target.value) handleBulkPriority(e.target.value) }}
            className="bg-slate-800 border border-slate-600 rounded-lg text-[11px] px-2 py-1.5 focus:outline-none cursor-pointer"
          >
            <option value="" disabled>Set Priority…</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>

          <select
            value=""
            disabled={bulkWorking}
            onChange={(e) => {
              if (e.target.value === "__none__") handleBulkMoveToEpic(null)
              else if (e.target.value) handleBulkMoveToEpic(e.target.value)
            }}
            className="bg-slate-800 border border-slate-600 rounded-lg text-[11px] px-2 py-1.5 focus:outline-none cursor-pointer"
          >
            <option value="" disabled>Move to Epic…</option>
            <option value="__none__">No Epic (unassign)</option>
            {epics.map(ep => <option key={ep.id} value={ep.id}>{ep.epicKey} — {ep.title}</option>)}
          </select>

          <Button
            onClick={() => setBulkDeleteConfirmOpen(true)}
            disabled={bulkWorking}
            className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold h-7 px-3 rounded-lg"
          >
            {bulkWorking ? <Loader2 className="animate-spin h-3 w-3 mr-1" /> : <Trash2 size={12} className="mr-1" />}
            Delete
          </Button>

          <button
            onClick={() => setSelectedIds([])}
            className="text-slate-400 hover:text-white transition-colors"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title={`Delete ${selectedIds.length} User Stor${selectedIds.length === 1 ? "y" : "ies"}`}
        description={(() => {
          const targets = requirements.filter((r) => selectedIds.includes(r.id))
          const caseLinks = targets.reduce((sum, r) => sum + r.testCases.length, 0)
          const bugLinks = targets.reduce((sum, r) => sum + r.openBugsCount, 0)
          return `${targets.length} stor${targets.length === 1 ? "y" : "ies"} will be permanently deleted, removing ${caseLinks} test-case link${caseLinks !== 1 ? "s" : ""} and ${bugLinks} bug link${bugLinks !== 1 ? "s" : ""}. Test cases and bugs themselves are kept. This cannot be undone.`
        })()}
        variant="danger"
        confirmLabel="Delete Selected"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
      />
    </div>
  )
}
