"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HierarchySelector } from "@/components/hierarchy/hierarchy-selector"
import { LinkedRequirementsSelector } from "@/components/test-cases/linked-requirements-selector"
import {
  Play,
  FileText,
  Plus,
  Edit,
  RefreshCw,
  Folder,
  Trash2,
  Search,
  SlidersHorizontal,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Download,
  Move,
  LayoutGrid,
  FileSpreadsheet,
  Eye,
  Settings,
  Database,
  Code,
  BookOpen,
  AlertCircle,
  HelpCircle,
  Maximize2,
  Copy,
  User,
  MessageSquare,
  Paperclip,
  Activity,
  Sparkles,
  Terminal,
  Cpu,
  ArrowRight,
  Kanban
} from "lucide-react"

// Interfaces matching updated models
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

interface BugAttachment {
  id: string
  fileName: string
  filePath: string
  fileType: string
  fileSize: number | null
  createdAt: string
}

interface BugReport {
  id: string
  bugKey: string | null
  title: string
  projectId: string | null
  project: { id: string; name: string } | null
  moduleId: string | null
  moduleRelation: { id: string; name: string } | null
  featureId: string | null
  feature: { id: string; name: string } | null
  componentId: string | null
  component: { id: string; name: string } | null
  testCaseId: string | null
  testCase: { id: string; title: string } | null
  testRunId: string | null
  testRun: { id: string; browserType: string } | null
  testStepResultId: string | null
  manualSessionId: string | null
  severity: "Low" | "Medium" | "High" | "Critical"
  priority: "Low" | "Medium" | "High" | "Critical"
  status: "Open" | "InProgress" | "ReadyForRetest" | "Reopened" | "Resolved" | "Closed" | "Rejected" | "Duplicate"
  environment: string | null
  roleUsed: string | null
  browser: string | null
  viewport: string | null
  assignedTo: string | null
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
  screenshotPath: string | null
  consoleLogs: string | null
  networkErrors: string | null
  requirements: Array<{ id: string; requirement: { id: string; requirementKey: string; title: string } }>
  bugAttachments: BugAttachment[]
  createdAt: string
}

interface Project {
  id: string
  name: string
}

interface TestCase {
  id: string
  title: string
}

interface TestRun {
  id: string
  createdAt: string
}

