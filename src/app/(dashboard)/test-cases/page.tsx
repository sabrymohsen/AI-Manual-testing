"use client"

import { useEffect, useState, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StepBuilder } from "@/components/test-cases/step-builder"
import { HierarchySelector } from "@/components/hierarchy/hierarchy-selector"
import { LinkedRequirementsSelector } from "@/components/test-cases/linked-requirements-selector"
import { ImportModal } from "@/components/test-cases/import-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
  FolderOpen,
  Loader2
} from "lucide-react"

// Types matching Prisma models
interface TestStep {
  actionDescription: string
  expectedResult: string
  actionType: string
  targetType: string
  targetValue: string
  inputValue: string
  timeoutMs: number
  assertions: any[]
}

interface Project {
  id: string
  name: string
  environment: string
  browserType: string
  viewport: string
  credentials: Array<{
    id: string
    roleName: string
    username: string
  }>
}

interface ActiveRun {
  testRunId: string
  projectId: string
  status: string
  currentStep: number | null
  totalSteps: number
}

interface TestCase {
  id: string
  title: string
  module: string | null
  priority: string
  preconditions: string | null
  source: string
  projectId: string
  project: {
    id: string
    name: string
    browserType?: string
    viewport?: string
    environment?: string
  }
  moduleRelation?: { id: string; name: string } | null
  feature?: { id: string; name: string } | null
  component?: { id: string; name: string } | null
  requirements?: Array<{ id: string; requirementKey: string; title: string }>
  warnings: string[]
  lastRunStatus: string
  lastRunDate: string | null
  stepsCount: number
  createdAt: string
  activeRun?: ActiveRun | null
}

function TestCasesHubContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Base data states
  const [projects, setProjects] = useState<Project[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // Filter and pagination states
  const [projectId, setProjectId] = useState<string>(searchParams.get("projectId") || "")
  const [moduleId, setModuleId] = useState<string>("")
  const [featureId, setFeatureId] = useState<string>("")
  const [componentId, setComponentId] = useState<string>("")
  const [priority, setPriority] = useState<string>("")
  const [source, setSource] = useState<string>("")
  const [lastRunStatus, setLastRunStatus] = useState<string>("")
  const [requirementLinked, setRequirementLinked] = useState<string>("")
  const [hasBug, setHasBug] = useState<string>("")
  const [incomplete, setIncomplete] = useState<string>("")
  const [search, setSearch] = useState<string>("")
  const [debouncedSearch, setDebouncedSearch] = useState<string>("")
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const [sortBy, setSortBy] = useState<string>("createdAt")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  // Metric counts (returned from server API)
  const [summary, setSummary] = useState({
    total: 0,
    passed: 0,
    failed: 0,
    notExecuted: 0,
    highPriority: 0,
    unassigned: 0
  })

  // Selected row tracking
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // View toggle
  const [viewMode, setViewMode] = useState<"table" | "hierarchy">("table")

  // Dynamic dropdown options for the selected project
  const [hierarchyData, setHierarchyData] = useState<any[]>([])

  // Modal / Drawer visibility states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportProjectSelectModal, setShowImportProjectSelectModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importProjectId, setImportProjectId] = useState("")
  const [showBulkRunModal, setShowBulkRunModal] = useState(false)
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false)
  const [showBulkPriorityModal, setShowBulkPriorityModal] = useState(false)
  const [quickEditId, setQuickEditId] = useState<string | null>(null)

  // Permanent delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null)
  const [deleteTypedTitle, setDeleteTypedTitle] = useState("")
  const [deleteRunCount, setDeleteRunCount] = useState(0)
  const [deleteBugCount, setDeleteBugCount] = useState(0)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)

  // Active run tracking
  const [activeRuns, setActiveRuns] = useState<Map<string, ActiveRun>>(new Map())

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Create Test Case states
  const [createProjectId, setCreateProjectId] = useState("")
  const [createTitle, setCreateTitle] = useState("")
  const [createPriority, setCreatePriority] = useState("Medium")
  const [createPreconditions, setCreatePreconditions] = useState("")
  const [createModuleId, setCreateModuleId] = useState("")
  const [createFeatureId, setCreateFeatureId] = useState("")
  const [createComponentId, setCreateComponentId] = useState("")
  const [createRequirementIds, setCreateRequirementIds] = useState<string[]>([])
  const [createSteps, setCreateSteps] = useState<TestStep[]>([])
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState("")

  // Quick Edit states (in drawer)
  const [editTitle, setEditTitle] = useState("")
  const [editPriority, setEditPriority] = useState("Medium")
  const [editPreconditions, setEditPreconditions] = useState("")
  const [editModuleId, setEditModuleId] = useState("")
  const [editFeatureId, setEditFeatureId] = useState("")
  const [editComponentId, setEditComponentId] = useState("")
  const [editRequirementIds, setEditRequirementIds] = useState<string[]>([])
  const [editSteps, setEditSteps] = useState<TestStep[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState("")

  // Duplicate warning states
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<any>(null)
  const [bypassDuplicateCheck, setBypassDuplicateCheck] = useState(false)

  // Execution config state for bulk runs
  const [bulkMode, setBulkMode] = useState<"Manual Session" | "Automated Run">("Automated Run")
  const [bulkBrowser, setBulkBrowser] = useState("Chromium")
  const [bulkViewport, setBulkViewport] = useState("Desktop")
  const [bulkEnvironment, setBulkEnvironment] = useState("Staging")
  const [bulkCredentialId, setBulkCredentialId] = useState("")
  const [bulkSessionName, setBulkSessionName] = useState("")
  const [bulkRunning, setBulkRunning] = useState(false)

  // Move config state for bulk moves
  const [moveProjectId, setMoveProjectId] = useState("")
  const [moveModuleId, setMoveModuleId] = useState("")
  const [moveFeatureId, setMoveFeatureId] = useState("")
  const [moveComponentId, setMoveComponentId] = useState("")
  const [moveHierarchyData, setMoveHierarchyData] = useState<any[]>([])
  const [moveSaving, setMoveSaving] = useState(false)

  // Priority config state for bulk priority
  const [targetPriority, setTargetPriority] = useState("Medium")
  const [prioritySaving, setPrioritySaving] = useState(false)

  // Recorder global modal states
  const [showRecorderModal, setShowRecorderModal] = useState(false)
  const [recorderProjectId, setRecorderProjectId] = useState("")
  const [recorderTitle, setRecorderTitle] = useState("")
  const [recorderStartUrl, setRecorderStartUrl] = useState("")
  const [recorderModuleId, setRecorderModuleId] = useState("")
  const [recorderFeatureId, setRecorderFeatureId] = useState("")
  const [recorderComponentId, setRecorderComponentId] = useState("")
  const [recorderCredentialId, setRecorderCredentialId] = useState("")
  const [recorderPriority, setRecorderPriority] = useState("Medium")
  const [recorderPreconditions, setRecorderPreconditions] = useState("")
  const [recorderBrowserType, setRecorderBrowserType] = useState<"Chromium" | "Firefox" | "WebKit">("Chromium")
  const [recorderViewport, setRecorderViewport] = useState<"Desktop" | "Tablet" | "Mobile" | "Custom">("Desktop")
  const [recorderMode, setRecorderMode] = useState<"Fast" | "Detailed" | "Assertion">("Fast")

  const [recorderLoadingConfig, setRecorderLoadingConfig] = useState(false)
  const [recorderProjectConfig, setRecorderProjectConfig] = useState<{
    project: { id: string; name: string; baseUrl: string | null }
    environments: string[]
    credentials: Array<{ id: string; roleName: string; username: string }>
    modules: Array<{ id: string; name: string }>
    features: Array<{ id: string; name: string; moduleId: string }>
    components: Array<{ id: string; name: string; featureId: string }>
  } | null>(null)

  const [activeSessionInfo, setActiveSessionInfo] = useState<any>(null)
  const [recorderStarting, setRecorderStarting] = useState(false)
  const [recorderStartError, setRecorderStartError] = useState("")
  const [recorderLaunchStatus, setRecorderLaunchStatus] = useState("")

  // Hierarchy tree view state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Search debounce handler
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset module/feature/component filters if projectId changes
  useEffect(() => {
    setModuleId("")
    setFeatureId("")
    setComponentId("")
  }, [projectId])

  // Load configuration for the selected project in recorder modal
  useEffect(() => {
    if (!recorderProjectId) {
      setRecorderProjectConfig(null)
      setActiveSessionInfo(null)
      setRecorderStartUrl("")
      return
    }

    setRecorderLoadingConfig(true)
    setRecorderStartError("")
    
    // Fetch project's recording configuration and active session status
    Promise.all([
      fetch(`/api/projects/${recorderProjectId}/recording-config`).then((res) => {
        if (!res.ok) throw new Error("Failed to load project config")
        return res.json()
      }),
      fetch(`/api/recording/sessions/active?projectId=${recorderProjectId}`).then((res) => {
        if (!res.ok) throw new Error("Failed to check active sessions")
        return res.json()
      })
    ])
      .then(([configData, activeSessionData]) => {
        setRecorderProjectConfig(configData)
        setRecorderStartUrl(configData.project?.baseUrl || "")
        setActiveSessionInfo(activeSessionData.session || null)
      })
      .catch((err) => {
        console.error(err)
        setRecorderStartError("Failed to fetch project configuration details.")
      })
      .finally(() => {
        setRecorderLoadingConfig(false)
      })
  }, [recorderProjectId])

  async function handleCancelActiveSession() {
    if (!activeSessionInfo) return
    setRecorderLoadingConfig(true)
    setRecorderStartError("")
    try {
      const res = await fetch(`/api/recording/${activeSessionInfo.id}/cancel`, {
        method: "POST"
      })
      if (res.ok) {
        setActiveSessionInfo(null)
        setToast({ message: "Active recording session cancelled successfully.", type: "success" })
      } else {
        const data = await res.json()
        setRecorderStartError(data.error || "Failed to cancel active session.")
      }
    } catch {
      setRecorderStartError("Network error cancelling session.")
    } finally {
      setRecorderLoadingConfig(false)
    }
  }

  async function handleStartRecorderSession(e: React.FormEvent) {
    e.preventDefault()
    if (!recorderProjectId) return
    if (!recorderTitle.trim()) {
      setRecorderStartError("Test case title is required")
      return
    }
    if (!recorderStartUrl.trim()) {
      setRecorderStartError("Target URL is required")
      return
    }

    setRecorderStarting(true)
    setRecorderStartError("")
    setRecorderLaunchStatus("Validating inputs...")

    // Simulate logs sequence
    const statuses = [
      "Checking project permissions...",
      "Creating recording session...",
      "Launching external Playwright browser...",
      "Injecting recorder toolbar..."
    ]

    let currentLogIndex = 0
    const logInterval = setInterval(() => {
      if (currentLogIndex < statuses.length) {
        setRecorderLaunchStatus(statuses[currentLogIndex])
        currentLogIndex++
      }
    }, 1500)

    try {
      const body = {
        projectId: recorderProjectId,
        title: recorderTitle,
        moduleId: recorderModuleId || null,
        featureId: recorderFeatureId || null,
        componentId: recorderComponentId || null,
        priority: recorderPriority,
        preconditions: recorderPreconditions || null,
        requiredCredentialId: recorderCredentialId || null,
        startUrl: recorderStartUrl,
        browserType: recorderBrowserType,
        viewport: recorderViewport,
        recordingMode: recorderMode,
      }

      const res = await fetch("/api/recording/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      clearInterval(logInterval)

      if (res.ok) {
        setRecorderLaunchStatus("Success! Redirecting to workspace...")
        setTimeout(() => {
          setShowRecorderModal(false)
          setRecorderProjectId("")
          setRecorderTitle("")
          setRecorderStartUrl("")
          setRecorderModuleId("")
          setRecorderFeatureId("")
          setRecorderComponentId("")
          setRecorderCredentialId("")
          setRecorderPreconditions("")
          setRecorderStarting(false)
          router.push(`/projects/${recorderProjectId}/record`)
        }, 1000)
      } else {
        const data = await res.json()
        setRecorderStartError(data.error || "Failed to start recording session.")
        setRecorderStarting(false)
      }
    } catch {
      clearInterval(logInterval)
      setRecorderStartError("Network error starting recorder session.")
      setRecorderStarting(false)
    }
  }

  function openRecorderModal() {
    if (projectId && projectId !== "all") {
      setRecorderProjectId(projectId)
    } else if (projects.length === 1) {
      setRecorderProjectId(projects[0].id)
    } else {
      setRecorderProjectId("")
    }
    
    setRecorderTitle("")
    setRecorderModuleId("")
    setRecorderFeatureId("")
    setRecorderComponentId("")
    setRecorderCredentialId("")
    setRecorderPriority("Medium")
    setRecorderPreconditions("")
    setRecorderBrowserType("Chromium")
    setRecorderViewport("Desktop")
    setRecorderMode("Fast")
    setRecorderStartError("")
    setRecorderStarting(false)
    setRecorderLaunchStatus("")
    
    setShowRecorderModal(true)
  }

  // Fetch all projects on mount
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data.items || data.projects || []))
      .catch((err) => console.error("Error fetching projects:", err))
  }, [])

  // Fetch hierarchy details for current project to populate dropdowns
  useEffect(() => {
    if (projectId && projectId !== "all") {
      fetch(`/api/projects/${projectId}/hierarchy`)
        .then((res) => res.json())
        .then((data) => setHierarchyData(data.modules || []))
        .catch((err) => console.error("Error fetching hierarchy:", err))
    } else {
      setHierarchyData([])
    }
  }, [projectId])

  // Fetch hierarchy details for bulk move target project
  useEffect(() => {
    if (moveProjectId) {
      fetch(`/api/projects/${moveProjectId}/hierarchy`)
        .then((res) => res.json())
        .then((data) => setMoveHierarchyData(data.modules || []))
        .catch((err) => console.error("Error fetching target hierarchy:", err))
    } else {
      setMoveHierarchyData([])
    }
  }, [moveProjectId])

  // Primary data fetcher
  const fetchData = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (projectId && projectId !== "all") params.append("projectId", projectId)
    if (moduleId) params.append("moduleId", moduleId)
    if (featureId) params.append("featureId", featureId)
    if (componentId) params.append("componentId", componentId)
    if (priority) params.append("priority", priority)
    if (source) params.append("source", source)
    if (lastRunStatus) params.append("lastRunStatus", lastRunStatus)
    if (requirementLinked) params.append("requirementLinked", requirementLinked)
    if (hasBug) params.append("hasBug", hasBug)
    if (incomplete) params.append("incomplete", incomplete)
    if (debouncedSearch) params.append("search", debouncedSearch)
    params.append("page", String(page))
    params.append("pageSize", String(pageSize))
    params.append("sortBy", sortBy)
    params.append("sortDirection", sortDirection)

    fetch(`/api/test-cases?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const items = data.items || []
        setTestCases(items)
        setTotalCount(data.total || 0)
        if (data.summary) {
          setSummary(data.summary)
        }

        // Initialize active runs mapping from loaded items
        const newActiveRuns = new Map<string, ActiveRun>()
        items.forEach((tc: TestCase) => {
          if (tc.activeRun) {
            newActiveRuns.set(tc.id, tc.activeRun)
          }
        })
        if (newActiveRuns.size > 0) {
          setActiveRuns((prev) => {
            const updated = new Map(prev)
            newActiveRuns.forEach((run, tcId) => {
              updated.set(tcId, run)
            })
            return updated
          })
        }
      })
      .catch((err) => console.error("Error fetching test cases:", err))
      .finally(() => setLoading(false))
  }

  // Trigger fetch when query parameters alter
  useEffect(() => {
    fetchData()
  }, [
    projectId,
    moduleId,
    featureId,
    componentId,
    priority,
    source,
    lastRunStatus,
    requirementLinked,
    hasBug,
    incomplete,
    debouncedSearch,
    page,
    pageSize,
    sortBy,
    sortDirection
  ])

  // Poll active runs status
  useEffect(() => {
    if (activeRuns.size === 0) return
    const interval = setInterval(async () => {
      const newRuns = new Map(activeRuns)
      let changed = false
      for (const [tcId, run] of Array.from(newRuns)) {
        try {
          const res = await fetch(`/api/projects/${run.projectId}/test-runs/${run.testRunId}/progress`)
          if (res.ok) {
            const data = await res.json()
            const terminal = ["Passed", "Failed", "Blocked", "Warning", "Cancelled"]
            if (terminal.includes(data.status)) {
              newRuns.delete(tcId)
              changed = true
              fetchData() // refresh after completion
            } else {
              const totalSteps = data.stepResults?.length || run.totalSteps
              newRuns.set(tcId, {
                ...run,
                status: data.status,
                currentStep: data.currentStep,
                totalSteps
              })
              changed = true
            }
          }
        } catch { /* ignore polling errors */ }
      }
      if (changed) setActiveRuns(newRuns)
    }, 2000)
    return () => clearInterval(interval)
  }, [activeRuns])

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000)
      return () => clearTimeout(t)
    }
  }, [toast])

  // Fetch single testcase details when opening Quick Edit Drawer
  useEffect(() => {
    if (quickEditId) {
      const tc = testCases.find((t) => t.id === quickEditId)
      if (!tc) return

      setEditSaving(false)
      setEditError("")
      fetch(`/api/projects/${tc.projectId}/test-cases/${quickEditId}`)
        .then((res) => res.json())
        .then((data) => {
          const detail = data.testCase
          setEditTitle(detail.title)
          setEditPriority(detail.priority)
          setEditPreconditions(detail.preconditions || "")
          setEditModuleId(detail.moduleId || "")
          setEditFeatureId(detail.featureId || "")
          setEditComponentId(detail.componentId || "")
          setEditRequirementIds((detail.requirements || []).map((r: any) => r.requirementId))
          setEditSteps(detail.steps || [])
        })
        .catch((err) => console.error("Error fetching test case details:", err))
    }
  }, [quickEditId])

  // Toggle selection checkbox
  function toggleRowSelection(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  // Toggle select all on current page
  function toggleSelectAll() {
    if (selectedIds.size === testCases.length && testCases.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(testCases.map((tc) => tc.id)))
    }
  }

  // Clear all filters
  function clearFilters() {
    setProjectId("")
    setModuleId("")
    setFeatureId("")
    setComponentId("")
    setPriority("")
    setSource("")
    setLastRunStatus("")
    setRequirementLinked("")
    setHasBug("")
    setIncomplete("")
    setSearch("")
    setPage(1)
  }

  // Open permanent delete modal for a single test case
  async function openDeleteModal(tc: TestCase) {
    setDeleteTarget(tc)
    setDeleteTypedTitle("")
    setDeleteError("")
    setDeleteLoading(false)
    // Fetch run and bug counts
    try {
      const [runsRes] = await Promise.all([
        fetch(`/api/projects/${tc.projectId}/test-runs`)
      ])
      if (runsRes.ok) {
        const runsData = await runsRes.json()
        const runs = (runsData.testRuns || []).filter((r: any) => r.testCaseId === tc.id)
        setDeleteRunCount(runs.length)
        // Count bugs from runs
        const bugCount = runs.reduce((acc: number, r: any) => acc + (r.bugReports?.length || 0), 0)
        setDeleteBugCount(bugCount)
      } else {
        setDeleteRunCount(0)
        setDeleteBugCount(0)
      }
    } catch {
      setDeleteRunCount(0)
      setDeleteBugCount(0)
    }
    setDeleteModalOpen(true)
  }

  // Execute permanent delete
  async function executePermanentDelete() {
    if (!deleteTarget) return
    const res = await fetch(`/api/test-cases/${deleteTarget.id}/permanent-delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmTitle: deleteTarget.title })
    })

    if (res.ok) {
      const data = await res.json()
      setDeleteModalOpen(false)
      setDeleteTarget(null)
      setToast({ 
        message: `Test case and all related history were permanently deleted. (${data.deleted?.testRuns || 0} runs, ${data.deleted?.steps || 0} steps, ${data.deleted?.bugReports || 0} bugs removed)`,
        type: "success"
      })
      fetchData()
    } else {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || "Failed to delete test case")
    }
  }

  // Delete a single test case
  async function handleDeleteCase(tc: TestCase) {
    openDeleteModal(tc)
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      Queued: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400",
      Running: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
      Passed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
      Failed: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
      Blocked: "bg-slate-100 text-slate-700 dark:bg-slate-800/30 dark:text-slate-400",
      Warning: "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
      Cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
    }
    return colors[status] || "bg-secondary text-secondary-foreground"
  }

  // Run duplicate checks for a test case
  async function performDuplicateCheck(projId: string, title: string, steps: any[]): Promise<any> {
    try {
      const res = await fetch("/api/ai/detect-duplicate-test-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: projId, title, steps })
      })
      if (res.ok) {
        const data = await res.json()
        return data
      }
    } catch (err) {
      console.error("Duplicate check failed:", err)
    }
    return { similarCaseFound: false }
  }

  // Duplicate a test case
  async function handleDuplicateCase(tc: TestCase) {
    try {
      // Fetch full details
      const detailRes = await fetch(`/api/projects/${tc.projectId}/test-cases/${tc.id}`)
      if (!detailRes.ok) throw new Error()
      const { testCase } = await detailRes.json()

      const newTitle = `${testCase.title} (Copy)`
      
      const body = {
        title: newTitle,
        moduleId: testCase.moduleId,
        featureId: testCase.featureId,
        componentId: testCase.componentId,
        priority: testCase.priority,
        preconditions: testCase.preconditions,
        source: "Manual",
        steps: testCase.steps.map((s: any) => ({
          actionDescription: s.actionDescription,
          expectedResult: s.expectedResult,
          actionType: s.actionType,
          targetType: s.targetType,
          targetValue: s.targetValue,
          inputValue: s.inputValue,
          timeoutMs: s.timeoutMs
        })),
        requirementIds: (testCase.requirements || []).map((r: any) => r.requirementId)
      }

      const res = await fetch(`/api/projects/${tc.projectId}/test-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        fetchData()
      } else {
        alert("Failed to duplicate test case")
      }
    } catch {
      alert("Error duplicating test case")
    }
  }

  // Save new test case
  async function handleSaveNewTestCase(e: React.FormEvent) {
    e.preventDefault()
    if (!createProjectId) {
      setCreateError("Please select a project first.")
      return
    }
    if (!createTitle.trim()) {
      setCreateError("Test case title is required.")
      return
    }

    setCreateSaving(true)
    setCreateError("")

    // Run duplicate check if not bypassed
    if (!bypassDuplicateCheck) {
      const dup = await performDuplicateCheck(createProjectId, createTitle, createSteps)
      if (dup && dup.similarCaseFound && dup.similarityPercent >= 75) {
        setDuplicateInfo({
          existingTitle: dup.title,
          existingId: dup.existingCaseId,
          similarityPercent: dup.similarityPercent,
          saveHandler: () => {
            setBypassDuplicateCheck(true)
            setShowDuplicateWarning(false)
            // Trigger save again by manually calling helper
            saveCreatedTestCase(true)
          }
        })
        setCreateSaving(false)
        setShowDuplicateWarning(true)
        return
      }
    }

    await saveCreatedTestCase(bypassDuplicateCheck)
  }

  // Create test case core save helper
  async function saveCreatedTestCase(bypass: boolean) {
    setCreateSaving(true)
    const body = {
      title: createTitle,
      moduleId: createModuleId || null,
      featureId: createFeatureId || null,
      componentId: createComponentId || null,
      priority: createPriority,
      preconditions: createPreconditions || null,
      source: "Manual",
      steps: createSteps.map((s) => ({
        ...s,
        timeoutMs: s.timeoutMs || 10000
      })),
      requirementIds: createRequirementIds
    }

    try {
      const res = await fetch(`/api/projects/${createProjectId}/test-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        setShowCreateModal(false)
        setBypassDuplicateCheck(false)
        // Apply project filter immediately
        setProjectId(createProjectId)
        fetchData()
        // Reset states
        setCreateProjectId("")
        setCreateTitle("")
        setCreatePriority("Medium")
        setCreatePreconditions("")
        setCreateModuleId("")
        setCreateFeatureId("")
        setCreateComponentId("")
        setCreateRequirementIds([])
        setCreateSteps([])
      } else {
        const data = await res.json()
        setCreateError(data.error || "Failed to save test case")
      }
    } catch {
      setCreateError("Network error saving test case")
    } finally {
      setCreateSaving(false)
    }
  }

  // Save quick edit drawer changes
  async function handleSaveQuickEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!quickEditId) return

    const tc = testCases.find((t) => t.id === quickEditId)
    if (!tc) return

    setEditSaving(true)
    setEditError("")

    const body = {
      title: editTitle,
      moduleId: editModuleId || null,
      featureId: editFeatureId || null,
      componentId: editComponentId || null,
      priority: editPriority,
      preconditions: editPreconditions || null,
      steps: editSteps.map((s) => ({
        actionDescription: s.actionDescription,
        expectedResult: s.expectedResult,
        actionType: s.actionType,
        targetType: s.targetType,
        targetValue: s.targetValue,
        inputValue: s.inputValue,
        timeoutMs: s.timeoutMs
      })),
      requirementIds: editRequirementIds
    }

    try {
      const res = await fetch(`/api/projects/${tc.projectId}/test-cases/${quickEditId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        setQuickEditId(null)
        fetchData()
      } else {
        const data = await res.json()
        setEditError(data.error || "Failed to save test case details")
      }
    } catch {
      setEditError("Network error saving changes")
    } finally {
      setEditSaving(false)
    }
  }

  // Execute bulk run
  async function handleExecuteBulkRun() {
    if (selectedIds.size === 0) return

    // Group projects check
    const selectedCases = testCases.filter((tc) => selectedIds.has(tc.id))
    const uniqueProjects = Array.from(new Set(selectedCases.map((tc) => tc.projectId)))

    if (uniqueProjects.length > 1 && bulkMode === "Manual Session") {
      alert("You selected test cases from multiple projects. Running manual sessions requires executing one project at a time, or grouping by project.")
      return
    }

    setBulkRunning(true)
    try {
      const res = await fetch("/api/test-cases/bulk-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCaseIds: Array.from(selectedIds),
          executionMode: bulkMode,
          browserType: bulkBrowser,
          viewport: bulkViewport,
          environment: bulkEnvironment,
          credentialId: bulkCredentialId || null,
          name: bulkSessionName
        })
      })

      if (res.ok) {
        const data = await res.json()
        setShowBulkRunModal(false)
        setSelectedIds(new Set())
        if (data.type === "manual" && data.sessions?.length > 0) {
          // Redirect to the manual session
          router.push(`/projects/${data.sessions[0].projectId}/manual-sessions/${data.sessions[0].id}`)
        } else {
          if (data.runs && Array.isArray(data.runs)) {
            const newActiveRuns = new Map(activeRuns)
            data.runs.forEach((run: any) => {
              const tc = testCases.find(t => t.id === run.testCaseId)
              newActiveRuns.set(run.testCaseId, {
                testRunId: run.id,
                projectId: run.projectId,
                status: run.status,
                currentStep: null,
                totalSteps: tc?.stepsCount || 0
              })
            })
            setActiveRuns(newActiveRuns)
          }
          setToast({ message: `Successfully queued ${data.runsCount} automated test runs.`, type: "success" })
          fetchData()
        }
      } else {
        const err = await res.json()
        setToast({ message: err.error || "Failed to execute bulk run", type: "error" })
      }
    } catch {
      setToast({ message: "Network error trying to trigger execution", type: "error" })
    } finally {
      setBulkRunning(false)
    }
  }

  // Execute bulk move
  async function handleExecuteBulkMove() {
    if (selectedIds.size === 0 || !moveProjectId) return

    setMoveSaving(true)
    try {
      const res = await fetch("/api/test-cases/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCaseIds: Array.from(selectedIds),
          targetProjectId: moveProjectId,
          targetModuleId: moveModuleId || null,
          targetFeatureId: moveFeatureId || null,
          targetComponentId: moveComponentId || null
        })
      })

      if (res.ok) {
        setShowBulkMoveModal(false)
        setSelectedIds(new Set())
        setMoveProjectId("")
        setMoveModuleId("")
        setMoveFeatureId("")
        setMoveComponentId("")
        fetchData()
      } else {
        alert("Failed to move test cases")
      }
    } catch {
      alert("Network error moving test cases")
    } finally {
      setMoveSaving(false)
    }
  }

  // Execute bulk update priority
  async function handleExecuteBulkPriority() {
    if (selectedIds.size === 0) return

    setPrioritySaving(true)
    try {
      const res = await fetch("/api/test-cases/bulk-update-priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCaseIds: Array.from(selectedIds),
          priority: targetPriority
        })
      })

      if (res.ok) {
        setShowBulkPriorityModal(false)
        setSelectedIds(new Set())
        fetchData()
      } else {
        alert("Failed to update priorities")
      }
    } catch {
      alert("Network error updating priority")
    } finally {
      setPrioritySaving(false)
    }
  }

  // Export selected test cases
  async function handleExportSelected() {
    if (selectedIds.size === 0) return

    try {
      const res = await fetch("/api/test-cases/bulk-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseIds: Array.from(selectedIds) })
      })

      if (res.ok) {
        const data = await res.json()
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
          JSON.stringify(data.testCases, null, 2)
        )}`
        const downloadAnchor = document.createElement("a")
        downloadAnchor.setAttribute("href", jsonString)
        downloadAnchor.setAttribute("download", `test_cases_export_${Date.now()}.json`)
        document.body.appendChild(downloadAnchor)
        downloadAnchor.click()
        downloadAnchor.remove()
      } else {
        alert("Failed to export test cases")
      }
    } catch {
      alert("Network error exporting test cases")
    }
  }

  // Export all filtered test cases
  async function handleExportAllFiltered() {
    const params = new URLSearchParams()
    if (projectId && projectId !== "all") params.append("projectId", projectId)
    if (moduleId) params.append("moduleId", moduleId)
    if (featureId) params.append("featureId", featureId)
    if (componentId) params.append("componentId", componentId)
    if (priority) params.append("priority", priority)
    if (source) params.append("source", source)
    if (lastRunStatus) params.append("lastRunStatus", lastRunStatus)
    if (requirementLinked) params.append("requirementLinked", requirementLinked)
    if (hasBug) params.append("hasBug", hasBug)
    if (incomplete) params.append("incomplete", incomplete)
    if (debouncedSearch) params.append("search", debouncedSearch)
    params.append("page", "1")
    params.append("pageSize", "1000") // export up to 1000

    try {
      const res = await fetch(`/api/test-cases?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const ids = (data.items || []).map((t: any) => t.id)
        if (ids.length === 0) {
          alert("No test cases to export")
          return
        }

        const exportRes = await fetch("/api/test-cases/bulk-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testCaseIds: ids })
        })

        if (exportRes.ok) {
          const exportData = await exportRes.json()
          const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(exportData.testCases, null, 2)
          )}`
          const downloadAnchor = document.createElement("a")
          downloadAnchor.setAttribute("href", jsonString)
          downloadAnchor.setAttribute("download", `test_cases_export_filtered_${Date.now()}.json`)
          document.body.appendChild(downloadAnchor)
          downloadAnchor.click()
          downloadAnchor.remove()
        }
      }
    } catch {
      alert("Error exporting filtered cases")
    }
  }

  // Delete all selected test cases
  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return
    setShowBulkDeleteModal(true)
  }

  async function proceedBulkDelete() {
    const projectGroups: Record<string, string[]> = {}
    const selectedCases = testCases.filter((tc) => selectedIds.has(tc.id))
    for (const tc of selectedCases) {
      if (!projectGroups[tc.projectId]) projectGroups[tc.projectId] = []
      projectGroups[tc.projectId].push(tc.id)
    }

    for (const [pId, ids] of Object.entries(projectGroups)) {
      const res = await fetch(`/api/projects/${pId}/test-cases`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to execute bulk delete")
      }
    }

    const count = selectedIds.size
    setSelectedIds(new Set())
    setToast({
      message: `Successfully permanently deleted ${count} selected test cases and all related history.`,
      type: "success"
    })
    setShowBulkDeleteModal(false)
    fetchData()
  }

  // Smart routing helpers for More Actions
  function handleProjectFeatureRedirect(path: string) {
    if (!projectId || projectId === "all") {
      alert("Please select a project filter first to open this project-specific panel.")
      return
    }
    router.push(`/projects/${projectId}/${path}`)
  }

  // Recursive tree formatter for Hierarchy view
  function buildHierarchyTree(items: TestCase[]) {
    const tree: any = {}
    items.forEach((tc) => {
      const projName = tc.project?.name || "Unassigned Project"
      const projId = tc.projectId
      const modName = tc.moduleRelation?.name || tc.module || "General"
      const modId = tc.moduleRelation?.id || "general"
      const featName = tc.feature?.name || "General Features"
      const featId = tc.feature?.id || "general-features"
      const compName = tc.component?.name || "Unassigned"
      const compId = tc.component?.id || "unassigned"

      if (!tree[projId]) {
        tree[projId] = { id: projId, name: projName, type: "project", children: {} }
      }
      if (!tree[projId].children[modId]) {
        tree[projId].children[modId] = { id: modId, name: modName, type: "module", children: {} }
      }
      if (!tree[projId].children[modId].children[featId]) {
        tree[projId].children[modId].children[featId] = { id: featId, name: featName, type: "feature", children: {} }
      }
      if (!tree[projId].children[modId].children[featId].children[compId]) {
        tree[projId].children[modId].children[featId].children[compId] = { id: compId, name: compName, type: "component", testCases: [] }
      }
      tree[projId].children[modId].children[featId].children[compId].testCases.push(tc)
    })
    return tree
  }

  const treeData = buildHierarchyTree(testCases)

  function toggleTreeExpand(id: string) {
    const next = new Set(expandedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedIds(next)
  }

  function expandAll() {
    const ids = new Set<string>()
    testCases.forEach((tc) => {
      ids.add(tc.projectId)
      if (tc.moduleRelation?.id) ids.add(tc.moduleRelation.id)
      if (tc.feature?.id) ids.add(tc.feature.id)
      if (tc.component?.id) ids.add(tc.component.id)
    })
    setExpandedIds(ids)
  }

  function collapseAll() {
    setExpandedIds(new Set())
  }

  // Pre-load default expanded folders
  useEffect(() => {
    if (viewMode === "hierarchy" && testCases.length > 0 && expandedIds.size === 0) {
      expandAll()
    }
  }, [viewMode])

  // Get active credentials for bulk runs
  const activeProject = projects.find((p) => p.id === (projectId === "all" ? "" : projectId))
  const credentials = activeProject?.credentials || []

  // Check if warning badges exist
  const totalWarningsCount = testCases.reduce((acc, tc) => acc + tc.warnings.filter(w => w !== "Never Run").length, 0)
  const neverRunCount = testCases.filter(t => t.lastRunStatus === "NotExecuted").length

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 pb-12 animate-in fade-in duration-200">
      
      {/* 1. Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 bg-background/50 backdrop-blur-sm sticky top-0 z-30">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Test Cases Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 font-medium">
            Manage, search, and execute test cases across all projects in one unified panel.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => {
              setCreateProjectId(projectId && projectId !== "all" ? projectId : "")
              setShowCreateModal(true)
            }}
            className="flex items-center gap-1.5 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all font-semibold"
          >
            <Plus className="h-4.5 w-4.5" /> Create Test Case
          </Button>

          <Button
            onClick={openRecorderModal}
            className="flex items-center gap-1.5 font-semibold bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 border-indigo-500/20 hover:border-indigo-500/30 shadow-md"
            variant="outline"
          >
            <Play className="h-4 w-4 text-indigo-500" /> Create by Recorder
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              if (projectId && projectId !== "all") {
                setImportProjectId(projectId)
                setShowImportModal(true)
              } else {
                setShowImportProjectSelectModal(true)
              }
            }}
            className="flex items-center gap-1.5 font-semibold bg-green-500/5 hover:bg-green-500/10 text-green-600 border-green-500/20 hover:border-green-500/30"
          >
            <FileSpreadsheet className="h-4.5 w-4.5" /> Import Excel
          </Button>

          <div className="relative group">
            <Button variant="outline" className="flex items-center gap-1.5 font-semibold">
              More Actions <ChevronDown className="h-4 w-4" />
            </Button>
            <div className="absolute right-0 mt-1.5 w-56 rounded-xl border bg-background shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-150 z-50 p-1">
              <button
                onClick={() => handleProjectFeatureRedirect("record")}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent flex items-center gap-2"
              >
                <Play className="h-4 w-4 text-indigo-500" /> Record Test Case
              </button>
              <button
                onClick={() => handleProjectFeatureRedirect("manual-sessions/new")}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent flex items-center gap-2"
              >
                <FileText className="h-4 w-4 text-blue-500" /> Start Manual Session
              </button>
              <button
                onClick={() => handleProjectFeatureRedirect("reusable-flows")}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent flex items-center gap-2"
              >
                <Code className="h-4 w-4 text-purple-500" /> Manage Reusable Steps
              </button>
              <button
                onClick={() => handleProjectFeatureRedirect("test-data")}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent flex items-center gap-2"
              >
                <Database className="h-4 w-4 text-green-500" /> Manage Test Data
              </button>
              <button
                onClick={() => handleProjectFeatureRedirect("locators")}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent flex items-center gap-2"
              >
                <Settings className="h-4 w-4 text-pink-500" /> Open Locator Library
              </button>
              <div className="border-t my-1"></div>
              <button
                onClick={handleExportAllFiltered}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Download className="h-4 w-4" /> Export Test Cases
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        {/* Total */}
        <div
          onClick={() => {
            setLastRunStatus("")
            setPriority("")
            setIncomplete("")
          }}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            !lastRunStatus && !priority && !incomplete
              ? "bg-gradient-to-br from-indigo-50/50 to-indigo-100/30 border-indigo-200 shadow-md shadow-indigo-100/50 dark:from-indigo-950/20 dark:to-indigo-900/10 dark:border-indigo-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Cases</div>
          <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">{summary.total}</div>
          <div className="text-[10px] text-muted-foreground mt-1">All defined test cases</div>
        </div>

        {/* Passed */}
        <div
          onClick={() => setLastRunStatus("Passed")}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            lastRunStatus === "Passed"
              ? "bg-gradient-to-br from-green-50/50 to-green-100/30 border-green-200 shadow-md shadow-green-100/50 dark:from-green-950/20 dark:to-green-900/10 dark:border-green-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Passed</div>
          <div className="text-3xl font-extrabold text-green-600 dark:text-green-400 mt-2">{summary.passed}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Click to view passed</div>
        </div>

        {/* Failed */}
        <div
          onClick={() => setLastRunStatus("Failed")}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            lastRunStatus === "Failed"
              ? "bg-gradient-to-br from-red-50/50 to-red-100/30 border-red-200 shadow-md shadow-red-100/50 dark:from-red-950/20 dark:to-red-900/10 dark:border-red-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Failed</div>
          <div className="text-3xl font-extrabold text-red-600 dark:text-red-400 mt-2">{summary.failed}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Click to view failed</div>
        </div>

        {/* Not Executed */}
        <div
          onClick={() => setLastRunStatus("NotExecuted")}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            lastRunStatus === "NotExecuted"
              ? "bg-gradient-to-br from-gray-50/50 to-gray-100/30 border-gray-200 shadow-md shadow-gray-100/50 dark:from-gray-900/20 dark:to-gray-800/10 dark:border-gray-800"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Not Executed</div>
          <div className="text-3xl font-extrabold text-muted-foreground mt-2">{summary.notExecuted}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Click to view untested</div>
        </div>

        {/* High Priority */}
        <div
          onClick={() => setPriority("High")}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            priority === "High" || priority === "Critical"
              ? "bg-gradient-to-br from-orange-50/50 to-orange-100/30 border-orange-200 shadow-md shadow-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10 dark:border-orange-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">High / Critical</div>
          <div className="text-3xl font-extrabold text-orange-600 dark:text-orange-400 mt-2">{summary.highPriority}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Important cases count</div>
        </div>

        {/* Unassigned */}
        <div
          onClick={() => {
            setIncomplete("true")
          }}
          className={`cursor-pointer border rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
            incomplete === "true"
              ? "bg-gradient-to-br from-yellow-50/50 to-yellow-100/30 border-yellow-200 shadow-md shadow-yellow-100/50 dark:from-yellow-950/20 dark:to-yellow-900/10 dark:border-yellow-900"
              : "bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unassigned / Incomplete</div>
          <div className="text-3xl font-extrabold text-yellow-600 dark:text-yellow-400 mt-2">{summary.unassigned}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Missing component info</div>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Left Side: Filter Panels & Suggested Cleanup */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Smart Cleanup Suggestions Panel */}
          <div className="border rounded-2xl p-4 bg-gradient-to-br from-yellow-500/[0.03] to-red-500/[0.03] border-accent/25 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-yellow-500" /> Suggested Cleanup
            </h3>
            
            <div className="space-y-3.5 text-xs">
              {totalWarningsCount > 0 ? (
                <div
                  onClick={() => setIncomplete("true")}
                  className="p-3 bg-yellow-50/60 dark:bg-yellow-950/10 border border-yellow-100 dark:border-yellow-900/40 rounded-xl cursor-pointer hover:bg-yellow-50 transition-colors flex items-start gap-2 text-yellow-800 dark:text-yellow-400 font-medium"
                >
                  <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                  <div>
                    <span className="font-bold">{totalWarningsCount} test cases</span> have missing information (no steps, preconditions or components). Click to resolve.
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-green-50/60 dark:bg-green-950/10 border border-green-100 dark:border-green-900/40 rounded-xl flex items-start gap-2 text-green-800 dark:text-green-400 font-medium">
                  <Check className="h-4.5 w-4.5 shrink-0" />
                  <div>All test cases are fully configured. Good job!</div>
                </div>
              )}

              {neverRunCount > 0 && (
                <div
                  onClick={() => setLastRunStatus("NotExecuted")}
                  className="p-3 bg-blue-50/60 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/40 rounded-xl cursor-pointer hover:bg-blue-50 transition-colors flex items-start gap-2 text-blue-800 dark:text-blue-400 font-medium"
                >
                  <HelpCircle className="h-4.5 w-4.5 shrink-0" />
                  <div>
                    <span className="font-bold">{neverRunCount} test cases</span> have never been executed. Click to schedule runs.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Filters Area */}
          <div className="border rounded-2xl p-5 bg-card shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" /> Filters
              </h3>
              <button
                onClick={clearFilters}
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

            {/* Suite Hierarchy filter: only load if project is chosen */}
            {projectId && projectId !== "all" ? (
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
                ℹ️ Filter by Project to activate Module/Feature/Component drill-down filters.
              </div>
            )}

            {/* Priority filter */}
            <div className="space-y-1.5 border-t pt-4">
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

            {/* Run status filter */}
            <div className="space-y-1.5 border-t pt-4">
              <Label htmlFor="filter-status" className="text-xs font-semibold text-muted-foreground">Last Run Status</Label>
              <select
                id="filter-status"
                value={lastRunStatus}
                onChange={(e) => setLastRunStatus(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="Passed">Passed</option>
                <option value="Failed">Failed</option>
                <option value="Blocked">Blocked</option>
                <option value="Warning">Warning</option>
                <option value="NotExecuted">Not Executed</option>
              </select>
            </div>

            {/* Link state filters */}
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="filter-linked" className="text-xs font-semibold text-muted-foreground">Requirement Link</Label>
                <select
                  id="filter-linked"
                  value={requirementLinked}
                  onChange={(e) => setRequirementLinked(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
                >
                  <option value="">All Cases</option>
                  <option value="linked">Linked to Requirement</option>
                  <option value="unlinked">Not Linked</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-bug" className="text-xs font-semibold text-muted-foreground">Bug Status</Label>
                <select
                  id="filter-bug"
                  value={hasBug}
                  onChange={(e) => setHasBug(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
                >
                  <option value="">All Cases</option>
                  <option value="has_bug">Has Open Bug</option>
                  <option value="no_bug">No Bugs</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-incomplete" className="text-xs font-semibold text-muted-foreground">Incomplete Checks</Label>
                <select
                  id="filter-incomplete"
                  value={incomplete}
                  onChange={(e) => setIncomplete(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
                >
                  <option value="">All Cases</option>
                  <option value="true">Incomplete Test Cases</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Main Table & Tree View */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Sub-Header Toolbar: Search, view mode toggles, total count */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-2xl bg-card shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search title, steps, key, requirements..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9.5 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-2.5 hover:text-foreground text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <div className="flex items-center border rounded-lg overflow-hidden bg-accent/20 p-0.5">
                <button
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewMode === "table" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Table View
                </button>
                <button
                  onClick={() => setViewMode("hierarchy")}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewMode === "hierarchy" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Hierarchy View
                </button>
              </div>

              {viewMode === "hierarchy" && (
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" onClick={expandAll} className="h-8 text-[11px] font-semibold">
                    Expand All
                  </Button>
                  <Button variant="outline" size="sm" onClick={collapseAll} className="h-8 text-[11px] font-semibold">
                    Collapse All
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Floating Bulk Action Bar (when selectedIds size > 0) */}
          {selectedIds.size > 0 && (
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl border border-indigo-500/20 animate-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold">
                  {selectedIds.size}
                </span>
                <span className="text-sm font-semibold">test cases selected</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const selectedCases = testCases.filter((tc) => selectedIds.has(tc.id))
                    const uniqueProjs = Array.from(new Set(selectedCases.map((tc) => tc.projectId)))
                    if (uniqueProjs.length > 1) {
                      alert("You selected test cases from multiple projects. Run one project at a time, or group execution by project.")
                      return
                    }
                    setBulkBrowser(selectedCases[0].project.browserType || "Chromium")
                    setBulkViewport(selectedCases[0].project.viewport || "Desktop")
                    setBulkEnvironment(selectedCases[0].project.environment || "Staging")
                    setBulkSessionName(`Bulk execution - ${new Date().toLocaleDateString()}`)
                    setShowBulkRunModal(true)
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Run Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMoveProjectId("")
                    setShowBulkMoveModal(true)
                  }}
                  className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-white flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <Move className="h-3.5 w-3.5" /> Move Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTargetPriority("Medium")
                    setShowBulkPriorityModal(true)
                  }}
                  className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-white flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Set Priority
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportSelected}
                  className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-white flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1.5 h-8.5 font-bold"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
                <button onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-white p-1 ml-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* View Render Area */}
          {loading ? (
            <div className="flex flex-col items-center justify-center border border-dashed rounded-2xl py-24 bg-card shadow-sm">
              <RefreshCw className="h-10 w-10 text-indigo-500 animate-spin mb-4" />
              <p className="text-sm font-semibold text-muted-foreground">Loading test case repository...</p>
            </div>
          ) : testCases.length === 0 ? (
            /* Smart Empty States */
            projectId && projectId !== "all" && hierarchyData.length === 0 ? (
              <div className="text-center border border-dashed rounded-2xl py-20 px-4 bg-card shadow-sm">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
                <h3 className="text-lg font-bold mb-1">No test cases inside this project</h3>
                <p className="text-muted-foreground max-w-sm mx-auto text-xs mb-6">
                  You can define manual test cases, record browser automation, or import a spreadsheet.
                </p>
                <div className="flex justify-center gap-2">
                  <Button onClick={() => { setCreateProjectId(projectId); setShowCreateModal(true) }}>
                    Create Test Case
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openRecorderModal}
                    className="flex items-center gap-1 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 border-indigo-500/20 hover:border-indigo-500/30 font-medium"
                  >
                    <Play className="h-4.5 w-4.5" /> Create by Recorder
                  </Button>
                  <Button variant="outline" onClick={() => { setImportProjectId(projectId); setShowImportModal(true) }}>
                    Import Excel
                  </Button>
                </div>
              </div>
            ) : debouncedSearch || priority || lastRunStatus || moduleId || featureId || componentId ? (
              <div className="text-center border border-dashed rounded-2xl py-20 px-4 bg-card shadow-sm">
                <Search className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
                <h3 className="text-lg font-bold mb-1">No matching test cases found</h3>
                <p className="text-muted-foreground max-w-sm mx-auto text-xs mb-6">
                  Your search filters did not match any test cases in the project. Try clearing active filters.
                </p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div className="text-center border border-dashed rounded-2xl py-20 px-4 bg-card shadow-sm">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
                <h3 className="text-lg font-bold mb-1">No test cases in workspace yet</h3>
                <p className="text-muted-foreground max-w-sm mx-auto text-xs mb-6">
                  Create your very first manual test case or import from Excel.
                </p>
                <div className="flex justify-center gap-2">
                  <Button onClick={() => setShowCreateModal(true)}>Create Test Case</Button>
                  <Button
                    variant="outline"
                    onClick={openRecorderModal}
                    className="flex items-center gap-1 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 border-indigo-500/20 hover:border-indigo-500/30 font-medium"
                  >
                    <Play className="h-4.5 w-4.5" /> Create by Recorder
                  </Button>
                  <Button variant="outline" onClick={() => setShowImportProjectSelectModal(true)}>Import Excel</Button>
                </div>
              </div>
            )
          ) : viewMode === "table" ? (
            /* 3. Tabular view */
            <div className="border rounded-2xl overflow-hidden shadow-sm bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-accent/40 border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="p-4 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === testCases.length && testCases.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                        />
                      </th>
                      <th className="p-4">Test Case Title</th>
                      <th className="p-4">Project</th>
                      <th className="p-4">Hierarchy Node</th>
                      <th className="p-4">Priority</th>
                      <th className="p-4">Last Run</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {testCases.map((tc) => (
                      <tr key={tc.id} className="hover:bg-accent/20 transition-colors">
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(tc.id)}
                            onChange={() => toggleRowSelection(tc.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-foreground cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => setQuickEditId(tc.id)}>
                            {tc.title}
                          </div>
                          
                          {/* Checklist / Warning list tags */}
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {tc.warnings.map((w) => (
                              <span
                                key={w}
                                className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                  w === "Never Run"
                                    ? "bg-slate-100 dark:bg-slate-800 text-muted-foreground border-slate-200 dark:border-slate-700"
                                    : "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                }`}
                              >
                                {w}
                              </span>
                            ))}
                            {tc.requirements && tc.requirements.length > 0 && (
                              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 px-1.5 py-0.5 rounded font-medium">
                                Link: {tc.requirements.map(r => r.requirementKey).join(", ")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-xs font-medium text-muted-foreground">{tc.project?.name}</td>
                        <td className="p-4">
                          <div className="text-xs text-foreground font-medium">
                            {tc.moduleRelation?.name || tc.module || "General"}
                          </div>
                          {(tc.feature || tc.component) && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {tc.feature?.name} {tc.component && `→ ${tc.component.name}`}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${
                              tc.priority === "Critical" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                              tc.priority === "High" ? "bg-orange-500/10 text-orange-600 border-orange-500/20" :
                              tc.priority === "Medium" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                              "bg-slate-500/10 text-slate-600 border-slate-500/20"
                            }`}
                          >
                            {tc.priority}
                          </span>
                        </td>
                        <td className="p-4">
                          {activeRuns.has(tc.id) ? (
                            (() => {
                              const activeRun = activeRuns.get(tc.id)!
                              return (
                                <div className="space-y-1">
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide inline-flex items-center gap-1 ${getStatusBadge(activeRun.status)}`}>
                                    {activeRun.status === "Running" && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {activeRun.status}
                                    {activeRun.status === "Running" && activeRun.currentStep && (
                                      <span className="ml-1">({activeRun.currentStep}/{activeRun.totalSteps})</span>
                                    )}
                                  </span>
                                  {activeRun.status === "Running" && activeRun.currentStep && (
                                    <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className="bg-indigo-600 h-full transition-all duration-300"
                                        style={{ width: `${(activeRun.currentStep / activeRun.totalSteps) * 100}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              )
                            })()
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    tc.lastRunStatus === "Passed" ? "bg-green-500" :
                                    tc.lastRunStatus === "Failed" ? "bg-red-500" :
                                    tc.lastRunStatus === "Blocked" ? "bg-yellow-500" :
                                    tc.lastRunStatus === "Warning" ? "bg-orange-500" :
                                    "bg-slate-400"
                                  }`}
                                />
                                <span className="text-xs font-semibold">
                                  {tc.lastRunStatus === "NotExecuted" ? "Untested" : tc.lastRunStatus}
                                </span>
                              </div>
                              {tc.lastRunDate && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(tc.lastRunDate).toLocaleDateString()}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {activeRuns.has(tc.id) ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400"
                                  title="Open active run details"
                                  onClick={() => router.push(`/projects/${activeRuns.get(tc.id)!.projectId}/test-runs/${activeRuns.get(tc.id)!.testRunId}`)}
                                >
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                title="Run test"
                                disabled={tc.stepsCount === 0}
                                onClick={() => {
                                  setSelectedIds(new Set([tc.id]))
                                  setBulkBrowser(tc.project.browserType || "Chromium")
                                  setBulkViewport(tc.project.viewport || "Desktop")
                                  setBulkEnvironment(tc.project.environment || "Staging")
                                  setBulkSessionName(`Automated execution - ${new Date().toLocaleDateString()}`)
                                  setShowBulkRunModal(true)
                                }}
                              >
                                <Play className="h-4 w-4 text-indigo-500 fill-indigo-500" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              title="Quick edit"
                              onClick={() => setQuickEditId(tc.id)}
                            >
                              <Edit className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              title="Duplicate"
                              onClick={() => handleDuplicateCase(tc)}
                            >
                              <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              title="Delete"
                              onClick={() => handleDeleteCase(tc)}
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

              {/* 4. Server-side Pagination Control footer */}
              <div className="px-6 py-4 border-t flex items-center justify-between text-xs font-semibold text-muted-foreground bg-accent/10">
                <div>
                  Showing {Math.min(totalCount, (page - 1) * pageSize + 1)} - {Math.min(totalCount, page * pageSize)} of {totalCount} test cases
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span>Rows per page:</span>
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      className="h-8"
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page * pageSize >= totalCount}
                      onClick={() => setPage(page + 1)}
                      className="h-8"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 5. Tree Hierarchy View */
            <div className="border rounded-2xl p-6 bg-card shadow-sm space-y-4">
              <div className="space-y-4">
                {Object.values(treeData).map((proj: any) => {
                  const projExpanded = expandedIds.has(proj.id)
                  return (
                    <div key={proj.id} className="space-y-2 border-l-2 border-indigo-200 dark:border-indigo-900 pl-4 ml-1">
                      <div
                        onClick={() => toggleTreeExpand(proj.id)}
                        className="flex items-center gap-2 cursor-pointer font-bold text-base hover:text-indigo-600 transition-colors"
                      >
                        {projExpanded ? <ChevronDown className="h-4.5 w-4.5" /> : <ChevronRight className="h-4.5 w-4.5" />}
                        <Folder className="h-5 w-5 text-indigo-500 fill-indigo-500/20" />
                        <span>Project: {proj.name}</span>
                      </div>

                      {projExpanded && (
                        <div className="pl-6 space-y-4 mt-2">
                          {Object.values(proj.children).map((mod: any) => {
                            const modExpanded = expandedIds.has(mod.id)
                            return (
                              <div key={mod.id} className="space-y-2">
                                <div
                                  onClick={() => toggleTreeExpand(mod.id)}
                                  className="flex items-center gap-2 cursor-pointer font-bold text-sm hover:text-indigo-600 transition-colors"
                                >
                                  {modExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  <Folder className="h-4.5 w-4.5 text-blue-500 fill-blue-500/20" />
                                  <span>Module: {mod.name}</span>
                                </div>

                                {modExpanded && (
                                  <div className="pl-6 space-y-3 mt-1">
                                    {Object.values(mod.children).map((feat: any) => {
                                      const featExpanded = expandedIds.has(feat.id)
                                      return (
                                        <div key={feat.id} className="space-y-2">
                                          <div
                                            onClick={() => toggleTreeExpand(feat.id)}
                                            className="flex items-center gap-2 cursor-pointer font-bold text-xs hover:text-indigo-600 transition-colors text-muted-foreground"
                                          >
                                            {featExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                            <Folder className="h-4 w-4 text-purple-500 fill-purple-500/20" />
                                            <span>Feature: {feat.name}</span>
                                          </div>

                                          {featExpanded && (
                                            <div className="pl-6 space-y-3 mt-1">
                                              {Object.values(feat.children).map((comp: any) => {
                                                const compExpanded = expandedIds.has(comp.id)
                                                return (
                                                  <div key={comp.id} className="space-y-2">
                                                    <div
                                                      onClick={() => toggleTreeExpand(comp.id)}
                                                      className="flex items-center justify-between cursor-pointer group"
                                                    >
                                                      <div className="flex items-center gap-2 font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/80 hover:text-indigo-600 transition-colors">
                                                        {compExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                        <FileText className="h-3.5 w-3.5 text-pink-500" />
                                                        <span>Component: {comp.name}</span>
                                                      </div>
                                                      <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 px-1.5 text-[10px] font-bold opacity-0 group-hover:opacity-100"
                                                        onClick={(e) => {
                                                          e.stopPropagation()
                                                          setCreateProjectId(proj.id)
                                                          setCreateModuleId(mod.id)
                                                          setCreateFeatureId(feat.id)
                                                          setCreateComponentId(comp.id)
                                                          setShowCreateModal(true)
                                                        }}
                                                      >
                                                        + Add Test case
                                                      </Button>
                                                    </div>

                                                    {compExpanded && (
                                                      <div className="pl-6 space-y-1.5 mt-1">
                                                        {comp.testCases.map((tc: TestCase) => (
                                                          <div
                                                            key={tc.id}
                                                            className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/40 border border-transparent hover:border-accent group"
                                                          >
                                                            <div
                                                              className="flex items-center gap-2 cursor-pointer font-medium text-xs text-foreground/90 hover:text-indigo-600"
                                                              onClick={() => setQuickEditId(tc.id)}
                                                            >
                                                              <span
                                                                className={`h-2 w-2 rounded-full ${
                                                                  tc.lastRunStatus === "Passed" ? "bg-green-500" :
                                                                  tc.lastRunStatus === "Failed" ? "bg-red-500" :
                                                                  "bg-slate-400"
                                                                }`}
                                                              />
                                                              <span>{tc.title}</span>
                                                            </div>

                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                                              <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-6 w-6 p-0"
                                                                onClick={() => {
                                                                  setSelectedIds(new Set([tc.id]))
                                                                  setBulkBrowser(tc.project.browserType || "Chromium")
                                                                  setBulkViewport(tc.project.viewport || "Desktop")
                                                                  setBulkEnvironment(tc.project.environment || "Staging")
                                                                  setBulkSessionName(`Automated execution - ${new Date().toLocaleDateString()}`)
                                                                  setShowBulkRunModal(true)
                                                                }}
                                                              >
                                                                <Play className="h-3 w-3 text-indigo-500 fill-indigo-500" />
                                                              </Button>
                                                              <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-6 w-6 p-0"
                                                                onClick={() => setQuickEditId(tc.id)}
                                                              >
                                                                <Edit className="h-3 w-3" />
                                                              </Button>
                                                              <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-6 w-6 p-0"
                                                                onClick={() => handleDeleteCase(tc)}
                                                              >
                                                                <Trash2 className="h-3 w-3 text-destructive" />
                                                              </Button>
                                                            </div>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 6. CREATE TEST CASE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-accent/20">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Plus className="h-5 w-5 text-indigo-600" /> Create New Test Case
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewTestCase} className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Project select */}
              <div className="space-y-2">
                <Label htmlFor="create-project" className="font-bold">Project *</Label>
                <select
                  id="create-project"
                  required
                  value={createProjectId}
                  onChange={(e) => {
                    setCreateProjectId(e.target.value)
                    setCreateModuleId("")
                    setCreateFeatureId("")
                    setCreateComponentId("")
                    setCreateRequirementIds([])
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">-- Select Project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {createProjectId && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-title" className="font-bold">Test Case Title *</Label>
                      <Input
                        id="create-title"
                        required
                        placeholder="e.g. Verify profile edit form"
                        value={createTitle}
                        onChange={(e) => setCreateTitle(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="create-priority" className="font-bold">Priority</Label>
                      <select
                        id="create-priority"
                        value={createPriority}
                        onChange={(e) => setCreatePriority(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>

                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="create-preconditions" className="font-bold">Preconditions</Label>
                      <Input
                        id="create-preconditions"
                        placeholder="e.g. User must be signed in with valid credits"
                        value={createPreconditions}
                        onChange={(e) => setCreatePreconditions(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="border p-5 rounded-2xl bg-accent/5 space-y-3 shadow-sm border-accent/20">
                    <h3 className="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Test Suite Hierarchy</h3>
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

                  <LinkedRequirementsSelector
                    projectId={createProjectId}
                    selectedIds={createRequirementIds}
                    onChange={setCreateRequirementIds}
                  />

                  <StepBuilder steps={createSteps} onChange={setCreateSteps} projectId={createProjectId} />
                </div>
              )}

              {createError && <p className="text-sm text-destructive font-semibold">{createError}</p>}
            </form>

            <div className="px-6 py-4 border-t flex justify-end gap-2.5 bg-accent/10">
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button onClick={handleSaveNewTestCase} disabled={createSaving || !createProjectId}>
                {createSaving ? "Saving..." : "Save Test Case"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DUPLICATE WARNING MODAL */}
      {showDuplicateWarning && duplicateInfo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border-amber-500/30">
            <h3 className="text-lg font-extrabold text-amber-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Similar Test Case Detected
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              A test case with high similarity was detected in this project:
            </p>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-4 rounded-xl mt-3 space-y-1">
              <strong className="text-sm text-foreground break-words">{duplicateInfo.existingTitle}</strong>
              <div className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                Similarity Score: {duplicateInfo.similarityPercent}%
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-6">
              <Button
                variant="outline"
                className="w-full text-indigo-600 hover:text-indigo-700 border-indigo-200"
                onClick={() => {
                  const activeProjId = createProjectId || (quickEditId ? (testCases.find(t => t.id === quickEditId)?.projectId || "") : "")
                  window.open(`/projects/${activeProjId}/test-cases/${duplicateInfo.existingId}/edit`, "_blank")
                }}
              >
                Open Existing Test Case
              </Button>
              <Button
                variant="default"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => duplicateInfo.saveHandler()}
              >
                Create Anyway
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowDuplicateWarning(false)}
              >
                Cancel & Edit details
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 7. QUICK EDIT DRAWER */}
      {quickEditId && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setQuickEditId(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-background shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-200">
            <div className="px-6 py-5 border-b flex items-center justify-between bg-accent/20">
              <div>
                <h3 className="text-lg font-bold">Quick Edit Test Case</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Edit credentials, priority, or steps in-place</p>
              </div>
              <button onClick={() => setQuickEditId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickEdit} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="edit-title" className="font-bold">Test Case Title *</Label>
                  <Input
                    id="edit-title"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-priority" className="font-bold">Priority</Label>
                  <select
                    id="edit-priority"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-preconditions" className="font-bold">Preconditions</Label>
                  <Input
                    id="edit-preconditions"
                    value={editPreconditions}
                    onChange={(e) => setEditPreconditions(e.target.value)}
                  />
                </div>
              </div>

              {/* Hierarchy explorer inside drawer */}
              {quickEditId && (
                <div className="border p-5 rounded-2xl bg-accent/5 space-y-3 shadow-sm border-accent/20">
                  <h3 className="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Test Suite Hierarchy</h3>
                  <HierarchySelector
                    projectId={testCases.find((t) => t.id === quickEditId)?.projectId || ""}
                    moduleId={editModuleId}
                    onChangeModuleId={setEditModuleId}
                    featureId={editFeatureId}
                    onChangeFeatureId={setEditFeatureId}
                    componentId={editComponentId}
                    onChangeComponentId={setEditComponentId}
                  />
                </div>
              )}

              {/* Requirement linking */}
              {quickEditId && (
                <LinkedRequirementsSelector
                  projectId={testCases.find((t) => t.id === quickEditId)?.projectId || ""}
                  selectedIds={editRequirementIds}
                  onChange={setEditRequirementIds}
                />
              )}

              {/* Step checklist preview/builder */}
              {quickEditId && (
                <StepBuilder
                  steps={editSteps}
                  onChange={setEditSteps}
                  projectId={testCases.find((t) => t.id === quickEditId)?.projectId || ""}
                />
              )}

              {editError && <p className="text-sm text-destructive font-semibold">{editError}</p>}
            </form>

            <div className="px-6 py-4 border-t flex justify-end gap-2.5 bg-accent/10">
              <Button variant="ghost" onClick={() => setQuickEditId(null)}>Cancel</Button>
              <Button onClick={handleSaveQuickEdit} disabled={editSaving}>
                {editSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* 8. EXCEL IMPORT PROJECT SELECTOR */}
      {showImportProjectSelectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold mb-2">Import from Excel</h3>
            <p className="text-sm text-muted-foreground mb-4">Select the project you want to import test cases into:</p>
            <select
              value={importProjectId}
              onChange={(e) => setImportProjectId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none mb-4"
            >
              <option value="">-- Choose Project --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowImportProjectSelectModal(false); setImportProjectId("") }}>Cancel</Button>
              <Button
                size="sm"
                disabled={!importProjectId}
                onClick={() => {
                  setShowImportProjectSelectModal(false)
                  setShowImportModal(true)
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 9. CREATE BY RECORDER MODAL */}
      {showRecorderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-background border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-accent/20">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Play className="h-5 w-5 text-indigo-600 animate-pulse" /> Start Browser Recorder
              </h3>
              <button onClick={() => setShowRecorderModal(false)} className="text-muted-foreground hover:text-foreground" disabled={recorderStarting}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleStartRecorderSession} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Project selection */}
              <div className="space-y-2">
                <Label htmlFor="recorder-project" className="font-bold">Project *</Label>
                <select
                  id="recorder-project"
                  required
                  disabled={recorderStarting}
                  value={recorderProjectId}
                  onChange={(e) => {
                    setRecorderProjectId(e.target.value)
                    setRecorderModuleId("")
                    setRecorderFeatureId("")
                    setRecorderComponentId("")
                    setRecorderCredentialId("")
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">-- Select Project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {recorderLoadingConfig && (
                <div className="flex flex-col items-center justify-center py-10 space-y-2">
                  <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading project details and credentials...</p>
                </div>
              )}

              {recorderProjectId && !recorderLoadingConfig && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Collision Handling: Active session info banner */}
                  {activeSessionInfo ? (
                    <div className="border border-orange-500/20 bg-orange-500/5 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm text-orange-800 dark:text-orange-400">
                            Active Recording Session Exists
                          </h4>
                          <p className="text-xs text-orange-700/80 dark:text-orange-400/80 mt-1">
                            This project already has an active recording session (Status: <span className="font-semibold">{activeSessionInfo.status}</span>).
                            You can resume the current session or start a new one (cancelling the existing one).
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setShowRecorderModal(false)
                            router.push(`/projects/${recorderProjectId}/record`)
                          }}
                          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold flex items-center gap-1.5 shadow-sm"
                        >
                          <Play className="h-4 w-4" /> Resume Session
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCancelActiveSession}
                          className="border-orange-500/20 hover:bg-orange-500/10 text-orange-700 dark:text-orange-400 font-semibold"
                        >
                          Cancel & Start New
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Test case title and priority */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="recorder-title" className="font-bold">Test Case Title *</Label>
                          <Input
                            id="recorder-title"
                            required
                            disabled={recorderStarting}
                            placeholder="e.g. Verify checkout process"
                            value={recorderTitle}
                            onChange={(e) => setRecorderTitle(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="recorder-priority" className="font-bold">Priority</Label>
                          <select
                            id="recorder-priority"
                            disabled={recorderStarting}
                            value={recorderPriority}
                            onChange={(e) => setRecorderPriority(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                          </select>
                        </div>
                      </div>

                      {/* Start url & required credentials */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2 md:col-span-1">
                          <Label htmlFor="recorder-start-url" className="font-bold">Start URL *</Label>
                          <Input
                            id="recorder-start-url"
                            required
                            type="url"
                            disabled={recorderStarting}
                            placeholder="https://example.com"
                            value={recorderStartUrl}
                            onChange={(e) => setRecorderStartUrl(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2 col-span-2 md:col-span-1">
                          <Label htmlFor="recorder-credential" className="font-bold">Prefill Credential</Label>
                          <select
                            id="recorder-credential"
                            disabled={recorderStarting}
                            value={recorderCredentialId}
                            onChange={(e) => setRecorderCredentialId(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                          >
                            <option value="">-- No Credential (Start Anonymous) --</option>
                            {recorderProjectConfig?.credentials.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.roleName} ({c.username})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Preconditions */}
                      <div className="space-y-2">
                        <Label htmlFor="recorder-preconditions" className="font-bold">Preconditions</Label>
                        <Input
                          id="recorder-preconditions"
                          disabled={recorderStarting}
                          placeholder="e.g. User should be logged out, clean database state"
                          value={recorderPreconditions}
                          onChange={(e) => setRecorderPreconditions(e.target.value)}
                        />
                      </div>

                      {/* Hierarchy selector */}
                      <div className="border p-5 rounded-2xl bg-accent/5 space-y-3 shadow-sm border-accent/20">
                        <h3 className="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Test Suite Hierarchy</h3>
                        <HierarchySelector
                          projectId={recorderProjectId}
                          moduleId={recorderModuleId}
                          onChangeModuleId={setRecorderModuleId}
                          featureId={recorderFeatureId}
                          onChangeFeatureId={setRecorderFeatureId}
                          componentId={recorderComponentId}
                          onChangeComponentId={setRecorderComponentId}
                        />
                      </div>

                      {/* Advanced Settings Section */}
                      <div className="border border-input rounded-xl p-4 space-y-4">
                        <h4 className="text-sm font-bold text-muted-foreground flex items-center gap-1">
                          <Settings className="h-4 w-4" /> Advanced Browser Configuration
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="recorder-browser-type" className="font-semibold text-xs text-muted-foreground uppercase">Browser</Label>
                            <select
                              id="recorder-browser-type"
                              disabled={recorderStarting}
                              value={recorderBrowserType}
                              onChange={(e) => setRecorderBrowserType(e.target.value as any)}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:outline-none"
                            >
                              <option value="Chromium">Google Chrome (Chromium)</option>
                              <option value="Firefox">Mozilla Firefox</option>
                              <option value="WebKit">Apple Safari (WebKit)</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="recorder-viewport" className="font-semibold text-xs text-muted-foreground uppercase">Viewport Size</Label>
                            <select
                              id="recorder-viewport"
                              disabled={recorderStarting}
                              value={recorderViewport}
                              onChange={(e) => setRecorderViewport(e.target.value as any)}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:outline-none"
                            >
                              <option value="Desktop">Desktop (1280x800)</option>
                              <option value="Tablet">Tablet (768x1024)</option>
                              <option value="Mobile">Mobile (375x667)</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="recorder-mode" className="font-semibold text-xs text-muted-foreground uppercase">Capture Density</Label>
                            <select
                              id="recorder-mode"
                              disabled={recorderStarting}
                              value={recorderMode}
                              onChange={(e) => setRecorderMode(e.target.value as any)}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:outline-none"
                            >
                              <option value="Fast">Fast (Actions only)</option>
                              <option value="Detailed">Detailed (DOM changes)</option>
                              <option value="Assertion">Assertion-Ready (Full trace)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {recorderStartError && (
                <div className="bg-destructive/5 border border-destructive/20 text-destructive text-sm rounded-xl p-4 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Failed to launch:</span>
                    <p className="mt-0.5 text-xs text-destructive/90">{recorderStartError}</p>
                    {recorderStartError.includes("recorder-worker") && (
                      <code className="block mt-2 bg-background p-1.5 rounded text-[10px] border font-mono text-muted-foreground">
                        npm run recorder-worker
                      </code>
                    )}
                  </div>
                </div>
              )}

              {recorderStarting && (
                <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 text-indigo-600 animate-spin shrink-0" />
                    <span className="font-bold text-indigo-900 dark:text-indigo-300 text-sm">Launching Recording Session...</span>
                  </div>
                  <div className="pl-8 space-y-1">
                    <p className="text-xs text-indigo-700/80 dark:text-indigo-400/80 font-medium font-mono">{recorderLaunchStatus}</p>
                  </div>
                </div>
              )}
            </form>

            <div className="px-6 py-4 border-t flex justify-end gap-3 bg-accent/20">
              <Button
                variant="ghost"
                onClick={() => setShowRecorderModal(false)}
                disabled={recorderStarting}
              >
                Close
              </Button>
              {recorderProjectId && !recorderLoadingConfig && !activeSessionInfo && (
                <Button
                  onClick={handleStartRecorderSession}
                  disabled={recorderStarting || !recorderTitle.trim() || !recorderStartUrl.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/10"
                >
                  {recorderStarting ? (
                    <>
                      <Loader2 className="h-4.5 w-4.5 animate-spin" /> Launching...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Start Recorder
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Render XLSX Importer */}
      {showImportModal && importProjectId && (
        <ImportModal
          projectId={importProjectId}
          isOpen={showImportModal}
          onClose={() => {
            setShowImportModal(false)
            setImportProjectId("")
          }}
          onImportSuccess={() => {
            setProjectId(importProjectId)
            fetchData()
          }}
        />
      )}

      {/* 9. BULK RUN MODAL */}
      {showBulkRunModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-1.5">
              <Play className="h-5 w-5 text-indigo-500 fill-indigo-500/20" /> Bulk Execution Config
            </h3>
            
            <div className="space-y-4 text-xs font-semibold text-muted-foreground">
              <div className="space-y-1">
                <Label htmlFor="bulk-mode">Execution Mode</Label>
                <select
                  id="bulk-mode"
                  value={bulkMode}
                  onChange={(e) => setBulkMode(e.target.value as any)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="Automated Run">Automated Playwright Run</option>
                  <option value="Manual Session">Interactive Manual Session</option>
                </select>
              </div>

              {bulkMode === "Manual Session" && (
                <div className="space-y-1">
                  <Label htmlFor="bulk-session-name">Session Name</Label>
                  <Input
                    id="bulk-session-name"
                    value={bulkSessionName}
                    onChange={(e) => setBulkSessionName(e.target.value)}
                    className="text-foreground text-xs"
                    placeholder="e.g. Session validation"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="bulk-env">Environment</Label>
                <select
                  id="bulk-env"
                  value={bulkEnvironment}
                  onChange={(e) => setBulkEnvironment(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="Dev">Dev</option>
                  <option value="Staging">Staging</option>
                  <option value="UAT">UAT</option>
                  <option value="Production">Production</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="bulk-browser">Browser</Label>
                <select
                  id="bulk-browser"
                  value={bulkBrowser}
                  onChange={(e) => setBulkBrowser(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="Chromium">Chromium</option>
                  <option value="Firefox">Firefox</option>
                  <option value="WebKit">WebKit</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="bulk-viewport">Viewport</Label>
                <select
                  id="bulk-viewport"
                  value={bulkViewport}
                  onChange={(e) => setBulkViewport(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="Desktop">Desktop (1280x800)</option>
                  <option value="Tablet">Tablet (768x1024)</option>
                  <option value="Mobile">Mobile (375x667)</option>
                </select>
              </div>

              {credentials.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="bulk-role">Role Credential</Label>
                  <select
                    id="bulk-role"
                    value={bulkCredentialId}
                    onChange={(e) => setBulkCredentialId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value="">No Login Role (Run without login)</option>
                    {credentials.map((c) => (
                      <option key={c.id} value={c.id}>{c.roleName}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowBulkRunModal(false)}>Cancel</Button>
              <Button size="sm" disabled={bulkRunning} onClick={handleExecuteBulkRun}>
                {bulkRunning ? "Queueing..." : "Start Run"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 10. BULK MOVE MODAL */}
      {showBulkMoveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-lg p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-1.5">
              <Move className="h-5 w-5 text-indigo-500" /> Move Selected Test Cases
            </h3>

            <div className="space-y-4 text-xs font-semibold text-muted-foreground">
              <div className="space-y-1">
                <Label htmlFor="move-project">Target Project *</Label>
                <select
                  id="move-project"
                  value={moveProjectId}
                  onChange={(e) => {
                    setMoveProjectId(e.target.value)
                    setMoveModuleId("")
                    setMoveFeatureId("")
                    setMoveComponentId("")
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                >
                  <option value="">-- Select Target Project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {moveProjectId && (
                <div className="grid grid-cols-3 gap-2.5 pt-2 animate-in fade-in">
                  <div className="space-y-1">
                    <Label htmlFor="move-mod">Module</Label>
                    <select
                      id="move-mod"
                      value={moveModuleId}
                      onChange={(e) => {
                        setMoveModuleId(e.target.value)
                        setMoveFeatureId("")
                        setMoveComponentId("")
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
                    >
                      <option value="">Unassigned</option>
                      {moveHierarchyData.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="move-feat">Feature</Label>
                    <select
                      id="move-feat"
                      value={moveFeatureId}
                      disabled={!moveModuleId}
                      onChange={(e) => {
                        setMoveFeatureId(e.target.value)
                        setMoveComponentId("")
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {(moveHierarchyData.find((m) => m.id === moveModuleId)?.features || []).map((f: any) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="move-comp">Component</Label>
                    <select
                      id="move-comp"
                      value={moveComponentId}
                      disabled={!moveFeatureId}
                      onChange={(e) => setMoveComponentId(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {((moveHierarchyData.find((m) => m.id === moveModuleId)?.features || []).find((f: any) => f.id === moveFeatureId)?.components || []).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowBulkMoveModal(false)}>Cancel</Button>
              <Button size="sm" disabled={moveSaving || !moveProjectId} onClick={handleExecuteBulkMove}>
                {moveSaving ? "Moving..." : "Move Test Cases"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 11. BULK PRIORITY MODAL */}
      {showBulkPriorityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-1.5">
              <SlidersHorizontal className="h-5 w-5 text-indigo-500" /> Update Priority For Selected
            </h3>

            <div className="space-y-2">
              <Label htmlFor="target-priority">Target Priority Level</Label>
              <select
                id="target-priority"
                value={targetPriority}
                onChange={(e) => setTargetPriority(e.target.value)}
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
              <Button size="sm" disabled={prioritySaving} onClick={handleExecuteBulkPriority}>
                {prioritySaving ? "Updating..." : "Update Priorities"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl shadow-xl border flex items-center gap-3 animate-in slide-in-from-top duration-300 max-w-md ${
          toast.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-800 dark:text-emerald-200" 
            : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/80 dark:border-red-800 dark:text-red-200"
        }`}>
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {deleteTarget && (
        <ConfirmDialog
          open={deleteModalOpen}
          title={`Permanently delete test case "${deleteTarget.title}"?`}
          description={`This action will permanently delete:\n- The test case\n- All test steps\n- All execution history & test runs\n- All step results, screenshots, logs, and attachments\n\n${
            (deleteRunCount > 0 || deleteBugCount > 0)
              ? `Warning: This test case has ${deleteRunCount} execution run(s) and ${deleteBugCount} linked bug(s). Deleting it will remove all related evidence permanently.`
              : ""
          }`}
          confirmLabel="Delete Permanently"
          cancelLabel="Cancel"
          variant="danger"
          requireTextConfirmation={deleteTarget.title}
          onConfirm={executePermanentDelete}
          onCancel={() => { setDeleteModalOpen(false); setDeleteTarget(null) }}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmDialog
        open={showBulkDeleteModal}
        title={`Permanently Delete ${selectedIds.size} Selected Test Cases?`}
        description={`Are you absolutely sure you want to permanently delete all ${selectedIds.size} selected test cases along with all of their execution runs, steps, screenshots, bug reports, and logs? This action is irreversible.`}
        confirmLabel="Bulk Delete"
        cancelLabel="Cancel"
        variant="danger"
        requireTextConfirmation="DELETE"
        onConfirm={proceedBulkDelete}
        onCancel={() => setShowBulkDeleteModal(false)}
      />

    </div>
  )
}

export default function TestCasesHubPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground animate-pulse">Loading Test Cases Hub...</div>}>
      <TestCasesHubContent />
    </Suspense>
  )
}
