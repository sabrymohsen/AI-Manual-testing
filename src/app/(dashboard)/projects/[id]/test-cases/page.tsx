"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Edit2, 
  Trash2, 
  Play, 
  FileText, 
  Layers, 
  Box, 
  MoreVertical, 
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  CloudUpload,
  Link2,
  Sparkles,
  FileSpreadsheet,
  PlusCircle,
  ExternalLink,
  ChevronUp,
  X,
  FileCode,
  Settings,
  ShieldAlert,
  ArrowRight,
  ClipboardList,
  Pause,
  Video,
  FileDown,
  Zap,
  Check,
  AlertCircle
} from "lucide-react"
import { ImportModal } from "@/components/test-cases/import-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StepBuilder } from "@/components/test-cases/step-builder"
import { LinkedRequirementsSelector } from "@/components/test-cases/linked-requirements-selector"
import { OpenOnBoardLink } from "@/components/board/open-on-board-link"

// Interfaces matching database structure
interface TestStep {
  id?: string
  stepNumber: number
  actionDescription: string
  actionType: string
  targetType: string
  targetValue?: string | null
  inputValue?: string | null
  expectedResult?: string | null
  timeoutMs?: number
}

interface StepBuilderStep {
  actionDescription: string
  expectedResult: string
  actionType: string
  targetType: string
  targetValue: string
  inputValue: string
  timeoutMs: number
  assertions: any[]
}

interface TestCase {
  id: string
  title: string
  priority: string
  source: string
  executionType: string
  preconditions?: string | null
  steps: TestStep[]
  // Story links — classification (epic/feature) derives from these
  requirements?: Array<{
    requirementId: string
    requirement?: {
      id: string
      requirementKey: string
      title: string
      epicId: string | null
      featureId: string | null
      epic?: { id: string; epicKey: string; title: string } | null
      feature?: { id: string; featureKey: string; name: string } | null
    } | null
  }>
}

interface HistoryEntry {
  lastStatus: string
  lastRunAt: string
  source: "automated" | "manual"
  runId: string
  sessionName?: string
}

interface ActiveRun {
  testRunId: string
  projectId: string
  status: string
  currentStep: number | null
  totalSteps: number
}

interface HierarchyComponent {
  id: string
  name: string
  description?: string | null
  orderIndex: number
}

interface HierarchyFeature {
  id: string
  name: string
  description?: string | null
  orderIndex: number
  components: HierarchyComponent[]
}

interface HierarchyModule {
  id: string
  name: string
  description?: string | null
  orderIndex: number
  features: HierarchyFeature[]
}