export default function BugReportsHubPage() {
  const router = useRouter()

  // Base state databases
  const [projects, setProjects] = useState<Project[]>([])
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [totalBugsCount, setTotalBugsCount] = useState(0)

  // Metric counts summary
  const [summary, setSummary] = useState({
    total: 0,
    open: 0,
    critical: 0,
    highPriority: 0,
    failedTestBugs: 0,
    resolved: 0
  })

  // Sticky Filters States
  const [projectId, setProjectId] = useState("")
  const [moduleId, setModuleId] = useState("")
  const [featureId, setFeatureId] = useState("")
  const [componentId, setComponentId] = useState("")
  const [severity, setSeverity] = useState("")
  const [priority, setPriority] = useState("")
  const [status, setStatus] = useState("") // defaults to Open, InProgress, Reopened from API
  const [environment, setEnvironment] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [requirementId, setRequirementId] = useState("")
  const [testCaseId, setTestCaseId] = useState("")
  const [hasScreenshot, setHasScreenshot] = useState("")
  const [hasLogs, setHasLogs] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortBy, setSortBy] = useState("createdAt")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  // Workspace View toggles: table vs kanban board
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table")

  // Selected row checkbox states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Dynamic selector metadata
  const [hierarchyData, setHierarchyData] = useState<any[]>([])
  const [projectTestCases, setProjectTestCases] = useState<TestCase[]>([])
  const [projectTestRuns, setProjectTestRuns] = useState<TestRun[]>([])

  // Drawer / Modal visibility controls
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [quickDetailId, setQuickDetailId] = useState<string | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<"overview" | "steps" | "evidence" | "logs" | "activity">("overview")
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false)
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false)
  const [showBulkPriorityModal, setShowBulkPriorityModal] = useState(false)

  // Creation fields
  const [createProjectId, setCreateProjectId] = useState("")
  const [createTitle, setCreateTitle] = useState("")
  const [createSeverity, setCreateSeverity] = useState<"Low" | "Medium" | "High" | "Critical">("Medium")
  const [createPriority, setCreatePriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium")
  const [createStatus, setCreateStatus] = useState("Open")
  const [createEnvironment, setCreateEnvironment] = useState("Staging")
  const [createAssignedTo, setCreateAssignedTo] = useState("")
  const [createSteps, setCreateSteps] = useState("")
  const [createExpected, setCreateExpected] = useState("")
  const [createActual, setCreateActual] = useState("")
  const [createModuleId, setCreateModuleId] = useState("")
  const [createFeatureId, setCreateFeatureId] = useState("")
  const [createComponentId, setCreateComponentId] = useState("")
  const [createTestCaseId, setCreateTestCaseId] = useState("")
  const [createRequirementIds, setCreateRequirementIds] = useState<string[]>([])
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState("")

  // Quick edit details drawer fields
  const [detailBug, setDetailBug] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editSeverity, setEditSeverity] = useState<"Low" | "Medium" | "High" | "Critical">("Medium")
  const [editPriority, setEditPriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium")
  const [editStatus, setEditStatus] = useState("Open")
  const [editEnvironment, setEditEnvironment] = useState("Staging")
  const [editAssignedTo, setEditAssignedTo] = useState("")
  const [editSteps, setEditSteps] = useState("")
  const [editExpected, setEditExpected] = useState("")
  const [editActual, setEditActual] = useState("")
  const [editModuleId, setEditModuleId] = useState("")
  const [editFeatureId, setEditFeatureId] = useState("")
  const [editComponentId, setEditComponentId] = useState("")
  const [editTestCaseId, setEditTestCaseId] = useState("")
  const [editRequirementIds, setEditRequirementIds] = useState<string[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState("")

  // Inline Comment states
  const [newCommentText, setNewCommentText] = useState("")
  const [commentSaving, setCommentSaving] = useState(false)

  // Inline screenshot / attachment mock upload states
  const [attachmentName, setAttachmentName] = useState("")
  const [attachmentPath, setAttachmentPath] = useState("")
  const [attachmentSaving, setAttachmentSaving] = useState(false)

  // AI assistant suggestion states
  const [aiSuggestion, setAiSuggestion] = useState("")
  const [aiAssistanceRunning, setAiAssistanceRunning] = useState(false)

  // Bulk operation parameter targets
  const [targetStatus, setTargetStatus] = useState("Open")
  const [targetAssignedTo, setTargetAssignedTo] = useState("")
  const [targetPriorityLevel, setTargetPriorityLevel] = useState("Medium")
  const [bulkSaving, setBulkSaving] = useState(false)

  // Search debounce handler
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset drill filters on project change
  useEffect(() => {
    setModuleId("")
    setFeatureId("")
    setComponentId("")
    setRequirementId("")
    setTestCaseId("")
  }, [projectId])

  // Fetch initial project list
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data.projects || []))
      .catch((err) => console.error("Error fetching projects list:", err))
  }, [])

  // Fetch project specific hierarchy & testcases when project selected
  useEffect(() => {
    const activeProj = projectId || createProjectId
    if (activeProj && activeProj !== "all") {
      fetch(`/api/projects/${activeProj}/hierarchy`)
        .then((res) => res.json())
        .then((data) => setHierarchyData(data.modules || []))

      fetch(`/api/projects/${activeProj}/test-cases`)
        .then((res) => res.json())
        .then((data) => setProjectTestCases(data.testCases || []))

      fetch(`/api/projects/${activeProj}/test-runs`)
        .then((res) => res.json())
        .then((data) => setProjectTestRuns(data.testRuns || []))
    } else {
      setHierarchyData([])
      setProjectTestCases([])
      setProjectTestRuns([])
    }
  }, [projectId, createProjectId])

  // Fetch bugs data
  const fetchBugsData = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (projectId && projectId !== "all") params.append("projectId", projectId)
    if (moduleId) params.append("moduleId", moduleId)
    if (featureId) params.append("featureId", featureId)
    if (componentId) params.append("componentId", componentId)
    if (severity) params.append("severity", severity)
    if (priority) params.append("priority", priority)
    if (status) params.append("status", status)
    if (environment) params.append("environment", environment)
    if (assignedTo) params.append("assignedTo", assignedTo)
    if (requirementId) params.append("requirementId", requirementId)
    if (testCaseId) params.append("testCaseId", testCaseId)
    if (hasScreenshot) params.append("hasScreenshot", hasScreenshot)
    if (hasLogs) params.append("hasLogs", hasLogs)
    if (dateFrom) params.append("dateFrom", dateFrom)
    if (dateTo) params.append("dateTo", dateTo)
    if (debouncedSearch) params.append("search", debouncedSearch)
    params.append("page", String(page))
    params.append("pageSize", String(viewMode === "kanban" ? 100 : pageSize))
    params.append("sortBy", sortBy)
    params.append("sortDirection", sortDirection)

    fetch(`/api/bug-reports?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setBugs(data.items || [])
        setTotalBugsCount(data.total || 0)
        if (data.summary) {
          setSummary(data.summary)
        }
      })
      .catch((err) => console.error("Error loading bugs dataset:", err))
      .finally(() => setLoading(false))
  }

  // Trigger loading bugs when query options alter
  useEffect(() => {
    fetchBugsData()
  }, [
    projectId,
    moduleId,
    featureId,
    componentId,
    severity,
    priority,
    status,
    environment,
    assignedTo,
    requirementId,
    testCaseId,
    hasScreenshot,
    hasLogs,
    dateFrom,
    dateTo,
    debouncedSearch,
    page,
    pageSize,
    sortBy,
    sortDirection,
    viewMode
  ])

  // Fetch individual bug details when drawer focuses it
  const fetchSingleBugDetails = (id: string) => {
    setDetailLoading(true)
    setAiSuggestion("")
    fetch(`/api/bug-reports/${id}`)
      .then((res) => res.json())
      .then((data) => {
        const bug = data.bug
        setDetailBug(bug)
        setEditTitle(bug.title)
        setEditSeverity(bug.severity)
        setEditPriority(bug.priority)
        setEditStatus(bug.status)
        setEditEnvironment(bug.environment || "Staging")
        setEditAssignedTo(bug.assignedTo || "")
        setEditSteps(bug.stepsToReproduce || "")
        setEditExpected(bug.expectedResult || "")
        setEditActual(bug.actualResult || "")
        setEditModuleId(bug.moduleId || "")
        setEditFeatureId(bug.featureId || "")
        setEditComponentId(bug.componentId || "")
        setEditTestCaseId(bug.testCaseId || "")
        setEditRequirementIds((bug.requirements || []).map((r: any) => r.requirementId))
      })
      .catch((err) => console.error("Error fetching individual bug details:", err))
      .finally(() => setDetailLoading(false))
  }

  useEffect(() => {
    if (quickDetailId) {
      fetchSingleBugDetails(quickDetailId)
    } else {
      setDetailBug(null)
    }
  }, [quickDetailId])

  // Toggle selection checklists
  function toggleRowSelection(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  function toggleSelectAll() {
    if (selectedIds.size === bugs.length && bugs.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bugs.map((b) => b.id)))
    }
  }

  function resetAllFilters() {
    setProjectId("")
    setModuleId("")
    setFeatureId("")
    setComponentId("")
    setSeverity("")
    setPriority("")
    setStatus("")
    setEnvironment("")
    setAssignedTo("")
    setRequirementId("")
    setTestCaseId("")
    setHasScreenshot("")
    setHasLogs("")
    setDateFrom("")
    setDateTo("")
    setSearch("")
    setPage(1)
  }

  // Create new manual bug
  async function handleSaveNewBug(e: React.FormEvent) {
    e.preventDefault()
    if (!createProjectId || !createTitle.trim()) {
      setCreateError("Project and bug title are required fields.")
      return
    }

    setCreateSaving(true)
    setCreateError("")

    const body = {
      projectId: createProjectId,
      title: createTitle,
      severity: createSeverity,
      priority: createPriority,
      status: createStatus,
      environment: createEnvironment,
      assignedTo: createAssignedTo || null,
      stepsToReproduce: createSteps,
      expectedResult: createExpected,
      actualResult: createActual,
      moduleId: createModuleId || null,
      featureId: createFeatureId || null,
      componentId: createComponentId || null,
      testCaseId: createTestCaseId || null,
      requirementIds: createRequirementIds
    }

    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        setShowCreateModal(false)
        setProjectId(createProjectId)
        fetchBugsData()
        // Reset creation fields
        setCreateProjectId("")
        setCreateTitle("")
        setCreateSeverity("Medium")
        setCreatePriority("Medium")
        setCreateStatus("Open")
        setCreateEnvironment("Staging")
        setCreateAssignedTo("")
        setCreateSteps("")
        setCreateExpected("")
        setCreateActual("")
        setCreateModuleId("")
        setCreateFeatureId("")
        setCreateComponentId("")
        setCreateTestCaseId("")
        setCreateRequirementIds([])
      } else {
        const err = await res.json()
        setCreateError(err.error || "Failed to create bug report")
      }
    } catch {
      setCreateError("Network error trying to create bug report")
    } finally {
      setCreateSaving(false)
    }
  }

  // Save changes inside detail drawer
  async function handleSaveBugEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!quickDetailId) return

    setEditSaving(true)
    setEditError("")

    const body = {
      title: editTitle,
      severity: editSeverity,
      priority: editPriority,
      status: editStatus,
      environment: editEnvironment,
      assignedTo: editAssignedTo || null,
      stepsToReproduce: editSteps,
      expectedResult: editExpected,
      actualResult: editActual,
      moduleId: editModuleId || null,
      featureId: editFeatureId || null,
      componentId: editComponentId || null,
      requirementIds: editRequirementIds
    }

    try {
      const res = await fetch(`/api/bug-reports/${quickDetailId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        fetchSingleBugDetails(quickDetailId)
        fetchBugsData()
      } else {
        const err = await res.json()
        setEditError(err.error || "Failed to update bug report")
      }
    } catch {
      setEditError("Network error saving changes")
    } finally {
      setEditSaving(false)
    }
  }

  // Update status directly (Kanban drag drops or drawer actions)
  async function handleUpdateBugStatus(bugId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/bug-reports/${bugId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      })

      if (res.ok) {
        if (quickDetailId === bugId) {
          fetchSingleBugDetails(bugId)
        }
        fetchBugsData()
      } else {
        alert("Failed to update bug status")
      }
    } catch {
      alert("Network error updating bug status")
    }
  }

  // Delete bug report
  async function handleDeleteBug(bug: BugReport) {
    if (confirm(`Are you sure you want to delete bug report ${bug.bugKey || bug.title}?`)) {
      try {
        const res = await fetch(`/api/bug-reports/${bug.id}`, {
          method: "DELETE"
        })
        if (res.ok) {
          setQuickDetailId(null)
          fetchBugsData()
        } else {
          alert("Failed to delete bug report")
        }
      } catch {
        alert("Network error deleting bug report")
      }
    }
  }

  // Submit comment in detail drawer
  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    if (!quickDetailId || !newCommentText.trim()) return

    setCommentSaving(true)
    try {
      const res = await fetch(`/api/bug-reports/${quickDetailId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: newCommentText })
      })

      if (res.ok) {
        setNewCommentText("")
        fetchSingleBugDetails(quickDetailId)
      } else {
        alert("Failed to post comment")
      }
    } catch {
      alert("Error posting comment")
    } finally {
      setCommentSaving(false)
    }
  }

  // Submit mock screenshot/file attachment
  async function handleAddAttachment(e: React.FormEvent) {
    e.preventDefault()
    if (!quickDetailId || !attachmentName || !attachmentPath) return

    setAttachmentSaving(true)
    try {
      const res = await fetch(`/api/bug-reports/${quickDetailId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: attachmentName,
          filePath: attachmentPath,
          fileType: attachmentName.endsWith(".png") || attachmentName.endsWith(".jpg") ? "image/png" : "application/pdf"
        })
      })

      if (res.ok) {
        setAttachmentName("")
        setAttachmentPath("")
        fetchSingleBugDetails(quickDetailId)
      } else {
        alert("Failed to save attachment")
      }
    } catch {
      alert("Error attaching file")
    } finally {
      setAttachmentSaving(false)
    }
  }

  // AI Helper integration
  async function triggerAiAssistance(action: string) {
    if (!quickDetailId) return

    setAiAssistanceRunning(true)
    setAiSuggestion("")

    try {
      const res = await fetch("/api/ai/bug-assistance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          title: editTitle,
          stepsToReproduce: editSteps,
          expectedResult: editExpected,
          actualResult: editActual,
          consoleLogs: detailBug?.consoleLogs || "",
          networkErrors: detailBug?.networkErrors || ""
        })
      })

      if (res.ok) {
        const data = await res.json()
        setAiSuggestion(data.suggestion || "No suggestion received.")
      } else {
        setAiSuggestion("AI triager service could not generate a suggestion at this time.")
      }
    } catch {
      setAiSuggestion("Network connection issue with AI triager endpoint.")
    } finally {
      setAiAssistanceRunning(false)
    }
  }

  // Apply suggested AI changes
  function applyAiSuggestion(field: "title" | "steps" | "severity") {
    if (!aiSuggestion) return
    if (field === "title") {
      setEditTitle(aiSuggestion)
    } else if (field === "steps") {
      setEditSteps(aiSuggestion)
    } else if (field === "severity") {
      const norm = aiSuggestion.trim()
      if (["Low", "Medium", "High", "Critical"].includes(norm)) {
        setEditSeverity(norm as any)
      }
    }
    setAiSuggestion("")
  }

  // Bulk operations execution
  async function handleExecuteBulkStatus() {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    try {
      const res = await fetch("/api/bug-reports/bulk-update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bugIds: Array.from(selectedIds),
          status: targetStatus
        })
      })

      if (res.ok) {
        setShowBulkStatusModal(false)
        setSelectedIds(new Set())
        fetchBugsData()
      } else {
        alert("Failed to batch update statuses")
      }
    } catch {
      alert("Error during bulk update status")
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleExecuteBulkAssign() {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    try {
      const res = await fetch("/api/bug-reports/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bugIds: Array.from(selectedIds),
          assignedTo: targetAssignedTo || null
        })
      })

      if (res.ok) {
        setShowBulkAssignModal(false)
        setSelectedIds(new Set())
        fetchBugsData()
      } else {
        alert("Failed to batch assign bugs")
      }
    } catch {
      alert("Error during bulk assignment")
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleExecuteBulkPriority() {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    try {
      const res = await fetch("/api/bug-reports/bulk-update-priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bugIds: Array.from(selectedIds),
          priority: targetPriorityLevel
        })
      })

      if (res.ok) {
        setShowBulkPriorityModal(false)
        setSelectedIds(new Set())
        fetchBugsData()
      } else {
        alert("Failed to batch update priorities")
      }
    } catch {
      alert("Error during bulk update priority")
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleExecuteBulkExport() {
    if (selectedIds.size === 0) return
    try {
      const res = await fetch("/api/bug-reports/bulk-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bugIds: Array.from(selectedIds) })
      })

      if (res.ok) {
        const data = await res.json()
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
          JSON.stringify(data.bugReports, null, 2)
        )}`
        const downloadAnchor = document.createElement("a")
        downloadAnchor.setAttribute("href", jsonString)
        downloadAnchor.setAttribute("download", `bug_reports_export_${Date.now()}.json`)
        document.body.appendChild(downloadAnchor)
        downloadAnchor.click()
        downloadAnchor.remove()
      } else {
        alert("Failed to export bug reports")
      }
    } catch {
      alert("Error exporting bugs")
    }
  }

  async function handleExportAllFiltered() {
    const params = new URLSearchParams()
    if (projectId && projectId !== "all") params.append("projectId", projectId)
    if (moduleId) params.append("moduleId", moduleId)
    if (featureId) params.append("featureId", featureId)
    if (componentId) params.append("componentId", componentId)
    if (severity) params.append("severity", severity)
    if (priority) params.append("priority", priority)
    if (status) params.append("status", status)
    if (environment) params.append("environment", environment)
    if (assignedTo) params.append("assignedTo", assignedTo)
    if (requirementId) params.append("requirementId", requirementId)
    if (testCaseId) params.append("testCaseId", testCaseId)
    if (hasScreenshot) params.append("hasScreenshot", hasScreenshot)
    if (hasLogs) params.append("hasLogs", hasLogs)
    if (dateFrom) params.append("dateFrom", dateFrom)
    if (dateTo) params.append("dateTo", dateTo)
    if (debouncedSearch) params.append("search", debouncedSearch)
    params.append("page", "1")
    params.append("pageSize", "1000") // export up to 1000

    try {
      const res = await fetch(`/api/bug-reports?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const ids = (data.items || []).map((t: any) => t.id)
        if (ids.length === 0) {
          alert("No bugs found matching current filter scope.")
          return
        }

        const exportRes = await fetch("/api/bug-reports/bulk-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bugIds: ids })
        })

        if (exportRes.ok) {
          const exportData = await exportRes.json()
          const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(exportData.bugReports, null, 2)
          )}`
          const downloadAnchor = document.createElement("a")
          downloadAnchor.setAttribute("href", jsonString)
          downloadAnchor.setAttribute("download", `bug_reports_filtered_export_${Date.now()}.json`)
          document.body.appendChild(downloadAnchor)
          downloadAnchor.click()
          downloadAnchor.remove()
        }
      }
    } catch {
      alert("Error exporting filtered bug reports")
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return
    if (confirm(`Are you sure you want to delete ${selectedIds.size} selected bug reports?`)) {
      try {
        for (const id of Array.from(selectedIds)) {
          await fetch(`/api/bug-reports/${id}`, { method: "DELETE" })
        }
        setSelectedIds(new Set())
        fetchBugsData()
      } catch {
        alert("Error executing bulk delete")
      }
    }
  }

  // Export Single bug details as Markdown file
  function handleExportBugToMarkdown(bug: BugReport) {
    const md = `# Bug Triage Report: ${bug.bugKey || "BUG"} - ${bug.title}
- **Project**: ${bug.project?.name || "N/A"}
- **Severity**: ${bug.severity}
- **Priority**: ${bug.priority}
- **Status**: ${bug.status}
- **Environment**: ${bug.environment || "N/A"}
- **Assigned Developer**: ${bug.assignedTo || "Unassigned"}
- **Creation Date**: ${new Date(bug.createdAt).toLocaleDateString()}

## Steps to Reproduce
${bug.stepsToReproduce || "No steps provided."}

## Expected Outcome
${bug.expectedResult || "N/A"}

## Actual Outcome
${bug.actualResult || "N/A"}

## System Evidence Logs
- Screenshot Path: ${bug.screenshotPath || "None"}
- console Logs: ${bug.consoleLogs || "None"}
- Network Errors: ${bug.networkErrors || "None"}
`
    const downloadAnchor = document.createElement("a")
    downloadAnchor.setAttribute("href", `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`)
    downloadAnchor.setAttribute("download", `${bug.bugKey || "bug"}_report_${Date.now()}.md`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  // Drag and Drop handlers for Kanban
  function handleDragStart(e: React.DragEvent, bugId: string) {
    e.dataTransfer.setData("bugId", bugId)
  }

  function handleDrop(e: React.DragEvent, targetColStatus: string) {
    e.preventDefault()
    const bugId = e.dataTransfer.getData("bugId")
    if (bugId) {
      handleUpdateBugStatus(bugId, targetColStatus)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 pb-12 animate-in fade-in duration-200">
      
      {/* 1. Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 bg-background/50 backdrop-blur-sm sticky top-0 z-30">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-red-600 via-pink-600 to-indigo-600 bg-clip-text text-transparent">
            Bug Reports Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 font-medium">
            Triage, track, investigate, and resolve bug reports across all suites.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => {
              setCreateProjectId(projectId && projectId !== "all" ? projectId : "")
              setShowCreateModal(true)
            }}
            className="flex items-center gap-1.5 shadow-md shadow-red-600/10 hover:shadow-red-600/20 transition-all font-semibold bg-red-600 hover:bg-red-700 text-white"
          >
            <Plus className="h-4.5 w-4.5" /> Create Bug
          </Button>

          <Button
            variant="outline"
            onClick={handleExportAllFiltered}
            className="flex items-center gap-1.5 font-semibold"
          >
            <Download className="h-4.5 w-4.5" /> Export All
          </Button>

          <div className="relative group">
            <Button variant="outline" className="flex items-center gap-1.5 font-semibold">
              More Actions <ChevronDown className="h-4 w-4" />
            </Button>
            <div className="absolute right-0 mt-1.5 w-56 rounded-xl border bg-background shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-150 z-50 p-1">
              <button
                onClick={() => {
                  if (projectId && projectId !== "all") {
                    router.push(`/projects/${projectId}/test-runs`)
                  } else {
                    alert("Please select a project first.")
                  }
                }}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent flex items-center gap-2"
              >
                <Play className="h-4 w-4 text-indigo-500" /> Open Failed Runs
              </button>
              <button
                onClick={() => {
                  if (projectId && projectId !== "all") {
                    router.push(`/projects/${projectId}/coverage-matrix`)
                  } else {
                    alert("Please select a project first.")
                  }
                }}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent flex items-center gap-2"
              >
                <Maximize2 className="h-4 w-4 text-purple-500" /> Open Coverage Matrix
              </button>
              <button
                onClick={() => {
                  if (projectId && projectId !== "all") {
                    router.push(`/projects/${projectId}/requirements`)
                  } else {
                    alert("Please select a project first.")
                  }
                }}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent flex items-center gap-2"
              >
                <BookOpen className="h-4 w-4 text-green-500" /> Open Requirements
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Summary Dashboard Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        {/* Total */}
        <div
          onClick={() => {
            setStatus("all")
            setSeverity("")
            setPriority("")
          }}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            status === "all" && !severity && !priority
              ? "bg-gradient-to-br from-red-50/50 to-red-100/30 border-red-200 shadow-md shadow-red-100/50 dark:from-red-950/20 dark:to-red-900/10 dark:border-red-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Bugs</div>
          <div className="text-3xl font-extrabold text-red-600 dark:text-red-400 mt-2">{summary.total}</div>
          <div className="text-[10px] text-muted-foreground mt-1">All recorded bug reports</div>
        </div>

        {/* Open */}
        <div
          onClick={() => setStatus("")}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            !status
              ? "bg-gradient-to-br from-indigo-50/50 to-indigo-100/30 border-indigo-200 shadow-md shadow-indigo-100/50 dark:from-indigo-950/20 dark:to-indigo-900/10 dark:border-indigo-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Open</div>
          <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">{summary.open}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Open/InProgress/Reopened</div>
        </div>

        {/* Critical */}
        <div
          onClick={() => setSeverity("Critical")}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            severity === "Critical"
              ? "bg-gradient-to-br from-red-50/50 to-red-100/30 border-red-200 shadow-md shadow-red-100/50 dark:from-red-950/20 dark:to-red-900/10 dark:border-red-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Critical Severity</div>
          <div className="text-3xl font-extrabold text-red-600 dark:text-red-400 mt-2">{summary.critical}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Blocked workflows</div>
        </div>

        {/* High priority */}
        <div
          onClick={() => setPriority("High")}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            priority === "High"
              ? "bg-gradient-to-br from-orange-50/50 to-orange-100/30 border-orange-200 shadow-md shadow-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10 dark:border-orange-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">High Priority</div>
          <div className="text-3xl font-extrabold text-orange-600 dark:text-orange-400 mt-2">{summary.highPriority}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Triage backlog target</div>
        </div>

        {/* Failed Test bugs */}
        <div
          onClick={() => {
            // Filter by test runs or general failed runs
            setSearch("RUN-")
          }}
          className="cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg bg-card hover:border-muted-foreground/30"
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Failed Test Bugs</div>
          <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-2">{summary.failedTestBugs}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Created from steps</div>
        </div>

        {/* Resolved */}
        <div
          onClick={() => setStatus("Resolved")}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            status === "Resolved" || status === "Closed"
              ? "bg-gradient-to-br from-green-50/50 to-green-100/30 border-green-200 shadow-md shadow-green-100/50 dark:from-green-950/20 dark:to-green-900/10 dark:border-green-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resolved / Closed</div>
          <div className="text-3xl font-extrabold text-green-600 dark:text-green-400 mt-2">{summary.resolved}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Successfully resolved</div>
        </div>
      </div>

      {/* Main filters bar + view toggle area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Filter Side Panel */}
        <div className="lg:col-span-1 border rounded-2xl p-5 bg-card shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" /> Filters
            </h3>
            <button
              onClick={resetAllFilters}
              className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline font-semibold"
            >
              Reset Filters
            </button>
          </div>

          {/* Project Filter */}
          <div className="space-y-1.5">
            <Label htmlFor="filter-project" className="text-xs font-semibold text-muted-foreground">Project</Label>
            <select
              id="filter-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Drilldown hierarchy */}
          {projectId ? (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="filter-module" className="text-xs font-semibold text-muted-foreground">Module</Label>
                <select
                  id="filter-module"
                  value={moduleId}
                  onChange={(e) => {
                    setModuleId(e.target.value)
                    setFeatureId("")
                    setComponentId("")
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
                >
                  <option value="">All Modules</option>
                  <option value="null">Unassigned</option>
                  {hierarchyData.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-feature" className="text-xs font-semibold text-muted-foreground">Feature</Label>
                <select
                  id="filter-feature"
                  value={featureId}
                  disabled={!moduleId || moduleId === "null"}
                  onChange={(e) => {
                    setFeatureId(e.target.value)
                    setComponentId("")
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none disabled:opacity-50"
                >
                  <option value="">All Features</option>
                  <option value="null">Unassigned</option>
                  {(hierarchyData.find((m) => m.id === moduleId)?.features || []).map((f: any) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-component" className="text-xs font-semibold text-muted-foreground">Component</Label>
                <select
                  id="filter-component"
                  value={componentId}
                  disabled={!featureId || featureId === "null"}
                  onChange={(e) => setComponentId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none disabled:opacity-50"
                >
                  <option value="">All Components</option>
                  <option value="null">Unassigned</option>
                  {((hierarchyData.find((m) => m.id === moduleId)?.features || []).find((f: any) => f.id === featureId)?.components || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground bg-accent/20 p-3 rounded-lg border">
              ℹ️ Filter by Project to drills suite hierarchy filters.
            </div>
          )}

          {/* Severity & priority filters */}
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="filter-severity" className="text-xs font-semibold text-muted-foreground">Severity</Label>
              <select
                id="filter-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
              >
                <option value="">All Severities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-priority" className="text-xs font-semibold text-muted-foreground">Priority</Label>
              <select
                id="filter-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
              >
                <option value="">All Priorities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Status lifecycle filter */}
          <div className="space-y-1.5 border-t pt-4">
            <Label htmlFor="filter-status" className="text-xs font-semibold text-muted-foreground">Triage Status</Label>
            <select
              id="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
            >
              <option value="">Active Open Bugs</option>
              <option value="all">All Lifecycles</option>
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

          {/* Environment & assigned to */}
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="filter-env" className="text-xs font-semibold text-muted-foreground">Environment</Label>
              <select
                id="filter-env"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
              >
                <option value="">All Environments</option>
                <option value="Dev">Dev</option>
                <option value="Staging">Staging</option>
                <option value="UAT">UAT</option>
                <option value="Production">Production</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-assign" className="text-xs font-semibold text-muted-foreground">Assigned Developer</Label>
              <select
                id="filter-assign"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
              >
                <option value="">All Assigned</option>
                <option value="unassigned">Unassigned</option>
                <option value="sabrymohsen">sabrymohsen</option>
                <option value="developer1">developer1</option>
                <option value="developer2">developer2</option>
              </select>
            </div>
          </div>

          {/* Screenshots / Logs checkboxes */}
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="filter-evidence" className="text-xs font-semibold text-muted-foreground">Evidence screenshots</Label>
              <select
                id="filter-evidence"
                value={hasScreenshot}
                onChange={(e) => setHasScreenshot(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
              >
                <option value="">All</option>
                <option value="true">Has Screenshots</option>
                <option value="false">No Screenshots</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-logs" className="text-xs font-semibold text-muted-foreground">Console Logs</Label>
              <select
                id="filter-logs"
                value={hasLogs}
                onChange={(e) => setHasLogs(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
              >
                <option value="">All</option>
                <option value="true">Has Error Logs</option>
                <option value="false">No Logs</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Date Range</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-xs mb-1"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Content Side: Table / Kanban List views */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Subheader toolbar options */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-2xl bg-card shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search title, keys, expected, actual, req keys..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9.5 text-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-2.5 hover:text-foreground text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center border rounded-lg overflow-hidden bg-accent/20 p-0.5 self-end sm:self-auto">
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === "table" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Table View
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === "kanban" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Kanban className="h-3.5 w-3.5" /> Kanban View
              </button>
            </div>
          </div>

          {/* Floating Bulk actions bar */}
          {selectedIds.size > 0 && (
            <div className="bg-gradient-to-r from-red-950 to-slate-900 text-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl border border-red-500/20 animate-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold">
                  {selectedIds.size}
                </span>
                <span className="text-sm font-semibold">bug reports selected</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTargetStatus("Open")
                    setShowBulkStatusModal(true)
                  }}
                  className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-white flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <Activity className="h-3.5 w-3.5" /> Update Status
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTargetAssignedTo("")
                    setShowBulkAssignModal(true)
                  }}
                  className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-white flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <User className="h-3.5 w-3.5" /> Assign To
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTargetPriorityLevel("Medium")
                    setShowBulkPriorityModal(true)
                  }}
                  className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-white flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Change Priority
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExecuteBulkExport}
                  className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-white flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <Download className="h-3.5 w-3.5" /> Export Selected
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Selected
                </Button>
                <button onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-white p-1 ml-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* Render Main Content */}
          {bugs.length === 0 ? (
            /* Contextual Smart Empty States */
            projectId && bugs.length === 0 ? (
              <div className="text-center border border-dashed rounded-2xl py-20 px-4 bg-card shadow-sm">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
                <h3 className="text-lg font-bold mb-1">No bugs reported for this project</h3>
                <p className="text-muted-foreground max-w-sm mx-auto text-xs mb-6">
                  This project has no active bug reports. Run automated checks or write one manually.
                </p>
                <div className="flex justify-center gap-2">
                  <Button onClick={() => { setCreateProjectId(projectId); setShowCreateModal(true) }} className="bg-red-600 hover:bg-red-700 text-white">
                    Create Bug
                  </Button>
                  <Button variant="outline" onClick={() => router.push(`/projects/${projectId}`)}>
                    View Project Dashboard
                  </Button>
                </div>
              </div>
            ) : debouncedSearch || severity || priority || status || environment || assignedTo ? (
              <div className="text-center border border-dashed rounded-2xl py-20 px-4 bg-card shadow-sm">
                <Search className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
                <h3 className="text-lg font-bold mb-1">No bugs match your filters</h3>
                <p className="text-muted-foreground max-w-sm mx-auto text-xs mb-6">
                  Try broadening your search term or clearing active status selectors.
                </p>
                <Button variant="outline" onClick={resetAllFilters}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div className="text-center border border-dashed rounded-2xl py-20 px-4 bg-card shadow-sm">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
                <h3 className="text-lg font-bold mb-1">No bug reports created yet</h3>
                <p className="text-muted-foreground max-w-sm mx-auto text-xs mb-6">
                  Bug reports will automatically appear when failed playwright test steps are converted, or you can record manual entries.
                </p>
                <div className="flex justify-center gap-2">
                  <Button onClick={() => setShowCreateModal(true)} className="bg-red-600 hover:bg-red-700 text-white">Create Bug</Button>
                  <Button variant="outline" onClick={() => router.push("/")}>Start Manual Session</Button>
                </div>
              </div>
            )
          ) : viewMode === "table" ? (
            /* Tabular Bug Reports list */
            <div className="border rounded-2xl overflow-hidden shadow-sm bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-accent/40 border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="p-4 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === bugs.length && bugs.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300 text-red-600 focus:ring-red-500 h-4 w-4 cursor-pointer"
                        />
                      </th>
                      <th className="p-4">Bug ID</th>
                      <th className="p-4">Title</th>
                      <th className="p-4">Project</th>
                      <th className="p-4">Severity / Priority</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Assigned To</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bugs.map((bug) => (
                      <tr key={bug.id} className="hover:bg-accent/20 transition-colors">
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(bug.id)}
                            onChange={() => toggleRowSelection(bug.id)}
                            className="rounded border-gray-300 text-red-600 focus:ring-red-500 h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-4 font-mono text-xs font-bold text-red-600 dark:text-red-400">
                          {bug.bugKey || "BUG-TEMP"}
                        </td>
                        <td className="p-4">
                          <div
                            className="font-semibold text-foreground cursor-pointer hover:text-red-600 transition-colors"
                            onClick={() => setQuickDetailId(bug.id)}
                          >
                            {bug.title}
                          </div>
                          
                          {/* Warnings & linked context badges */}
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {bug.requirements && bug.requirements.length > 0 && (
                              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 px-1.5 py-0.5 rounded font-medium">
                                Req: {bug.requirements.map((r) => r.requirement.requirementKey).join(", ")}
                              </span>
                            )}
                            {bug.testCase && (
                              <span className="text-[10px] bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 px-1.5 py-0.5 rounded font-medium">
                                TC: {bug.testCase.title}
                              </span>
                            )}
                            {bug.testRunId && (
                              <span className="text-[10px] bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50 px-1.5 py-0.5 rounded font-medium">
                                Fail Step Run
                              </span>
                            )}
                            
                            {/* Evidence indicators */}
                            <div className="flex items-center gap-1.5 ml-2 border-l pl-2 text-muted-foreground/60">
                              {bug.screenshotPath && <span title="Has Screenshot"><Eye className="h-3.5 w-3.5" /></span>}
                              {(bug.consoleLogs || bug.networkErrors) && <span title="Has logs"><Terminal className="h-3.5 w-3.5" /></span>}
                              {bug.bugAttachments.length > 0 && <span title="Has attachments"><Paperclip className="h-3.5 w-3.5" /></span>}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-xs font-semibold text-muted-foreground">
                          {bug.project?.name || "N/A"}
                          {bug.moduleRelation && (
                            <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                              {bug.moduleRelation.name}
                            </div>
                          )}
                        </td>
                        <td className="p-4 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground w-12 font-medium">Severity:</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                                bug.severity === "Critical" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                                bug.severity === "High" ? "bg-orange-500/10 text-orange-600 border-orange-500/20" :
                                bug.severity === "Medium" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                                "bg-slate-500/10 text-slate-600 border-slate-500/20"
                              }`}
                            >
                              {bug.severity}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground w-12 font-medium">Priority:</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                                bug.priority === "Critical" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                                bug.priority === "High" ? "bg-orange-500/10 text-orange-600 border-orange-500/20" :
                                bug.priority === "Medium" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                                "bg-slate-500/10 text-slate-600 border-slate-500/20"
                              }`}
                            >
                              {bug.priority}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                              ["Open", "Reopened"].includes(bug.status) ? "bg-red-500/10 text-red-600 border-red-500/20" :
                              bug.status === "InProgress" ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" :
                              bug.status === "ReadyForRetest" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                              ["Resolved", "Closed"].includes(bug.status) ? "bg-green-500/10 text-green-600 border-green-500/20" :
                              "bg-slate-500/10 text-slate-600 border-slate-500/20"
                            }`}
                          >
                            {bug.status}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-semibold text-foreground/80">
                          {bug.assignedTo ? (
                            <div className="flex items-center gap-1.5">
                              <span className="h-5 w-5 rounded-full bg-indigo-500/15 text-indigo-600 flex items-center justify-center font-bold text-[9px] uppercase">
                                {bug.assignedTo.substring(0, 2)}
                              </span>
                              <span>{bug.assignedTo}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground font-normal italic">Unassigned</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              title="Triage Details"
                              onClick={() => setQuickDetailId(bug.id)}
                            >
                              <Eye className="h-4 w-4 text-indigo-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              title="Download Markdown"
                              onClick={() => handleExportBugToMarkdown(bug)}
                            >
                              <Download className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              title="Delete report"
                              onClick={() => handleDeleteBug(bug)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive hover:bg-destructive/10" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginated Footer */}
              <div className="px-6 py-4 border-t flex items-center justify-between text-xs font-semibold text-muted-foreground bg-accent/10">
                <div>
                  Showing {Math.min(totalBugsCount, (page - 1) * pageSize + 1)} - {Math.min(totalBugsCount, page * pageSize)} of {totalBugsCount} bugs
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span>Rows:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setPage(1)
                      }}
                      className="bg-transparent border border-muted-foreground/30 rounded p-1"
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </div>

                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)} className="h-8">
                      Prev
                    </Button>
                    <Button variant="outline" size="sm" disabled={page * pageSize >= totalBugsCount} onClick={() => setPage(page + 1)} className="h-8">
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Kanban Board Triage View */
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start overflow-x-auto min-h-[60vh] pb-4">
              
              {/* Kanban status columns */}
              {(["Open", "InProgress", "ReadyForRetest", "Reopened", "Resolved", "Closed"] as const).map((colStatus) => {
                const colBugs = bugs.filter((b) => b.status === colStatus)
                
                // Color mapping per column
                const colColors = {
                  Open: "border-t-red-500 bg-red-500/[0.02]",
                  InProgress: "border-t-indigo-500 bg-indigo-500/[0.02]",
                  ReadyForRetest: "border-t-amber-500 bg-amber-500/[0.02]",
                  Reopened: "border-t-red-700 bg-red-700/[0.02]",
                  Resolved: "border-t-emerald-500 bg-emerald-500/[0.02]",
                  Closed: "border-t-green-600 bg-green-600/[0.02]"
                }

                const displayNames = {
                  Open: "Open",
                  InProgress: "In Progress",
                  ReadyForRetest: "Retest Ready",
                  Reopened: "Reopened",
                  Resolved: "Resolved",
                  Closed: "Closed"
                }

                return (
                  <div
                    key={colStatus}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, colStatus)}
                    className={`border-t-4 border rounded-2xl p-3 shadow-sm min-h-[500px] flex flex-col space-y-3 ${colColors[colStatus]}`}
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                        {displayNames[colStatus]}
                      </span>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold">
                        {colBugs.length}
                      </span>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto">
                      {colBugs.map((bug) => (
                        <div
                          key={bug.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, bug.id)}
                          onClick={() => setQuickDetailId(bug.id)}
                          className="p-3 border rounded-xl bg-card shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing hover:border-indigo-300 dark:hover:border-indigo-900 transition-all space-y-2.5 animate-in fade-in duration-100"
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span className="font-mono text-[10px] font-extrabold text-red-600 dark:text-red-400">
                              {bug.bugKey || "BUG-TEMP"}
                            </span>
                            
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase border ${
                                bug.severity === "Critical" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                                bug.severity === "High" ? "bg-orange-500/10 text-orange-600 border-orange-500/20" :
                                "bg-slate-500/10 text-slate-600 border-slate-500/20"
                              }`}
                            >
                              {bug.severity}
                            </span>
                          </div>

                          <h4 className="font-bold text-xs leading-normal text-foreground break-words line-clamp-2">
                            {bug.title}
                          </h4>

                          <p className="text-[10px] text-muted-foreground font-semibold truncate">
                            Project: {bug.project?.name || "N/A"}
                          </p>

                          <div className="flex items-center justify-between border-t pt-2 mt-2">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              {bug.screenshotPath && <Eye className="h-3 w-3" />}
                              {(bug.consoleLogs || bug.networkErrors) && <Terminal className="h-3 w-3" />}
                              {bug.bugAttachments.length > 0 && <Paperclip className="h-3 w-3" />}
                            </div>
                            
                            {bug.assignedTo ? (
                              <span className="text-[9px] font-bold bg-indigo-500/15 text-indigo-600 border px-1.5 py-0.5 rounded truncate max-w-[80px]">
                                {bug.assignedTo}
                              </span>
                            ) : (
                              <span className="text-[9px] italic text-muted-foreground">Unassigned</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </div>

      {/* 3. CREATE NEW BUG MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-accent/20">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Plus className="h-5 w-5 text-red-600" /> Report Manual Bug
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewBug} className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Project Select */}
              <div className="space-y-2">
                <Label htmlFor="create-bug-project" className="font-bold">Target Project *</Label>
                <select
                  id="create-bug-project"
                  required
                  value={createProjectId}
                  onChange={(e) => {
                    setCreateProjectId(e.target.value)
                    setCreateModuleId("")
                    setCreateFeatureId("")
                    setCreateComponentId("")
                    setCreateTestCaseId("")
                    setCreateRequirementIds([])
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">-- Choose Project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {createProjectId && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="create-bug-title" className="font-bold">Bug Title *</Label>
                      <Input
                        id="create-bug-title"
                        required
                        placeholder="e.g. Navigation failure on login submission"
                        value={createTitle}
                        onChange={(e) => setCreateTitle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-bug-sev" className="font-bold">Severity</Label>
                      <select
                        id="create-bug-sev"
                        value={createSeverity}
                        onChange={(e) => setCreateSeverity(e.target.value as any)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-bug-pri" className="font-bold">Priority</Label>
                      <select
                        id="create-bug-pri"
                        value={createPriority}
                        onChange={(e) => setCreatePriority(e.target.value as any)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-bug-env" className="font-bold">Environment</Label>
                      <select
                        id="create-bug-env"
                        value={createEnvironment}
                        onChange={(e) => setCreateEnvironment(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="Dev">Dev</option>
                        <option value="Staging">Staging</option>
                        <option value="UAT">UAT</option>
                        <option value="Production">Production</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-bug-assign" className="font-bold">Assign To</Label>
                      <select
                        id="create-bug-assign"
                        value={createAssignedTo}
                        onChange={(e) => setCreateAssignedTo(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="">-- Unassigned --</option>
                        <option value="sabrymohsen">sabrymohsen</option>
                        <option value="developer1">developer1</option>
                        <option value="developer2">developer2</option>
                      </select>
                    </div>
                  </div>

                  {/* Hierarchy Drill selector */}
                  <div className="border p-5 rounded-2xl bg-accent/5 space-y-3 shadow-sm border-accent/20">
                    <h3 className="font-bold text-xs text-red-600 dark:text-red-400 uppercase tracking-wider">Suite Hierarchy</h3>
                    <HierarchySelector
                      projectId={createProjectId}
                      moduleId={createModuleId}
                      onChangeModuleId={setCreateModuleId}
                      featureId={createFeatureId}
                      onChangeFeatureId={setCreateFeatureId}
                      componentId={createComponentId}
                      onChangeComponentId={setCreateComponentId}
                    />
                  </div>

                  {/* Link test runs / test cases */}
                  <div className="grid grid-cols-2 gap-4 border p-4 rounded-2xl bg-accent/5 border-accent/10">
                    <div className="space-y-2">
                      <Label htmlFor="create-bug-tc" className="font-bold">Link Test Case</Label>
                      <select
                        id="create-bug-tc"
                        value={createTestCaseId}
                        onChange={(e) => setCreateTestCaseId(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="">-- None --</option>
                        {projectTestCases.map((tc) => (
                          <option key={tc.id} value={tc.id}>{tc.title}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-bold">Link Requirements</Label>
                      <LinkedRequirementsSelector
                        projectId={createProjectId}
                        selectedIds={createRequirementIds}
                        onChange={setCreateRequirementIds}
                      />
                    </div>
                  </div>

                  {/* Steps details */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-bug-steps" className="font-bold">Steps to Reproduce</Label>
                      <textarea
                        id="create-bug-steps"
                        rows={3}
                        placeholder="1. Go to Login page&#10;2. Input dummy keys&#10;3. Press login button"
                        value={createSteps}
                        onChange={(e) => setCreateSteps(e.target.value)}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="create-bug-exp" className="font-bold">Expected Outcome</Label>
                        <textarea
                          id="create-bug-exp"
                          rows={2}
                          value={createExpected}
                          onChange={(e) => setCreateExpected(e.target.value)}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="create-bug-act" className="font-bold">Actual Outcome</Label>
                        <textarea
                          id="create-bug-act"
                          rows={2}
                          value={createActual}
                          onChange={(e) => setCreateActual(e.target.value)}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {createError && <p className="text-sm text-destructive font-semibold">{createError}</p>}
            </form>

            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-accent/10">
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button onClick={handleSaveNewBug} disabled={createSaving || !createProjectId} className="bg-red-600 hover:bg-red-700 text-white">
                {createSaving ? "Saving..." : "Save Bug Report"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 4. QUICK EDIT DRAWER */}
      {quickDetailId && detailBug && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setQuickDetailId(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-background shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-200">
            
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b flex items-center justify-between bg-accent/20">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span className="font-mono text-red-600 dark:text-red-400">{detailBug.bugKey || "BUG"}</span>
                  <span className="text-muted-foreground/60 border-l pl-2">{editTitle.substring(0, 30)}{editTitle.length > 30 ? "..." : ""}</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Global project triage console</p>
              </div>
              <button onClick={() => setQuickDetailId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Toggles */}
            <div className="flex border-b bg-accent/10 px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {(["overview", "steps", "evidence", "logs", "activity"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveDetailTab(tab); setAiSuggestion("") }}
                  className={`px-3 py-3 border-b-2 transition-all ${
                    activeDetailTab === tab ? "border-red-500 text-foreground" : "border-transparent hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <RefreshCw className="h-8 w-8 text-red-500 animate-spin mb-3" />
                  <p className="text-xs font-semibold text-muted-foreground">Loading details...</p>
                </div>
              ) : (
                <>
                  {/* TAB 1: OVERVIEW SETTINGS */}
                  {activeDetailTab === "overview" && (
                    <form onSubmit={handleSaveBugEdit} className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2">
                          <Label htmlFor="edit-bug-title" className="font-bold">Bug Title *</Label>
                          <Input
                            id="edit-bug-title"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-bug-sev" className="font-bold">Severity</Label>
                          <select
                            id="edit-bug-sev"
                            value={editSeverity}
                            onChange={(e) => setEditSeverity(e.target.value as any)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-bug-pri" className="font-bold">Priority</Label>
                          <select
                            id="edit-bug-pri"
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value as any)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-bug-status" className="font-bold">Triage Status</Label>
                          <select
                            id="edit-bug-status"
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none text-red-600 font-bold"
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

                        <div className="space-y-2">
                          <Label htmlFor="edit-bug-env" className="font-bold">Environment</Label>
                          <select
                            id="edit-bug-env"
                            value={editEnvironment}
                            onChange={(e) => setEditEnvironment(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                          >
                            <option value="Dev">Dev</option>
                            <option value="Staging">Staging</option>
                            <option value="UAT">UAT</option>
                            <option value="Production">Production</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-bug-assign" className="font-bold">Assigned Developer</Label>
                          <select
                            id="edit-bug-assign"
                            value={editAssignedTo}
                            onChange={(e) => setEditAssignedTo(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                          >
                            <option value="">-- Unassigned --</option>
                            <option value="sabrymohsen">sabrymohsen</option>
                            <option value="developer1">developer1</option>
                            <option value="developer2">developer2</option>
                          </select>
                        </div>
                      </div>

                      {/* Hierarchy drilling */}
                      <div className="border p-5 rounded-2xl bg-accent/5 space-y-3 shadow-sm border-accent/20">
                        <h3 className="font-bold text-xs text-red-600 dark:text-red-400 uppercase tracking-wider">Hierarchy Node</h3>
                        <HierarchySelector
                          projectId={detailBug.projectId || ""}
                          moduleId={editModuleId}
                          onChangeModuleId={setEditModuleId}
                          featureId={editFeatureId}
                          onChangeFeatureId={setEditFeatureId}
                          componentId={editComponentId}
                          onChangeComponentId={setEditComponentId}
                        />
                      </div>

                      {/* Linked TestCase Requirement */}
                      <LinkedRequirementsSelector
                        projectId={detailBug.projectId || ""}
                        selectedIds={editRequirementIds}
                        onChange={setEditRequirementIds}
                      />

                      {/* Link pointer metadata */}
                      <div className="grid grid-cols-2 gap-4 border p-4 rounded-xl bg-accent/5 text-xs text-muted-foreground border-accent/10">
                        <div>
                          <strong className="text-foreground">Created From failed step:</strong>{" "}
                          {detailBug.testRunId ? (
                            <span className="font-medium text-indigo-600">Failed Playwright Automation Run</span>
                          ) : (
                            <span>Manual QA input</span>
                          )}
                        </div>
                        {detailBug.testRun?.browserType && (
                          <div>
                            <strong className="text-foreground">Device/Browser:</strong> {detailBug.testRun.browserType} ({detailBug.viewport || "Desktop"})
                          </div>
                        )}
                        {detailBug.roleUsed && (
                          <div className="col-span-2 mt-1">
                            <strong className="text-foreground">Login Role Session:</strong> {detailBug.roleUsed}
                          </div>
                        )}
                      </div>

                      {editError && <p className="text-sm text-destructive font-semibold">{editError}</p>}
                      
                      <div className="flex gap-2">
                        <Button type="submit" disabled={editSaving} className="bg-red-600 hover:bg-red-700 text-white">
                          {editSaving ? "Saving..." : "Save Overview"}
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* TAB 2: STEPS & OUTCOMES */}
                  {activeDetailTab === "steps" && (
                    <form onSubmit={handleSaveBugEdit} className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="edit-bug-steps" className="font-bold">Steps to Reproduce</Label>
                        <textarea
                          id="edit-bug-steps"
                          rows={6}
                          value={editSteps}
                          onChange={(e) => setEditSteps(e.target.value)}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-bug-exp" className="font-bold">Expected Outcome</Label>
                          <textarea
                            id="edit-bug-exp"
                            rows={3}
                            value={editExpected}
                            onChange={(e) => setEditExpected(e.target.value)}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-bug-act" className="font-bold">Actual Outcome</Label>
                          <textarea
                            id="edit-bug-act"
                            rows={3}
                            value={editActual}
                            onChange={(e) => setEditActual(e.target.value)}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                          />
                        </div>
                      </div>

                      {editError && <p className="text-sm text-destructive font-semibold">{editError}</p>}

                      <Button type="submit" disabled={editSaving} className="bg-red-600 hover:bg-red-700 text-white">
                        {editSaving ? "Saving..." : "Save Reproduction details"}
                      </Button>
                    </form>
                  )}

                  {/* TAB 3: EVIDENCE & ATTACHMENTS & COMMENTS */}
                  {activeDetailTab === "evidence" && (
                    <div className="space-y-8">
                      {/* Screenshots */}
                      <div className="space-y-2">
                        <h4 className="font-bold text-sm">Screenshots Gallery</h4>
                        {detailBug.screenshotPath ? (
                          <div className="border rounded-xl overflow-hidden max-w-sm bg-accent/20">
                            <img src={detailBug.screenshotPath} alt="Bug evidence" className="w-full h-auto object-cover max-h-56" />
                            <div className="p-2.5 text-xs text-muted-foreground font-semibold flex items-center justify-between">
                              <span>evidence_screenshot.png</span>
                              <a href={detailBug.screenshotPath} target="_blank" className="text-indigo-600 hover:underline">View Full</a>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No evidence screenshots attached.</p>
                        )}
                      </div>

                      {/* File attachments */}
                      <div className="space-y-3">
                        <h4 className="font-bold text-sm">Attached Files ({detailBug.bugAttachments?.length || 0})</h4>
                        {detailBug.bugAttachments && detailBug.bugAttachments.length > 0 ? (
                          <div className="divide-y border rounded-xl overflow-hidden bg-card text-xs">
                            {detailBug.bugAttachments.map((att: BugAttachment) => (
                              <div key={att.id} className="p-3 flex items-center justify-between hover:bg-accent/40">
                                <div className="flex items-center gap-2">
                                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <div className="font-semibold">{att.fileName}</div>
                                    <div className="text-[10px] text-muted-foreground">{att.fileType}</div>
                                  </div>
                                </div>
                                <a href={att.filePath} target="_blank" className="text-indigo-600 hover:underline">Download</a>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No file attachments.</p>
                        )}

                        {/* Inline Attachment mock creator */}
                        <form onSubmit={handleAddAttachment} className="border p-4 rounded-xl bg-accent/5 space-y-3">
                          <h5 className="font-bold text-xs">Attach screenshot or file</h5>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder="fileName e.g. error.png"
                              value={attachmentName}
                              onChange={(e) => setAttachmentName(e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Input
                              placeholder="Path e.g. /evidence/1.png"
                              value={attachmentPath}
                              onChange={(e) => setAttachmentPath(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <Button size="sm" type="submit" disabled={attachmentSaving || !attachmentName || !attachmentPath} className="h-8">
                            Attach File
                          </Button>
                        </form>
                      </div>

                      {/* Comments */}
                      <div className="space-y-4 border-t pt-6">
                        <h4 className="font-bold text-sm flex items-center gap-1.5">
                          <MessageSquare className="h-4.5 w-4.5 text-indigo-500" /> Comments feed ({detailBug.comments?.length || 0})
                        </h4>

                        <form onSubmit={handleAddComment} className="space-y-2">
                          <textarea
                            placeholder="Add a triage comment..."
                            rows={2}
                            value={newCommentText}
                            onChange={(e) => setNewCommentText(e.target.value)}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none"
                          />
                          <Button size="sm" type="submit" disabled={commentSaving || !newCommentText.trim()}>
                            Add Comment
                          </Button>
                        </form>

                        <div className="space-y-3 mt-4">
                          {detailBug.comments && detailBug.comments.length > 0 ? (
                            detailBug.comments.map((c: BugComment) => (
                              <div key={c.id} className="p-3 bg-accent/10 border rounded-xl space-y-1 text-xs">
                                <div className="flex justify-between font-bold text-muted-foreground text-[10px]">
                                  <span>Triage user</span>
                                  <span>{new Date(c.createdAt).toLocaleString()}</span>
                                </div>
                                <p className="text-foreground leading-relaxed break-words">{c.comment}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No triage comments yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: SYSTEM ERROR LOGS & AI ASSISTANCE */}
                  {activeDetailTab === "logs" && (
                    <div className="space-y-6">
                      
                      {/* AI Assistance Section */}
                      <div className="border border-red-500/20 bg-gradient-to-br from-red-500/[0.02] to-indigo-500/[0.02] p-5 rounded-2xl space-y-4">
                        <h4 className="font-extrabold text-sm flex items-center gap-1.5 text-foreground">
                          <Sparkles className="h-4.5 w-4.5 text-red-500" /> AI Triage Assistant
                        </h4>
                        
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => triggerAiAssistance("suggest-title")}
                            disabled={aiAssistanceRunning}
                            className="text-xs flex items-center gap-1 bg-background"
                          >
                            Suggest Title
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => triggerAiAssistance("rewrite-steps")}
                            disabled={aiAssistanceRunning}
                            className="text-xs flex items-center gap-1 bg-background"
                          >
                            Clean Steps
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => triggerAiAssistance("suggest-severity")}
                            disabled={aiAssistanceRunning}
                            className="text-xs flex items-center gap-1 bg-background"
                          >
                            Suggest Severity
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => triggerAiAssistance("summarize-logs")}
                            disabled={aiAssistanceRunning}
                            className="text-xs flex items-center gap-1 bg-background"
                          >
                            Summarize Logs
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => triggerAiAssistance("developer-summary")}
                            disabled={aiAssistanceRunning}
                            className="text-xs flex items-center gap-1 bg-background"
                          >
                            Developer Summary
                          </Button>
                        </div>

                        {aiAssistanceRunning && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <RefreshCw className="h-4.5 w-4.5 animate-spin text-red-500" />
                            <span>AI triaging logs and details...</span>
                          </div>
                        )}

                        {aiSuggestion && (
                          <div className="p-4 border rounded-xl bg-background shadow-inner space-y-3">
                            <h5 className="font-bold text-xs text-indigo-600 flex items-center gap-1">
                              <Cpu className="h-4 w-4" /> AI Suggestion:
                            </h5>
                            <pre className="text-xs font-mono bg-accent/20 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-56">
                              {aiSuggestion}
                            </pre>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => applyAiSuggestion("title")} className="text-[11px] h-8 bg-indigo-600 text-white">
                                Apply to Title
                              </Button>
                              <Button size="sm" onClick={() => applyAiSuggestion("steps")} className="text-[11px] h-8 bg-indigo-600 text-white">
                                Apply to Steps
                              </Button>
                              <Button size="sm" onClick={() => applyAiSuggestion("severity")} className="text-[11px] h-8 bg-indigo-600 text-white">
                                Apply to Severity
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setAiSuggestion("")} className="text-[11px] h-8">
                                Dismiss
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Raw Logs */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="font-bold flex items-center gap-1"><Terminal className="h-4 w-4" /> Browser Console Logs</Label>
                          <pre className="text-xs font-mono p-4 border rounded-xl bg-card overflow-x-auto max-h-56 whitespace-pre">
                            {detailBug.consoleLogs || "No logs captured."}
                          </pre>
                        </div>

                        <div className="space-y-2">
                          <Label className="font-bold flex items-center gap-1"><Terminal className="h-4 w-4" /> Network Errors</Label>
                          <pre className="text-xs font-mono p-4 border rounded-xl bg-card overflow-x-auto max-h-56 whitespace-pre">
                            {detailBug.networkErrors || "No network failures."}
                          </pre>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* TAB 5: AUDIT LOGS ACTIVITY */}
                  {activeDetailTab === "activity" && (
                    <div className="space-y-4">
                      <h4 className="font-bold text-sm flex items-center gap-1.5"><Activity className="h-4.5 w-4.5 text-muted-foreground" /> Audit Trail History</h4>
                      
                      <div className="relative border-l pl-5 ml-2 space-y-5">
                        {detailBug.activities && detailBug.activities.length > 0 ? (
                          detailBug.activities.map((act: BugActivity) => (
                            <div key={act.id} className="relative text-xs">
                              <span className="absolute -left-[25px] top-1 flex h-2.5 w-2.5 rounded-full bg-red-500" />
                              <div className="font-bold text-foreground flex items-center justify-between">
                                <span>{act.action}</span>
                                <span className="text-[10px] text-muted-foreground font-normal">{new Date(act.createdAt).toLocaleString()}</span>
                              </div>
                              {act.details && (
                                <p className="text-muted-foreground mt-1 leading-relaxed break-words">{act.details}</p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No lifecycle updates recorded yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="px-6 py-4 border-t flex justify-between items-center bg-accent/10">
              <Button variant="ghost" size="sm" onClick={() => handleExportBugToMarkdown(detailBug)} className="text-xs">
                <Download className="h-4 w-4 mr-1.5" /> Markdown Report
              </Button>
              
              <Button variant="outline" onClick={() => setQuickDetailId(null)}>Close drawer</Button>
            </div>

          </div>
        </>
      )}

      {/* 10. BULK STATUS UPDATER MODAL */}
      {showBulkStatusModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-1.5">
              <Activity className="h-5 w-5 text-indigo-500" /> Change Status For Selected
            </h3>

            <div className="space-y-2">
              <Label htmlFor="bulk-target-status">Select New Status</Label>
              <select
                id="bulk-target-status"
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
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

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowBulkStatusModal(false)}>Cancel</Button>
              <Button size="sm" disabled={bulkSaving} onClick={handleExecuteBulkStatus} className="bg-red-600 hover:bg-red-700 text-white">
                {bulkSaving ? "Saving..." : "Update Statuses"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 11. BULK ASSIGN UPDATER MODAL */}
      {showBulkAssignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-1.5">
              <User className="h-5 w-5 text-indigo-500" /> Assign Selected Bugs To Developer
            </h3>

            <div className="space-y-2">
              <Label htmlFor="bulk-target-assign">Select Developer</Label>
              <select
                id="bulk-target-assign"
                value={targetAssignedTo}
                onChange={(e) => setTargetAssignedTo(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">-- Unassign --</option>
                <option value="sabrymohsen">sabrymohsen</option>
                <option value="developer1">developer1</option>
                <option value="developer2">developer2</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowBulkAssignModal(false)}>Cancel</Button>
              <Button size="sm" disabled={bulkSaving} onClick={handleExecuteBulkAssign} className="bg-red-600 hover:bg-red-700 text-white">
                {bulkSaving ? "Saving..." : "Re-assign"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 12. BULK PRIORITY UPDATER MODAL */}
      {showBulkPriorityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-1.5">
              <SlidersHorizontal className="h-5 w-5 text-indigo-500" /> Set Priority For Selected
            </h3>

            <div className="space-y-2">
              <Label htmlFor="bulk-target-pri">Select Priority level</Label>
              <select
                id="bulk-target-pri"
                value={targetPriorityLevel}
                onChange={(e) => setTargetPriorityLevel(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowBulkPriorityModal(false)}>Cancel</Button>
              <Button size="sm" disabled={bulkSaving} onClick={handleExecuteBulkPriority} className="bg-red-600 hover:bg-red-700 text-white">
                {bulkSaving ? "Saving..." : "Change Priorities"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