export default function TestCasesPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  // Base Data States
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [hierarchy, setHierarchy] = useState<HierarchyModule[]>([])
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<Record<string, HistoryEntry>>({})
  const [syncMap, setSyncMap] = useState<Record<string, { externalId: string; externalUrl: string | null; lastSyncStatus: string | null }>>({})
  const [hasOpIntegration, setHasOpIntegration] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [bugs, setBugs] = useState<any[]>([])
  const [allTestRuns, setAllTestRuns] = useState<any[]>([])

  // Selection & selection path states
  const [selectedNodeType, setSelectedNodeType] = useState<"project" | "module" | "feature" | "component">("project")
  const [selectedNodeId, setSelectedNodeId] = useState<string>("")
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string>("")
  const [selectedIds, setSelectedIds] = useState<string[]>([]) // Checklist bulk selection
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["root"]))

  // Right Panel tab status
  const [activeRightTab, setActiveRightTab] = useState<"details" | "execution" | "bugs" | "integrations">("details")

  // Traceability engine filters
  const [traceFilter, setTraceFilter] = useState<"all" | "orphans" | "broken">("all")

  // Dynamic search/filters
  const [searchQuery, setSearchQuery] = useState("")
  const [filterPriority, setFilterPriority] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterExecutionType, setFilterExecutionType] = useState("")

  // Delete Case Confirm Modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTestCaseId, setDeleteTestCaseId] = useState("")
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Import Dialog
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // Slide-Over Drawers Configurations
  const [showCreateDrawer, setShowCreateDrawer] = useState(false)
  const [createTitle, setCreateTitle] = useState("")
  const [createPriority, setCreatePriority] = useState("Medium")
  const [createPreconditions, setCreatePreconditions] = useState("")
  const [createSteps, setCreateSteps] = useState<StepBuilderStep[]>([])
  const [createRequirementIds, setCreateRequirementIds] = useState<string[]>([])
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState("")

  // Recorder configurations
  const [showRecorderDrawer, setShowRecorderDrawer] = useState(false)
  const [projectConfig, setProjectConfig] = useState<any>(null)
  const [recTitle, setRecTitle] = useState("")
  const [recStartUrl, setRecStartUrl] = useState("")
  const [recBrowser, setRecBrowser] = useState<"Chromium" | "Firefox" | "WebKit">("Chromium")
  const [recViewport, setRecViewport] = useState<"Desktop" | "Tablet" | "Mobile">("Desktop")
  const [recPriority, setRecPriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium")
  const [recPreconditions, setRecPreconditions] = useState("")
  const [activeSession, setActiveSession] = useState<any>(null)
  const [recStarting, setRecStarting] = useState(false)
  const [recError, setRecError] = useState("")
  const [recSteps, setRecSteps] = useState<any[]>([])
  const [recLogs, setRecLogs] = useState<string[]>([])
  const pollingInterval = useRef<any>(null)

  // Active Playwright Runs progress tracking
  const [activeRuns, setActiveRuns] = useState<Map<string, ActiveRun>>(new Map())
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Core Data Fetchers
  async function fetchTestCases() {
    try {
      const res = await fetch(`/api/projects/${projectId}/test-cases`)
      if (res.ok) {
        const data = await res.json()
        setTestCases(data.testCases || [])
      }
    } catch (err) {
      console.error("Error loading test cases:", err)
    }
  }

  async function fetchHierarchy() {
    try {
      // Tree = Epics → Features (derived from the story hierarchy); test cases
      // fall into nodes via their linked user stories.
      const [epicRes, featRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/epics`),
        fetch(`/api/projects/${projectId}/features`),
      ])
      if (epicRes.ok && featRes.ok) {
        const epics = (await epicRes.json()).epics || []
        const features = (await featRes.json()).features || []
        const tree: HierarchyModule[] = epics.map((e: any) => ({
          id: e.id,
          name: `${e.epicKey} — ${e.title}`,
          orderIndex: e.orderIndex ?? 0,
          features: features
            .filter((f: any) => f.epic?.id === e.id)
            .map((f: any) => ({ id: f.id, name: `${f.featureKey} — ${f.name}`, orderIndex: f.orderIndex ?? 0, components: [] })),
        }))
        const orphanFeatures = features.filter((f: any) => !f.epic)
        if (orphanFeatures.length > 0) {
          tree.push({
            id: "__noepic__",
            name: "No Epic",
            orderIndex: 9999,
            features: orphanFeatures.map((f: any) => ({ id: f.id, name: `${f.featureKey} — ${f.name}`, orderIndex: f.orderIndex ?? 0, components: [] })),
          })
        }
        setHierarchy(tree)
      }
      return
      // Legacy path (endpoint removed):
      const res = await fetch(`/api/projects/${projectId}/hierarchy`)
      if (res.ok) {
        const data = await res.json()
        setHierarchy(data.modules || [])
      }
    } catch (err) {
      console.error("Error loading hierarchy:", err)
    }
  }

  async function fetchHistory() {
    try {
      const res = await fetch(`/api/projects/${projectId}/test-cases/history`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data.history || {})
      }
    } catch {}
  }

  async function fetchSyncStatus() {
    try {
      const [statusRes, opRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/integrations/sync-status`),
        fetch(`/api/projects/${projectId}/integrations/openproject`),
      ])
      if (statusRes.ok) {
        const data = await statusRes.json()
        setSyncMap(data.syncMap || {})
      }
      if (opRes.ok) {
        const data = await opRes.json()
        setHasOpIntegration(!!data.integration?.hasToken)
      }
    } catch {}
  }

  async function fetchBugs() {
    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports`)
      if (res.ok) {
        const data = await res.json()
        setBugs(data.bugReports || [])
      }
    } catch {}
  }

  async function fetchTestRuns() {
    try {
      const res = await fetch(`/api/projects/${projectId}/test-runs`)
      if (res.ok) {
        const data = await res.json()
        setAllTestRuns(data.testRuns || [])
      }
    } catch {}
  }

  async function fetchRecordingConfig() {
    try {
      const [configRes, activeRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/recording-config`),
        fetch(`/api/recording/sessions/active?projectId=${projectId}`)
      ])
      if (configRes.ok) {
        const config = await configRes.json()
        setProjectConfig(config)
        if (!recStartUrl) setRecStartUrl(config.project?.baseUrl || "")
      }
      if (activeRes.ok) {
        const active = await activeRes.json()
        if (active.session) {
          setActiveSession(active.session)
          startPollingRecordingSteps(active.session.id)
        }
      }
    } catch {}
  }

  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      await Promise.all([
        fetchTestCases(),
        fetchHierarchy(),
        fetchHistory(),
        fetchSyncStatus(),
        fetchBugs(),
        fetchTestRuns(),
        fetchRecordingConfig()
      ])
      setLoading(false)
    }
    loadAll()
  }, [projectId])

  // Poll Playwright runs progress
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
              fetchTestCases()
              fetchHistory()
              fetchTestRuns()
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
        } catch {}
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

  // Clean recording interval on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval.current) clearInterval(pollingInterval.current)
    }
  }, [])

  // ── Recorder Flow API Integrations ─────────────────────────────────────────

  async function handleStartRecording(e: React.FormEvent) {
    e.preventDefault()
    if (!recTitle.trim() || !recStartUrl.trim()) {
      setRecError("Test Title and Starting URL are required")
      return
    }

    setRecStarting(true)
    setRecError("")
    setRecLogs(["Initializing recording setup...", "Checking container worker environment..."])

    try {
      const res = await fetch(`/api/projects/${projectId}/recording/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: recTitle,
          priority: recPriority,
          preconditions: recPreconditions || undefined,
          requiredCredentialId: recCredentialId || null,
          startUrl: recStartUrl,
          browserType: recBrowser,
          viewport: recViewport,
          recordingMode: "Fast"
        })
      })

      if (res.ok) {
        const data = await res.json()
        setActiveSession(data.session)
        setRecLogs((prev) => [...prev, "Playwright browser launched successfully!", "Injecting recording toolbar..."])
        startPollingRecordingSteps(data.session.id)
      } else {
        const err = await res.json()
        setRecError(err.error || "Failed to start Playwright browser")
      }
    } catch {
      setRecError("Network error launching recorder")
    } finally {
      setRecStarting(false)
    }
  }

  function startPollingRecordingSteps(sessionId: string) {
    if (pollingInterval.current) clearInterval(pollingInterval.current)
    pollingInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/recording/${sessionId}/steps`)
        if (res.ok) {
          const data = await res.json()
          setRecSteps(data.steps || [])
        }
      } catch {}
    }, 1500)
  }

  async function handleUpdateRecStep(stepId: string, expectedResult: string, description: string) {
    try {
      await fetch(`/api/recording/steps/${stepId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedResult, actionDescription: description })
      })
    } catch {}
  }

  async function handleDeleteRecStep(stepId: string) {
    try {
      const res = await fetch(`/api/recording/steps/${stepId}`, { method: "DELETE" })
      if (res.ok) {
        setRecSteps((prev) => prev.filter((s) => s.id !== stepId))
      }
    } catch {}
  }

  async function handleFinishRecording() {
    if (!activeSession) return
    try {
      const res = await fetch(`/api/recording/${activeSession.id}/finish`, { method: "POST" })
      if (res.ok) {
        if (pollingInterval.current) clearInterval(pollingInterval.current)
        setActiveSession(null)
        setRecSteps([])
        setShowRecorderDrawer(false)
        setToast({ message: "Test Case successfully saved from recording session!", type: "success" })
        fetchTestCases()
        fetchHierarchy()
      }
    } catch {}
  }

  async function handleCancelRecording() {
    if (!activeSession) return
    try {
      await fetch(`/api/recording/${activeSession.id}/cancel`, { method: "POST" })
      if (pollingInterval.current) clearInterval(pollingInterval.current)
      setActiveSession(null)
      setRecSteps([])
      setShowRecorderDrawer(false)
    } catch {}
  }

  // ── Node & Test Case Handlers ──────────────────────────────────────────────

  const toggleNodeExpand = (id: string) => {
    const next = new Set(expandedNodes)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedNodes(next)
  }

  const selectNode = (type: "project" | "module" | "feature" | "component", id: string) => {
    setSelectedNodeType(type)
    setSelectedNodeId(id)
  }

  async function handleRunTestCase(tc: TestCase) {
    if (activeRuns.has(tc.id)) return

    if (tc.executionType === "Manual") {
      try {
        const res = await fetch(`/api/projects/${projectId}/manual-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Manual Run: ${tc.title}`,
            environment: "Staging",
            browserType: "Chromium",
            viewport: "Desktop",
            keepBrowserSession: true,
            stopOnFailure: false,
            testCaseIds: [tc.id],
          })
        })
        if (res.ok) {
          const session = await res.json()
          router.push(`/projects/${projectId}/manual-sessions/${session.id}`)
        } else {
          setToast({ message: "Failed to start manual session", type: "error" })
        }
      } catch {
        setToast({ message: "Network error starting manual session", type: "error" })
      }
      return
    }

    // Automated test cases are queued for Playwright execution.
    // Navigate to the run report so the user can watch it execute live
    // (mirrors the Manual branch above, which opens the manual session).
    try {
      const res = await fetch(`/api/projects/${projectId}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: tc.id })
      })
      if (res.ok) {
        const data = await res.json()
        setToast({ message: `Launched automated run for "${tc.title}"`, type: "success" })
        router.push(`/projects/${projectId}/test-runs/${data.testRun.id}/report`)
      } else {
        const err = await res.json().catch(() => ({}))
        setToast({ message: err.error || "Failed to start automated run", type: "error" })
      }
    } catch {
      setToast({ message: "Network error starting automated run", type: "error" })
    }
  }

  async function handleSyncSingleOP(tcId: string) {
    setIsSyncing(true)
    try {
      const res = await fetch(`/api/test-cases/${tcId}/sync/openproject`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setToast({ message: `Successfully synced test case to OpenProject.`, type: "success" })
        fetchSyncStatus()
      } else {
        setToast({ message: data.error || "Sync failed", type: "error" })
      }
    } catch {
      setToast({ message: "Network error during sync", type: "error" })
    } finally {
      setIsSyncing(false)
    }
  }

  // Bulk Operations
  async function handleBulkRun() {
    if (selectedIds.length === 0) return

    // Split selection by execution type
    const selectedCases = testCases.filter((tc) => selectedIds.includes(tc.id))
    const manualIds = selectedCases.filter((tc) => tc.executionType === "Manual").map((tc) => tc.id)
    const automatedIds = selectedCases.filter((tc) => tc.executionType === "Automated").map((tc) => tc.id)

    // Manual selection → open all of them together in one manual run session
    if (manualIds.length > 0) {
      try {
        // Queue any automated ones too (best-effort) before opening the manual session
        if (automatedIds.length > 0) {
          await fetch("/api/test-cases/bulk-run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              testCaseIds: automatedIds,
              executionMode: "Automated Run",
              browserType: "Chromium",
              viewport: "Desktop",
              environment: "Staging",
            }),
          }).catch(() => {})
        }

        const res = await fetch(`/api/projects/${projectId}/manual-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Manual Run: ${manualIds.length} case(s)`,
            environment: "Staging",
            browserType: "Chromium",
            viewport: "Desktop",
            keepBrowserSession: true,
            stopOnFailure: false,
            testCaseIds: manualIds,
          }),
        })
        if (res.ok) {
          const session = await res.json()
          setSelectedIds([])
          router.push(`/projects/${projectId}/manual-sessions/${session.id}`)
        } else {
          const err = await res.json().catch(() => ({}))
          setToast({ message: err.error || "Failed to start manual session", type: "error" })
        }
      } catch {
        setToast({ message: "Network error starting manual session", type: "error" })
      }
      return
    }

    // All-automated selection → existing queued Playwright bulk run
    try {
      const res = await fetch("/api/test-cases/bulk-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCaseIds: selectedIds,
          executionMode: "Automated Run",
          browserType: "Chromium",
          viewport: "Desktop",
          environment: "Staging"
        })
      })
      if (res.ok) {
        const data = await res.json()
        const newRuns = new Map(activeRuns)
        if (data.runs) {
          data.runs.forEach((r: any) => {
            const tc = testCases.find(t => t.id === r.testCaseId)
            newRuns.set(r.testCaseId, {
              testRunId: r.id,
              projectId,
              status: r.status,
              currentStep: null,
              totalSteps: tc?.steps?.length || 0
            })
          })
        }
        setActiveRuns(newRuns)
        setSelectedIds([])
        setToast({ message: `Queued bulk automated runs successfully.`, type: "success" })
        fetchTestCases()
        fetchHistory()
        fetchTestRuns()
      }
    } catch {}
  }

  async function handleBulkSync() {
    if (selectedIds.length === 0) return
    setIsSyncing(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/sync-test-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseIds: selectedIds })
      })
      if (res.ok) {
        setToast({ message: "Synced selected cases to OpenProject successfully", type: "success" })
        setSelectedIds([])
        fetchSyncStatus()
      }
    } catch {
      setToast({ message: "Sync failed", type: "error" })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleExportSelection() {
    if (selectedIds.length === 0) return
    try {
      const res = await fetch("/api/test-cases/bulk-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseIds: selectedIds })
      })
      if (res.ok) {
        const data = await res.json()
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data.testCases, null, 2))}`
        const anchor = document.createElement("a")
        anchor.setAttribute("href", jsonString)
        anchor.setAttribute("download", `test-cases-export-${Date.now()}.json`)
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        setSelectedIds([])
      }
    } catch {}
  }

  const handleOpenCreateCaseDrawer = () => {
    setCreateTitle("")
    setCreatePreconditions("")
    setCreateSteps([])
    setCreateRequirementIds([])
    setCreateError("")
    setShowCreateDrawer(true)
  }

  // Save new single inline testcase
  async function handleSaveNewTestCase(e: React.FormEvent) {
    e.preventDefault()
    if (!createTitle.trim()) {
      setCreateError("Title is required")
      return
    }

    setCreateSaving(true)
    setCreateError("")

    try {
      const res = await fetch(`/api/projects/${projectId}/test-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle,
          priority: createPriority,
          preconditions: createPreconditions || null,
          source: "Manual",
          executionType: "Manual",
          steps: createSteps.map((s, idx) => ({ ...s, stepNumber: idx + 1 })),
          requirementIds: createRequirementIds
        })
      })

      if (res.ok) {
        setShowCreateDrawer(false)
        setCreateTitle("")
        setCreatePreconditions("")
        setCreateSteps([])
        setCreateRequirementIds([])
        fetchTestCases()
        fetchHierarchy()
      } else {
        const data = await res.json()
        setCreateError(data.error || "Failed to save testcase")
      }
    } catch {
      setCreateError("Network error saving testcase")
    } finally {
      setCreateSaving(false)
    }
  }

  // ── Selected Node Helpers & Render Filters ─────────────────────────────────

  const activeTestCase = testCases.find((tc) => tc.id === selectedTestCaseId)

  // Traceability Validation Engine Calculations
  const getTraceabilityDetails = (tc: TestCase) => {
    const isOrphan = !tc.requirements || tc.requirements.length === 0
    const tcHistory = history[tc.id]
    const hasRuns = !!tcHistory
    const lastStatus = tcHistory?.lastStatus || "NotExecuted"
    const isSynced = !!syncMap[tc.id]
    const linkedBugs = bugs.filter(b => b.testCaseId === tc.id)
    const hasBugs = linkedBugs.length > 0

    // Broken links detection criteria
    const isBroken = !hasRuns || (lastStatus === "Failed" && !hasBugs) || !isSynced

    return { isOrphan, isBroken, hasRuns, lastStatus, isSynced, linkedBugs }
  }

  // Filter test cases list for component/feature/module
  const getFilteredTestCases = () => {
    let list = testCases

    // Hierarchy filter
    if (selectedNodeType === "module" || selectedNodeType === "feature" || selectedNodeType === "component") {
      list = list.filter((tc) => tcInNode(tc, selectedNodeType, selectedNodeId))
    }

    // Dynamic Filter
    if (filterExecutionType) {
      list = list.filter((tc) => tc.executionType === filterExecutionType)
    }
    if (filterPriority) {
      list = list.filter((tc) => tc.priority === filterPriority)
    }
    if (filterStatus) {
      list = list.filter((tc) => {
        const { lastStatus } = getTraceabilityDetails(tc)
        return lastStatus === filterStatus
      })
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (tc) =>
          tc.title.toLowerCase().includes(q) ||
          (tc.preconditions && tc.preconditions.toLowerCase().includes(q))
      )
    }

    // Traceability filters
    if (traceFilter === "orphans") {
      list = list.filter((tc) => getTraceabilityDetails(tc).isOrphan)
    } else if (traceFilter === "broken") {
      list = list.filter((tc) => getTraceabilityDetails(tc).isBroken)
    }

    return list
  }

  const filteredList = getFilteredTestCases()

  // A test case belongs to an epic/feature node through its linked stories
  const tcInNode = (tc: TestCase, type: "module" | "feature" | "component", id: string) => {
    const links = tc.requirements || []
    if (type === "module") {
      if (id === "__noepic__") return links.some(l => l.requirement && !l.requirement.epicId && l.requirement.featureId)
      return links.some(l => l.requirement?.epicId === id)
    }
    if (type === "feature") return links.some(l => l.requirement?.featureId === id)
    return false
  }

  const countCasesInNode = (type: "module" | "feature" | "component", id: string) =>
    testCases.filter((t) => tcInNode(t, type, id)).length

  // Calculate nodes execution status aggregates (e.g. 85% pass rate)
  const getNodePassRate = (type: "module" | "feature" | "component", id: string) => {
    const nodeCases = testCases.filter((t) => tcInNode(t, type, id))

    if (nodeCases.length === 0) return null

    const passed = nodeCases.filter(tc => history[tc.id]?.lastStatus === "Passed").length
    return Math.round((passed / nodeCases.length) * 100)
  }

  // Bulk Operations Handlers
  const toggleSelectCase = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredList.map(tc => tc.id)
    const allSelected = visibleIds.every(id => selectedIds.includes(id))
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)))
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  // Delete Case Hook
  // Bulk delete: reuses the single-case DELETE endpoint (with its full cascade
  // cleanup) per selected id, then reports a success/failure summary.
  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    setBulkDeleting(true)
    try {
      const results = await Promise.allSettled(
        selectedIds.map((id) =>
          fetch(`/api/projects/${projectId}/test-cases/${id}`, { method: "DELETE" })
        )
      )
      const succeeded = results.filter(
        (r) => r.status === "fulfilled" && r.value.ok
      ).length
      const failed = selectedIds.length - succeeded

      if (failed === 0) {
        setToast({ message: `${succeeded} test case(s) deleted.`, type: "success" })
      } else {
        setToast({ message: `${succeeded} deleted, ${failed} failed.`, type: "error" })
      }
      if (selectedTestCaseId && selectedIds.includes(selectedTestCaseId)) setSelectedTestCaseId("")
      setSelectedIds([])
      fetchTestCases()
      fetchHistory()
    } catch {
      setToast({ message: "Network error during bulk delete", type: "error" })
    } finally {
      setBulkDeleting(false)
    }
  }

  async function triggerDeleteTestCase(tcId: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/test-cases/${tcId}`, {
        method: "DELETE"
      })
      if (res.ok) {
        setToast({ message: "Test Case successfully deleted.", type: "success" })
        if (selectedTestCaseId === tcId) setSelectedTestCaseId("")
        fetchTestCases()
        fetchHistory()
      } else {
        setToast({ message: "Failed to delete testcase", type: "error" })
      }
    } catch {
      setToast({ message: "Network error deleting testcase", type: "error" })
    }
  }

  const [recCredentialId, setRecCredentialId] = useState("")
  const [recPriorityStr, setRecPriorityStr] = useState("Medium")
  const [recPreconditionsStr, setRecPreconditionsStr] = useState("")

  const [credentials, setCredentials] = useState<any[]>([])
  useEffect(() => {
    async function loadCredentials() {
      try {
        const res = await fetch(`/api/projects/${projectId}/credentials`)
        if (res.ok) {
          const data = await res.json()
          setCredentials(data.credentials || [])
        }
      } catch {}
    }
    loadCredentials()
  }, [projectId])

  const passedCount = testCases.filter((tc) => history[tc.id]?.lastStatus === "Passed").length
  const failedCount = testCases.filter((tc) => history[tc.id]?.lastStatus === "Failed").length
  const notRunCount = testCases.filter((tc) => !history[tc.id]).length
  const automatedCount = testCases.filter((tc) => tc.executionType === "Automated").length

  return (
    <div className="flex flex-col h-full overflow-hidden select-none bg-muted/30">
      
      {/* Toast Alert popup overlay */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-xs font-bold transition-all duration-300 animate-in slide-in-from-top ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* Page header band */}
      <div className="px-6 pt-5 pb-4 bg-card border-b shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
                <FileText className="h-4 w-4" />
              </span>
              Test Cases
            </h1>
            <p className="text-xs text-muted-foreground">
              Author, organize, and execute this project&apos;s manual and automated test suites.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsImportModalOpen(true)}
              className="h-9 text-xs font-semibold flex items-center gap-1.5 px-3.5 rounded-xl"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Import
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRecorderDrawer(true)}
              className="h-9 text-xs font-semibold flex items-center gap-1.5 px-3.5 rounded-xl"
            >
              <Video className="h-3.5 w-3.5 text-rose-500" /> Record
            </Button>
            <Button
              size="sm"
              onClick={handleOpenCreateCaseDrawer}
              className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 px-4 rounded-xl shadow-md shadow-indigo-600/25"
            >
              <Plus className="h-4 w-4" /> New Test Case
            </Button>
          </div>
        </div>

        {/* Stat chips */}
        <div className="flex items-center gap-2 mt-4 flex-wrap text-[11px] font-bold">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-foreground">
            <Layers className="h-3 w-3 text-indigo-500" /> {testCases.length} total
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {passedCount} passed
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {failedCount} failed
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> {notRunCount} not run
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-400">
            <Zap className="h-3 w-3" /> {automatedCount} automated
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

      {/* Left panel: test suite tree */}
      <aside className="w-72 border-r bg-card flex flex-col overflow-y-auto shrink-0 select-none">

        {/* Tree */}
        <div className="p-3 space-y-1">
          {/* Project node */}
          <div
            onClick={() => selectNode("project", "")}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-all ${
              selectedNodeType === "project"
                ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/25"
                : "hover:bg-accent/60 text-foreground"
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Layers className={`h-4 w-4 shrink-0 ${selectedNodeType === "project" ? "text-white" : "text-indigo-500"}`} /> All Test Cases
            </span>
            <span className={`text-[11px] tabular-nums font-bold px-2 py-0.5 rounded-md ${
              selectedNodeType === "project" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            }`}>
              {testCases.length}
            </span>
          </div>

          <div className="pt-3 pb-1 px-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Epics &amp; Features</span>
          </div>

          {/* Modules Tree */}
          <div className="space-y-1">
            {hierarchy.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs leading-relaxed">
                No epics yet — create Epics and Features on the Requirements page.
              </div>
            ) : (
              hierarchy.map((mod) => {
                const isModExpanded = expandedNodes.has(mod.id)
                const modCases = countCasesInNode("module", mod.id)
                const modPassRate = getNodePassRate("module", mod.id)
                
                return (
                  <div key={mod.id} className="space-y-0.5">
                    {/* Module row */}
                    <div className={`group flex flex-col gap-1.5 pl-2 pr-2.5 py-2 rounded-xl cursor-pointer text-sm transition-colors ${
                      selectedNodeType === "module" && selectedNodeId === mod.id ? "bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-500/10 dark:text-indigo-400" : "hover:bg-accent/60"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span
                          onClick={() => { selectNode("module", mod.id); toggleNodeExpand(mod.id) }}
                          className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5"
                        >
                          {isModExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          <Folder className="h-4 w-4 text-indigo-400 shrink-0" />
                          <span className="truncate text-[13px] font-medium" title={mod.name}>{mod.name}</span>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {modPassRate !== null && (
                            <span className={`text-[10px] font-bold tabular-nums ${
                              modPassRate >= 90 ? "text-emerald-600 dark:text-emerald-400" :
                              modPassRate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                            }`}>
                              {modPassRate}%
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground tabular-nums bg-muted rounded-md px-1.5 py-0.5 font-semibold">
                            {modCases}
                          </span>
                        </div>
                      </div>
                      {modPassRate !== null && (
                        <div className="h-1 rounded-full bg-muted overflow-hidden ml-5 mr-1">
                          <div
                            className={`h-full rounded-full transition-all ${
                              modPassRate >= 90 ? "bg-emerald-500" : modPassRate >= 50 ? "bg-amber-500" : "bg-red-500"
                            }`}
                            style={{ width: `${modPassRate}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Features list */}
                    {isModExpanded && (
                      <div className="pl-3 border-l ml-3.5 space-y-0.5">
                        {mod.features.map((feat) => {
                          const isFeatExpanded = expandedNodes.has(feat.id)
                          const featCases = countCasesInNode("feature", feat.id)
                          const featPassRate = getNodePassRate("feature", feat.id)
                          
                          return (
                            <div key={feat.id} className="space-y-0.5">
                              {/* Feature row */}
                              <div className={`group flex items-center justify-between pl-1.5 pr-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                                selectedNodeType === "feature" && selectedNodeId === feat.id ? "bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-500/10 dark:text-indigo-400" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                              }`}>
                                <span
                                  onClick={() => { selectNode("feature", feat.id); toggleNodeExpand(feat.id) }}
                                  className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5"
                                >
                                  {isFeatExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                  <FolderOpen className="h-4 w-4 text-violet-400 shrink-0" />
                                  <span className="truncate" title={feat.name}>{feat.name}</span>
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {featPassRate !== null && (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{featPassRate}%</span>
                                  )}
                                  <span className="text-xs text-muted-foreground tabular-nums group-hover:hidden">{featCases}</span>
                                </div>
                              </div>

                              {/* Components list */}
                              {isFeatExpanded && (
                                <div className="pl-3 border-l ml-3.5 space-y-0.5">
                                  {feat.components.map((comp) => {
                                    const compCases = countCasesInNode("component", comp.id)
                                    const isCompSelected = selectedNodeType === "component" && selectedNodeId === comp.id
                                    return (
                                      <div
                                        key={comp.id}
                                        onClick={() => selectNode("component", comp.id)}
                                        className={`group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                                          isCompSelected ? "bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-500/10 dark:text-indigo-400" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                        }`}
                                      >
                                        <span className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5">
                                          <Box className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                          <span className="truncate" title={comp.name}>{comp.name}</span>
                                        </span>
                                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{compCases}</span>
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
              })
            )}
          </div>
        </div>
      </aside>

      {/* Center panel: test case list */}
      <div className="flex-1 flex flex-col overflow-hidden bg-muted/20 min-w-0">

        {/* Header */}
        <div className="px-5 py-3 border-b flex items-center justify-between gap-4 bg-card">
          <div className="min-w-0 flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-foreground tracking-tight truncate">
              {selectedNodeType === "project" && "All Test Cases"}
              {selectedNodeType === "module" && (hierarchy.find(m => m.id === selectedNodeId)?.name || "Epic")}
              {selectedNodeType === "feature" && (hierarchy.flatMap(m => m.features).find(f => f.id === selectedNodeId)?.name || "Feature")}
              {selectedNodeType === "component" && (hierarchy.flatMap(m => m.features).flatMap(f => f.components).find(c => c.id === selectedNodeId)?.name || "Component")}
            </h2>
            <span className="text-[11px] font-bold text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 tabular-nums shrink-0">
              {filteredList.length === testCases.length
                ? `${testCases.length} case${testCases.length === 1 ? "" : "s"}`
                : `${filteredList.length} of ${testCases.length}`}
            </span>
          </div>
        </div>

        {/* Toolbar: search + filters */}
        <div className="px-5 py-2.5 border-b bg-card flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search test cases..."
              className="pl-9 h-9 w-60 text-xs bg-muted/50 border-transparent rounded-xl focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-indigo-500"
            />
          </div>
          <select
            value={filterExecutionType}
            onChange={(e) => setFilterExecutionType(e.target.value)}
            className="h-9 rounded-xl border text-xs font-semibold bg-background text-foreground px-2.5 cursor-pointer"
          >
            <option value="">All types</option>
            <option value="Automated">Automated</option>
            <option value="Manual">Manual</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="h-9 rounded-xl border text-xs font-semibold bg-background text-foreground px-2.5 cursor-pointer"
          >
            <option value="">All priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-xl border text-xs font-semibold bg-background text-foreground px-2.5 cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="Passed">Passed</option>
            <option value="Failed">Failed</option>
            <option value="NotExecuted">Not run</option>
          </select>

          <span className="h-5 w-px bg-border mx-1" />

          <button
            onClick={() => setTraceFilter(traceFilter === "orphans" ? "all" : "orphans")}
            className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
              traceFilter === "orphans"
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Orphans
            <span className="tabular-nums rounded-full bg-black/5 dark:bg-white/10 px-1.5">{testCases.filter(tc => !tc.requirements || tc.requirements.length === 0).length}</span>
          </button>
          <button
            onClick={() => setTraceFilter(traceFilter === "broken" ? "all" : "broken")}
            className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
              traceFilter === "broken"
                ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" /> Broken links
            <span className="tabular-nums rounded-full bg-black/5 dark:bg-white/10 px-1.5">{testCases.filter(tc => getTraceabilityDetails(tc).isBroken).length}</span>
          </button>
        </div>

        {/* Content scroll panel */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">

          {/* Bulk action bar */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-lg animate-in slide-in-from-top duration-200 gap-3 flex-wrap">
              <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
                {selectedIds.length} selected
              </span>
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={handleBulkRun} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
                  <Play className="h-3.5 w-3.5 fill-current" /> Run
                </Button>
                {hasOpIntegration && (
                  <Button size="sm" variant="outline" onClick={handleBulkSync} className="flex items-center gap-1.5 text-xs h-8">
                    <CloudUpload className="h-3.5 w-3.5" /> Sync
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleExportSelection} className="flex items-center gap-1.5 text-xs h-8">
                  <FileDown className="h-3.5 w-3.5" /> Export
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkDeleteConfirmOpen(true)}
                  disabled={bulkDeleting}
                  className="flex items-center gap-1.5 text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {bulkDeleting ? "Deleting..." : "Delete"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} className="text-xs h-8 text-muted-foreground">
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Test case list */}
          {filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-sm mx-auto select-none">
              <div className="p-4 rounded-full bg-muted text-muted-foreground">
                <FileText className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">No test cases found</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Create one manually, record a session with the Playwright recorder, or import from Excel.
                </p>
              </div>
              <Button size="sm" onClick={handleOpenCreateCaseDrawer} className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-xs flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> New Test Case
              </Button>
            </div>
          ) : (
            <div>
              <label className="flex items-center gap-2 px-4 pb-2 text-xs text-muted-foreground cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={filteredList.length > 0 && filteredList.every(tc => selectedIds.includes(tc.id))}
                  onChange={toggleSelectAllVisible}
                  className="rounded border-input text-indigo-600 focus:ring-indigo-500"
                />
                Select all visible
              </label>

              <div className="space-y-2">
                {filteredList.map((tc) => {
                  const { isOrphan, isBroken, hasRuns, lastStatus, isSynced, linkedBugs } = getTraceabilityDetails(tc)
                  const isSelected = selectedTestCaseId === tc.id
                  const runInfo = activeRuns.get(tc.id)

                  return (
                    <div
                      key={tc.id}
                      onClick={() => setSelectedTestCaseId(tc.id)}
                      className={`group relative flex items-center gap-3 pl-5 pr-4 py-3.5 cursor-pointer transition-all rounded-xl border bg-card overflow-hidden ${
                        isSelected
                          ? "border-indigo-300 dark:border-indigo-500/50 shadow-md shadow-indigo-500/10 bg-indigo-50/40 dark:bg-indigo-500/[0.06]"
                          : "hover:border-indigo-200 dark:hover:border-indigo-500/30 hover:shadow-sm"
                      }`}
                    >
                      {/* Status accent strip */}
                      <span className={`absolute left-0 top-0 bottom-0 w-1 ${
                        runInfo ? "bg-amber-400" :
                        lastStatus === "Passed" ? "bg-emerald-500" :
                        lastStatus === "Failed" ? "bg-red-500" : "bg-slate-300 dark:bg-slate-700"
                      }`} />

                      <input
                        type="checkbox"
                        checked={selectedIds.includes(tc.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSelectCase(tc.id) }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-input text-indigo-600 focus:ring-indigo-500 shrink-0"
                      />

                      {/* Execution type icon */}
                      <span
                        className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${
                          tc.executionType === "Automated"
                            ? "bg-violet-50 text-violet-500 dark:bg-violet-500/10"
                            : "bg-muted text-muted-foreground"
                        }`}
                        title={tc.executionType === "Automated" ? "Automated (Playwright)" : "Manual test case"}
                      >
                        {tc.executionType === "Automated"
                          ? <Zap className="h-4 w-4" />
                          : <ClipboardList className="h-4 w-4" />}
                      </span>

                      {/* Title + meta */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-foreground truncate" title={tc.title}>
                            {tc.title}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                            tc.priority === "Critical" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" :
                            tc.priority === "High" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400" :
                            tc.priority === "Medium" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {tc.priority}
                          </span>
                          {isOrphan && (
                            <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" title="Not assigned to any module">
                              <ShieldAlert className="h-3 w-3" /> Orphan
                            </span>
                          )}
                          {isBroken && (
                            <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" title="Missing runs, bugs, or sync links">
                              <AlertCircle className="h-3 w-3" /> Broken
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground min-w-0">
                          <span>{tc.source}</span>
                          {(tc.requirements?.[0]?.requirement?.feature || tc.requirements?.[0]?.requirement?.epic) && (
                            <>
                              <span>&middot;</span>
                              <span className="truncate">
                                {tc.requirements![0].requirement!.feature?.name || tc.requirements![0].requirement!.epic?.title}
                              </span>
                            </>
                          )}
                          {linkedBugs.length > 0 && (
                            <>
                              <span>&middot;</span>
                              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 shrink-0">
                                <AlertTriangle className="h-3 w-3" /> {linkedBugs.length} bug{linkedBugs.length > 1 ? "s" : ""}
                              </span>
                            </>
                          )}
                          {(tc.requirements || []).slice(0, 2).map((l) => l.requirement && (
                            <OpenOnBoardLink key={l.requirementId} projectId={projectId} requirementId={l.requirementId} requirementKey={l.requirement.requirementKey} />
                          ))}
                        </div>
                      </div>

                      {/* Status + quick actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isSynced && (
                          <CloudUpload className="h-3.5 w-3.5 text-blue-500" aria-label="Synced to OpenProject" />
                        )}

                        {runInfo ? (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {runInfo.currentStep ? `Step ${runInfo.currentStep}/${runInfo.totalSteps}` : "Running"}
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            lastStatus === "Passed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" :
                            lastStatus === "Failed" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {lastStatus === "Passed" ? "Passed" : lastStatus === "Failed" ? "Failed" : "Not run"}
                          </span>
                        )}

                        <div
                          className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                            onClick={() => handleRunTestCase(tc)}
                            disabled={!!runInfo}
                            title="Run test case"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                            onClick={() => handleSyncSingleOP(tc.id)}
                            title="Sync to OpenProject"
                          >
                            <CloudUpload className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                            onClick={() => { setDeleteTestCaseId(tc.id); setDeleteConfirmOpen(true) }}
                            title="Delete test case"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Right panel: details + traceability */}
      <aside className="w-[380px] border-l bg-card flex flex-col overflow-hidden shrink-0 select-none">
        {activeTestCase ? (
          <div className="h-full flex flex-col overflow-hidden">

            {/* Header */}
            <div className="px-4 py-3.5 border-b space-y-2.5 bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-widest font-black text-indigo-500">Test Case</span>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                    onClick={() => router.push(`/projects/${projectId}/test-cases/${activeTestCase.id}/edit`)}
                    title="Edit Case"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
                    onClick={() => { setDeleteTestCaseId(activeTestCase.id); setDeleteConfirmOpen(true) }}
                    title="Delete Case"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <h3 className="font-bold text-sm text-foreground leading-snug">
                {activeTestCase.title}
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTestCase.priority === "Critical" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" :
                  activeTestCase.priority === "High" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400" :
                  activeTestCase.priority === "Medium" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {activeTestCase.priority}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                  activeTestCase.executionType === "Automated"
                    ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {activeTestCase.executionType === "Automated" ? <Zap className="h-2.5 w-2.5" /> : <ClipboardList className="h-2.5 w-2.5" />}
                  {activeTestCase.executionType}
                </span>
                <Button
                  size="sm"
                  onClick={() => handleRunTestCase(activeTestCase)}
                  className="h-7 ml-auto bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 rounded-lg flex items-center gap-1"
                >
                  <Play className="h-3 w-3 fill-current" /> Run
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b text-xs font-medium text-muted-foreground">
              <button
                onClick={() => setActiveRightTab("details")}
                className={`flex-1 py-2.5 text-center border-b-2 -mb-px transition-colors ${
                  activeRightTab === "details" ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" : "border-transparent hover:text-foreground"
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveRightTab("execution")}
                className={`flex-1 py-2.5 text-center border-b-2 -mb-px transition-colors ${
                  activeRightTab === "execution" ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" : "border-transparent hover:text-foreground"
                }`}
              >
                Runs
              </button>
              <button
                onClick={() => setActiveRightTab("bugs")}
                className={`flex-1 py-2.5 text-center border-b-2 -mb-px transition-colors ${
                  activeRightTab === "bugs" ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" : "border-transparent hover:text-foreground"
                }`}
              >
                Bugs
              </button>
              <button
                onClick={() => setActiveRightTab("integrations")}
                className={`flex-1 py-2.5 text-center border-b-2 -mb-px transition-colors ${
                  activeRightTab === "integrations" ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" : "border-transparent hover:text-foreground"
                }`}
              >
                Sync
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* TAB 1: Details */}
              {activeRightTab === "details" && (
                <div className="space-y-5">
                  {activeTestCase.preconditions && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Preconditions</span>
                      <p className="p-2.5 border rounded-lg bg-muted/40 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                        {activeTestCase.preconditions}
                      </p>
                    </div>
                  )}

                  {/* Requirements links */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Linked Requirements</span>
                    {activeTestCase.requirements && activeTestCase.requirements.length > 0 ? (
                      <div className="space-y-1.5">
                        {activeTestCase.requirements.map(link => (
                          <div key={link.requirementId} className="p-2.5 border rounded-lg flex items-center gap-2 text-xs">
                            <Link2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                            <span className="font-medium text-indigo-600 dark:text-indigo-400 shrink-0">{link.requirement?.requirementKey}</span>
                            <span className="text-foreground truncate" title={link.requirement?.title}>{link.requirement?.title}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
                        No requirements linked yet.
                      </p>
                    )}
                  </div>

                  {/* Steps list */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Steps ({activeTestCase.steps.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {activeTestCase.steps.map(step => (
                        <div key={step.stepNumber} className="flex gap-2.5 p-2.5 border rounded-lg bg-card">
                          <span className="h-5 w-5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 text-[10px] font-semibold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                            {step.stepNumber}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs text-foreground leading-snug">{step.actionDescription}</p>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{step.actionType}</span>
                            </div>
                            {step.expectedResult && (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-snug">
                                Expected: {step.expectedResult}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Execution History */}
              {activeRightTab === "execution" && (
                <div className="space-y-4">
                  {(() => {
                    const testHistory = allTestRuns.filter(run => run.testCaseId === activeTestCase.id)
                    
                    return (
                      <div className="space-y-3">
                        <div className="p-3 border rounded-lg bg-muted/40 flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Latest Result</span>
                            <div className="font-semibold text-sm text-foreground">
                              {history[activeTestCase.id]?.lastStatus || "Not run"}
                            </div>
                          </div>
                          <Button size="sm" onClick={() => handleRunTestCase(activeTestCase)} className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 flex items-center gap-1.5">
                            <Play className="h-3.5 w-3.5 fill-current" /> Run
                          </Button>
                        </div>

                        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground block">Run History ({testHistory.length})</span>
                        {testHistory.length === 0 ? (
                          <div className="p-8 border border-dashed rounded-lg text-center text-xs text-muted-foreground">
                            This test case has not been run yet.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {testHistory.map(run => (
                              <Link
                                key={run.id}
                                href={`/projects/${projectId}/test-runs/${run.id}/report`}
                                className="p-2.5 border rounded-lg flex items-center justify-between hover:bg-accent/40 transition-colors block bg-card"
                              >
                                <div className="space-y-0.5">
                                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                    <Clock className="h-3 w-3 text-muted-foreground" /> {new Date(run.createdAt).toLocaleDateString()}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">{run.executionMode || "Automated"}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${
                                  run.status === "Passed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" :
                                  run.status === "Failed" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" : "bg-muted text-muted-foreground"
                                }`}>
                                  {run.status}
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* TAB 3: Bugs */}
              {activeRightTab === "bugs" && (
                <div className="space-y-4">
                  {(() => {
                    const linkedBugs = bugs.filter(b => b.testCaseId === activeTestCase.id)
                    
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Linked Bugs ({linkedBugs.length})</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/projects/${projectId}/bug-reports`)}
                            className="h-7 px-2.5 text-[11px] font-medium"
                          >
                            File Defect
                          </Button>
                        </div>

                        {linkedBugs.length === 0 ? (
                          <div className="p-8 border border-dashed rounded-lg text-center text-xs text-muted-foreground">
                            No bugs linked to this test case.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {linkedBugs.map(bug => (
                              <Link
                                key={bug.id}
                                href={`/projects/${projectId}/bug-reports/${bug.id}`}
                                className="p-2.5 border rounded-lg hover:bg-accent/40 transition-colors block space-y-1 bg-card"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{bug.bugKey || "DEFECT"}</span>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${
                                    bug.status === "Closed" ? "bg-muted text-muted-foreground" :
                                    bug.status === "Fixed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
                                  }`}>
                                    {bug.status}
                                  </span>
                                </div>
                                <p className="text-xs text-foreground font-medium leading-snug">{bug.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate">Actual: {bug.actualResult}</p>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* TAB 4: Integrations */}
              {activeRightTab === "integrations" && (
                <div className="space-y-4">
                  {(() => {
                    const sync = syncMap[activeTestCase.id]

                    return (
                      <div className="space-y-3">
                        <div className="p-3 border rounded-lg bg-muted/40 space-y-2.5">
                          <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">OpenProject</span>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Sync status</span>
                            <span className={`flex items-center gap-1.5 font-medium ${sync ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                              <span className={`h-2 w-2 rounded-full ${sync ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                              {sync ? "Synced" : "Not synced"}
                            </span>
                          </div>
                          {sync && (
                            <div className="space-y-1.5 pt-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Work Package</span>
                                <span className="font-medium text-foreground tabular-nums">#{sync.externalId}</span>
                              </div>
                              {sync.externalUrl && (
                                <a href={sync.externalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline w-fit mt-1">
                                  View Work Package <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>

                        <Button
                          onClick={() => handleSyncSingleOP(activeTestCase.id)}
                          disabled={isSyncing}
                          className="w-full flex items-center justify-center gap-1.5 h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} Sync to OpenProject
                        </Button>
                      </div>
                    )
                  })()}
                </div>
              )}

            </div>

          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 select-none">
            <div className="p-4 rounded-full bg-muted text-muted-foreground">
              <ClipboardList className="h-7 w-7" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-foreground">No test case selected</h4>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-[220px] leading-relaxed mx-auto">
                Select a test case from the list to view its steps, run history, bugs, and sync status.
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════════
          SLIDE-OVER SHEET: LIVE RECORDER DRAWER
          ═══════════════════════════════════════════════════════════════════════ */}
      {showRecorderDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[500px] bg-background h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300">
            
            {/* Drawer Header */}
            <div className="p-5 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 flex items-center justify-center shrink-0">
                  <Video className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-base">Playwright Steps Recorder</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeSession ? "Session running live..." : "Configure & launch automated browser session"}
                  </p>
                </div>
              </div>
              <button onClick={() => { if (!activeSession) setShowRecorderDrawer(false) }} className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-accent flex items-center justify-center transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {!activeSession ? (
                <form onSubmit={handleStartRecording} className="space-y-4 text-xs font-semibold">
                  <div className="space-y-1.5">
                    <Label className="font-medium text-foreground">Test Case Title</Label>
                    <Input 
                      value={recTitle} 
                      onChange={(e) => setRecTitle(e.target.value)} 
                      placeholder="e.g., Verify checkout cart checkout path" 
                      className="h-9 bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="font-medium text-foreground">Target Web URL</Label>
                    <Input 
                      value={recStartUrl} 
                      onChange={(e) => setRecStartUrl(e.target.value)} 
                      placeholder="https://example.com" 
                      className="h-9 bg-background"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="font-medium text-foreground">Target Browser</Label>
                      <select 
                        value={recBrowser} 
                        onChange={(e) => setRecBrowser(e.target.value as any)}
                        className="h-9 w-full rounded-md border bg-background px-3"
                      >
                        <option value="Chromium">Chromium (Chrome/Edge)</option>
                        <option value="Firefox">Firefox</option>
                        <option value="WebKit">WebKit (Safari)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="font-medium text-foreground">Viewport Mode</Label>
                      <select 
                        value={recViewport} 
                        onChange={(e) => setRecViewport(e.target.value as any)}
                        className="h-9 w-full rounded-md border bg-background px-3"
                      >
                        <option value="Desktop">Desktop (1280x800)</option>
                        <option value="Tablet">Tablet (768x1024)</option>
                        <option value="Mobile">Mobile (375x667)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="font-medium text-foreground">Test Priority</Label>
                      <select 
                        value={recPriority} 
                        onChange={(e) => setRecPriority(e.target.value as any)}
                        className="h-9 w-full rounded-md border bg-background px-3"
                      >
                        <option value="Low">Low Priority</option>
                        <option value="Medium">Medium Priority</option>
                        <option value="High">High Priority</option>
                        <option value="Critical">Critical Priority</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="font-medium text-foreground">Preconditions Credential</Label>
                      <select 
                        value={recCredentialId} 
                        onChange={(e) => setRecCredentialId(e.target.value)}
                        className="h-9 w-full rounded-md border bg-background px-3"
                      >
                        <option value="">No Auto-Login Credential</option>
                        {credentials.map(c => (
                          <option key={c.id} value={c.id}>{c.roleName} (Credentials)</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="font-medium text-foreground">Preconditions</Label>
                    <textarea 
                      value={recPreconditions} 
                      onChange={(e) => setRecPreconditions(e.target.value)} 
                      placeholder="e.g., User must have item inside visual cart before executing this checkout." 
                      rows={3} 
                      className="w-full border rounded-md p-2 bg-background font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {recError && <p className="text-red-600 font-bold mt-1 text-[11px]">{recError}</p>}

                  <Button type="submit" disabled={recStarting} className="w-full flex items-center justify-center gap-1.5 font-bold h-9">
                    {recStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                    Launch controlled step recorder browser
                  </Button>
                </form>
              ) : (
                <div className="space-y-5 text-xs font-semibold">
                  {/* Active Recording Actions */}
                  <div className="p-4 border border-indigo-100 rounded-xl bg-indigo-500/[0.02] flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-indigo-600 uppercase font-bold">Session connection active</span>
                      <p className="text-foreground font-semibold text-sm">{recTitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={handleFinishRecording} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8">
                        Save Case
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancelRecording} className="text-muted-foreground h-8">
                        Cancel
                      </Button>
                    </div>
                  </div>

                  {/* Captured Steps Timeline */}
                  <div className="space-y-3">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground block">Recorded Steps ({recSteps.length})</span>
                    {recSteps.length === 0 ? (
                      <div className="p-8 border border-dashed rounded-lg text-center text-xs text-muted-foreground">
                        Interact inside the controlled browser window to record steps dynamically...
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recSteps.map((step) => (
                          <div key={step.id} className="p-3 border rounded-xl bg-card space-y-2 shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground text-xs">Step {step.stepNumber}</span>
                              <div className="flex items-center gap-0.5">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-5 w-5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                                  onClick={() => handleDeleteRecStep(step.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <Label className="text-[9px] uppercase text-muted-foreground block">Action Description</Label>
                                <Input 
                                  value={step.actionDescription} 
                                  onChange={(e) => handleUpdateRecStep(step.id, step.expectedResult || "", e.target.value)}
                                  className="h-7 text-xs bg-background mt-0.5"
                                />
                              </div>
                              <div>
                                <Label className="text-[9px] uppercase text-muted-foreground block">Expected Result assertion</Label>
                                <Input 
                                  value={step.expectedResult || ""} 
                                  onChange={(e) => handleUpdateRecStep(step.id, e.target.value, step.actionDescription)}
                                  placeholder="Assert value..."
                                  className="h-7 text-xs bg-background mt-0.5"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Create Case Form Drawer */}
      {showCreateDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[500px] bg-background h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-5 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <PlusCircle className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-base">Create Manual Test Case</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Define the steps, priority, and linked requirements.</p>
                </div>
              </div>
              <button onClick={() => setShowCreateDrawer(false)} className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-accent flex items-center justify-center transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveNewTestCase} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <Label className="font-medium text-foreground">Test Case Title</Label>
                <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="e.g. Verify cart checkout path" className="h-9 bg-background" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-medium text-foreground">Priority</Label>
                  <select value={createPriority} onChange={(e) => setCreatePriority(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium text-foreground">Preconditions</Label>
                <textarea value={createPreconditions} onChange={(e) => setCreatePreconditions(e.target.value)} rows={3} placeholder="Preconditions details..." className="w-full border rounded-md p-2 bg-background font-medium" />
              </div>

              <div className="border-t pt-4 space-y-3">
                <Label className="font-bold text-sm">Action steps ({createSteps.length})</Label>
                <StepBuilder steps={createSteps} onChange={setCreateSteps} />
              </div>

              {createError && <p className="text-sm text-destructive">{createError}</p>}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setShowCreateDrawer(false)} disabled={createSaving}>Cancel</Button>
                <Button type="submit" disabled={createSaving}>{createSaving ? "Saving..." : "Save Test Case"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Modals */}
      <ImportModal 
        projectId={projectId}
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={fetchTestCases}
      />

      {deleteConfirmOpen && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          title="Delete Test Case"
          description="Are you absolutely sure you want to permanently delete this test case from the project? This action cannot be undone."
          onConfirm={() => { setDeleteConfirmOpen(false); triggerDeleteTestCase(deleteTestCaseId) }}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}

      {bulkDeleteConfirmOpen && (
        <ConfirmDialog
          open={bulkDeleteConfirmOpen}
          title={`Delete ${selectedIds.length} Test Case(s)`}
          description={`You are about to permanently delete ${selectedIds.length} selected test case(s), including their runs, results, and history. This action cannot be undone.`}
          onConfirm={() => { setBulkDeleteConfirmOpen(false); handleBulkDelete() }}
          onCancel={() => setBulkDeleteConfirmOpen(false)}
        />
      )}

      </div>
    </div>
  )
}
