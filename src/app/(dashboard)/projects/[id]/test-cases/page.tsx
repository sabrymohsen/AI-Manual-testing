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
import { HierarchyFormModal } from "@/components/hierarchy/hierarchy-form-modal"
import { MoveCaseModal } from "@/components/hierarchy/move-case-modal"
import { StepBuilder } from "@/components/test-cases/step-builder"
import { HierarchySelector } from "@/components/hierarchy/hierarchy-selector"
import { LinkedRequirementsSelector } from "@/components/test-cases/linked-requirements-selector"

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
  module: string
  priority: string
  source: string
  executionType: string
  preconditions?: string | null
  steps: TestStep[]
  moduleId?: string | null
  featureId?: string | null
  componentId?: string | null
  requirements?: Array<{ id: string; requirementKey: string; title: string }>
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

  // Form Node Modal States
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [formLevel, setFormLevel] = useState<"module" | "feature" | "component">("module")
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [formEditData, setFormEditData] = useState<any>(undefined)
  const [parentModuleId, setParentModuleId] = useState<string | undefined>(undefined)
  const [parentFeatureId, setParentFeatureId] = useState<string | undefined>(undefined)

  // Move Case Modal State
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveTestCaseId, setMoveTestCaseId] = useState("")
  const [moveTestCaseTitle, setMoveTestCaseTitle] = useState("")
  const [moveCurrentModuleId, setMoveCurrentModuleId] = useState<string | null>(null)
  const [moveCurrentFeatureId, setMoveCurrentFeatureId] = useState<string | null>(null)
  const [moveCurrentComponentId, setMoveCurrentComponentId] = useState<string | null>(null)

  // Delete Case Confirm Modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTestCaseId, setDeleteTestCaseId] = useState("")

  // Import Dialog
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // Slide-Over Drawers Configurations
  const [showCreateDrawer, setShowCreateDrawer] = useState(false)
  const [createTitle, setCreateTitle] = useState("")
  const [createModuleId, setCreateModuleId] = useState("")
  const [createFeatureId, setCreateFeatureId] = useState("")
  const [createComponentId, setCreateComponentId] = useState("")
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
  const [recModuleId, setRecModuleId] = useState("")
  const [recFeatureId, setRecFeatureId] = useState("")
  const [recComponentId, setRecComponentId] = useState("")
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
          moduleId: recModuleId || null,
          featureId: recFeatureId || null,
          componentId: recComponentId || null,
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

  // Hierarchy Node Actions
  const handleOpenCreateNode = (level: "module" | "feature" | "component", pModId?: string, pFeatId?: string) => {
    setFormLevel(level)
    setFormMode("create")
    setFormEditData(undefined)
    setParentModuleId(pModId)
    setParentFeatureId(pFeatId)
    setFormModalOpen(true)
  }

  const handleOpenEditNode = (level: "module" | "feature" | "component", node: any) => {
    setFormLevel(level)
    setFormMode("edit")
    setFormEditData(node)
    setFormModalOpen(true)
  }

  const handleOpenCreateCaseDrawer = () => {
    setCreateModuleId("")
    setCreateFeatureId("")
    setCreateComponentId("")

    if (selectedNodeType === "module") {
      setCreateModuleId(selectedNodeId)
    } else if (selectedNodeType === "feature") {
      setCreateFeatureId(selectedNodeId)
      for (const mod of hierarchy) {
        if (mod.features?.some(f => f.id === selectedNodeId)) {
          setCreateModuleId(mod.id)
          break
        }
      }
    } else if (selectedNodeType === "component") {
      setCreateComponentId(selectedNodeId)
      for (const mod of hierarchy) {
        for (const feat of mod.features || []) {
          if (feat.components?.some(c => c.id === selectedNodeId)) {
            setCreateFeatureId(feat.id)
            setCreateModuleId(mod.id)
            break
          }
        }
      }
    }

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
          moduleId: createModuleId || null,
          featureId: createFeatureId || null,
          componentId: createComponentId || null,
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
    const isOrphan = !tc.moduleId
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
    if (selectedNodeType === "module") {
      list = list.filter((tc) => tc.moduleId === selectedNodeId)
    } else if (selectedNodeType === "feature") {
      list = list.filter((tc) => tc.featureId === selectedNodeId)
    } else if (selectedNodeType === "component") {
      list = list.filter((tc) => tc.componentId === selectedNodeId)
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

  const countCasesInNode = (type: "module" | "feature" | "component", id: string) => {
    if (type === "module") return testCases.filter((t) => t.moduleId === id).length
    if (type === "feature") return testCases.filter((t) => t.featureId === id).length
    if (type === "component") return testCases.filter((t) => t.componentId === id).length
    return 0
  }

  // Calculate nodes execution status aggregates (e.g. 85% pass rate)
  const getNodePassRate = (type: "module" | "feature" | "component", id: string) => {
    let nodeCases = testCases
    if (type === "module") nodeCases = testCases.filter((t) => t.moduleId === id)
    else if (type === "feature") nodeCases = testCases.filter((t) => t.featureId === id)
    else if (type === "component") nodeCases = testCases.filter((t) => t.componentId === id)

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

  return (
    <div className="flex h-full overflow-hidden select-none bg-background">
      
      {/* Toast Alert popup overlay */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-xs font-bold transition-all duration-300 animate-in slide-in-from-top ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* 🧩 A. LEFT PANEL: STRUCTURE TREE (CRITICAL HIERARCHY) */}
      <aside className="w-64 border-r bg-card flex flex-col overflow-y-auto shrink-0 select-none text-xs font-semibold">
        <div className="p-4 border-b flex items-center justify-between bg-accent/5">
          <span className="font-extrabold uppercase text-[10px] tracking-wider text-muted-foreground/60 flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-indigo-500" /> Structure Cockpit
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 rounded-md hover:bg-indigo-500/10 text-indigo-600"
            onClick={() => handleOpenCreateNode("module")}
            title="Create Module"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Dynamic Nodes Container */}
        <div className="p-3 space-y-1">
          {/* Project Node */}
          <div 
            onClick={() => selectNode("project", "")}
            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedNodeType === "project" ? "bg-indigo-50/70 text-indigo-700 dark:bg-indigo-950/15" : "hover:bg-accent/40"
            }`}
          >
            <span className="flex items-center gap-2 font-bold">
              <Zap className="h-4 w-4 text-indigo-500" /> All Workspace Cases
            </span>
            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full text-[9px] font-bold">
              {testCases.length}
            </span>
          </div>

          <div className="border-t my-2" />

          {/* Modules Tree */}
          <div className="space-y-1">
            {hierarchy.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground/60 text-[10px] leading-relaxed">
                No modules found. Click plus to create.
              </div>
            ) : (
              hierarchy.map((mod) => {
                const isModExpanded = expandedNodes.has(mod.id)
                const modCases = countCasesInNode("module", mod.id)
                const modPassRate = getNodePassRate("module", mod.id)
                
                return (
                  <div key={mod.id} className="space-y-0.5">
                    {/* Module row */}
                    <div className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer ${
                      selectedNodeType === "module" && selectedNodeId === mod.id ? "bg-indigo-50/70 text-indigo-700 dark:bg-indigo-950/15" : "hover:bg-accent/40"
                    }`}>
                      <span 
                        onClick={() => { selectNode("module", mod.id); toggleNodeExpand(mod.id) }}
                        className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5"
                      >
                        {isModExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
                        <Folder className="h-4 w-4 text-indigo-400 shrink-0 fill-indigo-400/10" />
                        <span className="truncate font-bold text-slate-700" title={mod.name}>{mod.name}</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {modPassRate !== null && (
                          <span className={`text-[9px] font-bold px-1 rounded ${
                            modPassRate >= 90 ? "bg-emerald-100 text-emerald-700" :
                            modPassRate >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          }`}>
                            {modPassRate}%
                          </span>
                        )}
                        <span className="bg-slate-100 text-slate-500 px-1 py-0.5 rounded text-[9px]">
                          {modCases}
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-5 w-5 rounded hover:bg-slate-200" onClick={() => handleOpenCreateNode("feature", mod.id)} title="Add Feature"><Plus className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
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
                              <div className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer ${
                                selectedNodeType === "feature" && selectedNodeId === feat.id ? "bg-indigo-50/70 text-indigo-700 dark:bg-indigo-950/15" : "hover:bg-accent/40"
                              }`}>
                                <span 
                                  onClick={() => { selectNode("feature", feat.id); toggleNodeExpand(feat.id) }}
                                  className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5"
                                >
                                  {isFeatExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
                                  <FolderOpen className="h-4 w-4 text-violet-400 shrink-0" />
                                  <span className="truncate font-semibold text-slate-600" title={feat.name}>{feat.name}</span>
                                </span>
                                <div className="flex items-center gap-1">
                                  {featPassRate !== null && (
                                    <span className="text-[8px] text-emerald-600 font-bold">{featPassRate}%</span>
                                  )}
                                  <span className="text-slate-400 text-[9px] font-normal">({featCases})</span>
                                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 rounded hover:bg-slate-200" onClick={() => handleOpenCreateNode("component", undefined, feat.id)} title="Add Component"><Plus className="h-3.5 w-3.5" /></Button>
                                  </div>
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
                                        className={`group flex items-center justify-between px-2 py-1 rounded-lg cursor-pointer ${
                                          isCompSelected ? "bg-indigo-50/70 text-indigo-700 dark:bg-indigo-950/15" : "hover:bg-accent/40"
                                        }`}
                                      >
                                        <span className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5">
                                          <Box className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                          <span className="truncate font-medium text-slate-500" title={comp.name}>{comp.name}</span>
                                        </span>
                                        <span className="text-slate-400 text-[9px] font-normal">({compCases})</span>
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

      {/* 🧠 B. CENTER PANEL: TEST CASE LIST (CONTEXTUAL + TIMELINE FLOW) */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        
        {/* Dynamic Context Header */}
        <div className="p-4 border-b flex items-center justify-between bg-card">
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 flex items-center gap-1.5">
              Workspace &bull; {selectedNodeType}
            </div>
            <h2 className="text-sm font-extrabold text-foreground tracking-tight">
              {selectedNodeType === "project" && "All Workspace Cases"}
              {selectedNodeType === "module" && `Module: ${hierarchy.find(m => m.id === selectedNodeId)?.name || "General"}`}
              {selectedNodeType === "feature" && `Feature Scope`}
              {selectedNodeType === "component" && `Component Scope`}
            </h2>
          </div>

          {/* Quick inline search/filters when listing */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleOpenCreateCaseDrawer}
              className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm px-3 shrink-0"
            >
              <Plus className="h-4 w-4" /> Create Case
            </Button>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cases..."
                className="pl-8 h-8 w-40 text-xs bg-background"
              />
            </div>
            <select
              value={filterExecutionType}
              onChange={(e) => setFilterExecutionType(e.target.value)}
              className="h-8 rounded-md border text-xs bg-background px-2"
            >
              <option value="">All Types</option>
              <option value="Automated">Automated</option>
              <option value="Manual">Manual</option>
            </select>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="h-8 rounded-md border text-xs bg-background px-2"
            >
              <option value="">Priority</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)} 
              className="h-8 rounded-md border text-xs bg-background px-2"
            >
              <option value="">Status</option>
              <option value="Passed">Passed</option>
              <option value="Failed">Failed</option>
              <option value="NotExecuted">Not Run</option>
            </select>
          </div>
        </div>

        {/* Traceability validation filters */}
        <div className="px-4 py-2 border-b bg-card flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
          <span>Validation Filters:</span>
          <button 
            onClick={() => setTraceFilter("all")}
            className={`px-2.5 py-1 rounded-full ${traceFilter === "all" ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}
          >
            All Cases
          </button>
          <button 
            onClick={() => setTraceFilter("orphans")}
            className={`px-2.5 py-1 rounded-full flex items-center gap-1 ${traceFilter === "orphans" ? "bg-amber-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}
          >
            <ShieldAlert className="h-3 w-3" /> Orphans ({testCases.filter(tc => !tc.moduleId).length})
          </button>
          <button
            onClick={() => setTraceFilter("broken")}
            className={`px-2.5 py-1 rounded-full flex items-center gap-1 ${traceFilter === "broken" ? "bg-red-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}
          >
            <AlertCircle className="h-3 w-3" /> Broken Links ({testCases.filter(tc => getTraceabilityDetails(tc).isBroken).length})
          </button>

          <span className="mx-1 h-3.5 w-px bg-slate-200" />
          <span>Type:</span>
          <button
            onClick={() => setFilterExecutionType(filterExecutionType === "Automated" ? "" : "Automated")}
            className={`px-2.5 py-1 rounded-full flex items-center gap-1 ${filterExecutionType === "Automated" ? "bg-violet-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}
          >
            <Zap className="h-3 w-3" /> Automated ({testCases.filter(tc => tc.executionType === "Automated").length})
          </button>
          <button
            onClick={() => setFilterExecutionType(filterExecutionType === "Manual" ? "" : "Manual")}
            className={`px-2.5 py-1 rounded-full flex items-center gap-1 ${filterExecutionType === "Manual" ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}
          >
            <FileText className="h-3 w-3" /> Manual ({testCases.filter(tc => tc.executionType === "Manual").length})
          </button>
        </div>

        {/* Content View Scroll Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Bulk Action Bar */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-indigo-500/[0.04] border border-indigo-200 dark:border-indigo-900/40 rounded-xl animate-in slide-in-from-top duration-200 gap-3 flex-wrap text-xs">
              <span className="font-bold text-indigo-700 flex items-center gap-2">
                {selectedIds.length} testcase(s) selected
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleBulkRun} className="flex items-center gap-1 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] h-8">
                  <Play className="h-3.5 w-3.5 fill-current" /> Run Selected
                </Button>
                {hasOpIntegration && (
                  <Button size="sm" onClick={handleBulkSync} className="flex items-center gap-1 font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 text-[11px] h-8">
                    <CloudUpload className="h-3.5 w-3.5" /> Sync OpenProject
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleExportSelection} className="flex items-center gap-1 font-semibold text-[11px] h-8">
                  <FileDown className="h-3.5 w-3.5" /> Export JSON
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} className="text-[11px] h-8">
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* List of Test Cases */}
          {filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-sm mx-auto select-none">
              <div className="p-4 rounded-full bg-slate-100 text-slate-400">
                <FileText className="h-10 w-10" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-800">No test cases found</h3>
                <p className="text-xs text-muted-foreground font-medium mt-1 leading-relaxed">
                  Generate cases using our Playwright recorder studio, upload an Excel sheets pack, or trigger AI generator.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 py-1 text-[10px] font-bold text-muted-foreground/60 uppercase">
                <span className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    checked={filteredList.length > 0 && filteredList.every(tc => selectedIds.includes(tc.id))}
                    onChange={toggleSelectAllVisible}
                    className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500" 
                  />
                  Select Visible
                </span>
                <span>Lifecycle Flow Tracing Timeline</span>
              </div>

              {filteredList.map((tc) => {
                const { isOrphan, isBroken, hasRuns, lastStatus, isSynced, linkedBugs } = getTraceabilityDetails(tc)
                const isSelected = selectedTestCaseId === tc.id
                const runInfo = activeRuns.get(tc.id)

                return (
                  <div 
                    key={tc.id}
                    onClick={() => setSelectedTestCaseId(tc.id)}
                    className={`group border rounded-xl p-4 bg-card flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? "border-indigo-600 ring-1 ring-indigo-600 bg-indigo-500/[0.01]" : "hover:border-slate-300"
                    }`}
                  >
                    {/* Left details info */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(tc.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSelectCase(tc.id) }}
                        className="mt-1 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500" 
                      />
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-xs text-slate-800 truncate" title={tc.title}>
                            {tc.title}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase tracking-wider ${
                            tc.priority === "Critical" ? "bg-red-100 text-red-700" :
                            tc.priority === "High" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {tc.priority}
                          </span>
                          {isOrphan && (
                            <span className="bg-amber-100 text-amber-700 text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                              <ShieldAlert className="h-2.5 w-2.5" /> Orphan
                            </span>
                          )}
                          {isBroken && (
                            <span className="bg-red-100 text-red-700 text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                              <AlertCircle className="h-2.5 w-2.5" /> Broken
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/80 font-bold flex-wrap">
                          <span className="flex items-center gap-1 text-slate-500 font-semibold uppercase text-[9px]">
                            {tc.executionType === "Manual" ? <ClipboardList className="h-3 w-3 text-slate-400" /> : <Play className="h-3 w-3 text-emerald-500 fill-emerald-500/10" />}
                            {tc.executionType}
                          </span>
                          <span>&bull;</span>
                          <span>Source: {tc.source}</span>
                          {tc.moduleId && (
                            <>
                              <span>&bull;</span>
                              <span className="text-indigo-600 truncate">{tc.module}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Timeline Flow Steps */}
                    <div className="flex items-center gap-1.5 self-end md:self-auto shrink-0 select-none">
                      
                      {/* Step 1: Created */}
                      <div className="flex flex-col items-center" title={`Created via ${tc.source}`}>
                        <div className="h-5 w-5 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                          {tc.source === "Recorder" ? <Video className="h-3 w-3 text-indigo-500" /> :
                           tc.source === "AI" ? <Sparkles className="h-3 w-3 text-purple-500" /> :
                           <FileText className="h-3 w-3 text-slate-500" />}
                        </div>
                        <span className="text-[7px] font-bold text-muted-foreground mt-0.5">Created</span>
                      </div>

                      <div className="h-px w-3 bg-slate-200" />

                      {/* Step 2: Executed */}
                      <div className="flex flex-col items-center" title="Execution actions">
                        {runInfo ? (
                          <div className="h-5 w-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center animate-pulse">
                            <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleRunTestCase(tc) }}
                            className="h-5 w-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center hover:bg-emerald-100"
                          >
                            <Play className="h-3 w-3 text-emerald-600 fill-current" />
                          </button>
                        )}
                        <span className="text-[7px] font-bold text-muted-foreground mt-0.5">Run</span>
                      </div>

                      <div className="h-px w-3 bg-slate-200" />

                      {/* Step 3: Verified Status */}
                      <div className="flex flex-col items-center" title={`Last status: ${lastStatus}`}>
                        <div className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                          lastStatus === "Passed" ? "bg-emerald-50 border-emerald-200 text-emerald-600" :
                          lastStatus === "Failed" ? "bg-red-50 border-red-200 text-red-600" :
                          "bg-slate-50 border-slate-200 text-slate-400"
                        }`}>
                          {lastStatus === "Passed" ? <CheckCircle2 className="h-3.5 w-3.5 fill-current" /> :
                           lastStatus === "Failed" ? <XCircle className="h-3.5 w-3.5 fill-current" /> :
                           <Clock className="h-3 w-3" />}
                        </div>
                        <span className="text-[7px] font-bold text-muted-foreground mt-0.5">Status</span>
                      </div>

                      <div className="h-px w-3 bg-slate-200" />

                      {/* Step 4: Bug Linked */}
                      <div className="flex flex-col items-center" title={linkedBugs.length > 0 ? `${linkedBugs.length} linked bugs` : "No bugs filed"}>
                        <div className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                          linkedBugs.length > 0 ? "bg-rose-50 border-rose-200 text-rose-600 font-extrabold text-[8px]" :
                          (lastStatus === "Failed" ? "bg-red-100 border-red-400 text-red-700 animate-bounce" : "bg-slate-50 border-slate-200 text-slate-300")
                        }`}>
                          {linkedBugs.length > 0 ? linkedBugs.length : <AlertTriangle className="h-3 w-3" />}
                        </div>
                        <span className="text-[7px] font-bold text-muted-foreground mt-0.5">Bug</span>
                      </div>

                      <div className="h-px w-3 bg-slate-200" />

                      {/* Step 5: Synced */}
                      <div className="flex flex-col items-center" title={isSynced ? "Synced to OpenProject" : "Sync case"}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleSyncSingleOP(tc.id) }}
                          className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                            isSynced ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-400"
                          }`}
                        >
                          <CloudUpload className="h-3 w-3" />
                        </button>
                        <span className="text-[7px] font-bold text-muted-foreground mt-0.5">Synced</span>
                      </div>

                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </div>

      {/* 🔍 C. RIGHT PANEL: DETAILS + TRACEABILITY INTERFACE */}
      <aside className="w-[380px] border-l bg-card flex flex-col overflow-hidden shrink-0 select-none text-xs font-semibold">
        {activeTestCase ? (
          <div className="h-full flex flex-col overflow-hidden">
            
            {/* Right Panel Header */}
            <div className="p-4 border-b space-y-2 bg-accent/5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60">Testcase Triage</span>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-indigo-600 rounded hover:bg-slate-200"
                    onClick={() => router.push(`/projects/${projectId}/test-cases/${activeTestCase.id}/edit`)}
                    title="Edit Case"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-red-600 rounded hover:bg-red-50"
                    onClick={() => { setDeleteTestCaseId(activeTestCase.id); setDeleteConfirmOpen(true) }}
                    title="Delete Case"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <h3 className="font-extrabold text-xs text-slate-800 leading-tight">
                {activeTestCase.title}
              </h3>
            </div>

            {/* Tabs Selector Bar */}
            <div className="flex border-b bg-slate-50 text-[10px] uppercase font-extrabold tracking-wider text-slate-500">
              <button 
                onClick={() => setActiveRightTab("details")}
                className={`flex-1 py-2.5 text-center border-b-2 transition-all ${
                  activeRightTab === "details" ? "border-indigo-600 text-indigo-700 bg-white" : "border-transparent hover:bg-slate-100"
                }`}
              >
                Details
              </button>
              <button 
                onClick={() => setActiveRightTab("execution")}
                className={`flex-1 py-2.5 text-center border-b-2 transition-all ${
                  activeRightTab === "execution" ? "border-indigo-600 text-indigo-700 bg-white" : "border-transparent hover:bg-slate-100"
                }`}
              >
                Executions
              </button>
              <button 
                onClick={() => setActiveRightTab("bugs")}
                className={`flex-1 py-2.5 text-center border-b-2 transition-all ${
                  activeRightTab === "bugs" ? "border-indigo-600 text-indigo-700 bg-white" : "border-transparent hover:bg-slate-100"
                }`}
              >
                Bugs
              </button>
              <button 
                onClick={() => setActiveRightTab("integrations")}
                className={`flex-1 py-2.5 text-center border-b-2 transition-all ${
                  activeRightTab === "integrations" ? "border-indigo-600 text-indigo-700 bg-white" : "border-transparent hover:bg-slate-100"
                }`}
              >
                Sync
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* TAB 1: Details */}
              {activeRightTab === "details" && (
                <div className="space-y-4">
                  {activeTestCase.preconditions && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase">Preconditions</span>
                      <p className="p-2 border rounded-lg bg-slate-50/50 text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed">
                        {activeTestCase.preconditions}
                      </p>
                    </div>
                  )}

                  {/* Requirements links */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase">Linked Requirements</span>
                    {activeTestCase.requirements && activeTestCase.requirements.length > 0 ? (
                      <div className="space-y-1">
                        {activeTestCase.requirements.map(req => (
                          <div key={req.id} className="p-2 border rounded-lg flex items-center justify-between text-[11px]">
                            <span className="font-bold text-indigo-700">{req.requirementKey} &bull; {req.title}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic p-2 border border-dashed rounded-lg">
                        No requirements linked to this testcase.
                      </p>
                    )}
                  </div>

                  {/* Steps list */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-muted-foreground uppercase flex items-center justify-between">
                      <span>Action Steps ({activeTestCase.steps.length})</span>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => {
                          setMoveTestCaseId(activeTestCase.id)
                          setMoveTestCaseTitle(activeTestCase.title)
                          setMoveCurrentModuleId(activeTestCase.moduleId || null)
                          setMoveCurrentFeatureId(activeTestCase.featureId || null)
                          setMoveCurrentComponentId(activeTestCase.componentId || null)
                          setMoveModalOpen(true)
                        }}
                        className="h-5 text-[9px] uppercase font-bold text-indigo-600"
                      >
                        Move Hierarchy
                      </Button>
                    </span>
                    <div className="space-y-1 text-[11px]">
                      {activeTestCase.steps.map(step => (
                        <div key={step.stepNumber} className="p-2 border rounded-lg bg-card hover:bg-slate-50/40 space-y-1">
                          <div className="flex items-center justify-between font-bold text-slate-700">
                            <span>Step {step.stepNumber}</span>
                            <span className="text-[9px] uppercase font-mono px-1 rounded bg-slate-100 text-slate-500">{step.actionType}</span>
                          </div>
                          <p className="text-slate-600 font-medium leading-tight">{step.actionDescription}</p>
                          {step.expectedResult && (
                            <p className="text-[10px] text-emerald-600 font-bold bg-emerald-500/[0.02] p-1 rounded">Expected: {step.expectedResult}</p>
                          )}
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
                      <div className="space-y-2">
                        <div className="p-3 border rounded-xl bg-slate-50 flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-slate-400 uppercase font-bold">Latest Result</span>
                            <div className="font-extrabold text-xs text-slate-700">
                              {history[activeTestCase.id]?.lastStatus || "Not Executed"}
                            </div>
                          </div>
                          <Button size="sm" onClick={() => handleRunTestCase(activeTestCase)} className="h-7 bg-indigo-600 text-white font-bold text-[10px] px-2.5">
                            Run case
                          </Button>
                        </div>

                        <span className="text-[10px] text-muted-foreground uppercase block mt-3">Execution History Logs ({testHistory.length})</span>
                        {testHistory.length === 0 ? (
                          <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground italic">
                            No execution history logs found.
                          </div>
                        ) : (
                          <div className="space-y-1.5 text-[11px]">
                            {testHistory.map(run => (
                              <Link 
                                key={run.id}
                                href={`/projects/${projectId}/test-runs/${run.id}/report`}
                                className="p-2 border.5 rounded-lg flex items-center justify-between hover:bg-slate-50 border block bg-card"
                              >
                                <div className="space-y-0.5">
                                  <span className="font-bold text-slate-700 flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-slate-400" /> {new Date(run.createdAt).toLocaleDateString()}
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-semibold">{run.executionMode || "Automated"}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[8px] ${
                                  run.status === "Passed" ? "bg-emerald-100 text-emerald-700" :
                                  run.status === "Failed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
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
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground uppercase">Linked Bugs ({linkedBugs.length})</span>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => router.push(`/projects/${projectId}/bug-reports`)}
                            className="h-5 text-[9px] font-bold text-indigo-600 border-indigo-200"
                          >
                            File Defect
                          </Button>
                        </div>

                        {linkedBugs.length === 0 ? (
                          <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground italic">
                            No bugs or defects linked to this testcase.
                          </div>
                        ) : (
                          <div className="space-y-1.5 text-[11px]">
                            {linkedBugs.map(bug => (
                              <Link 
                                key={bug.id} 
                                href={`/projects/${projectId}/bug-reports/${bug.id}`}
                                className="p-2.5 border rounded-lg hover:bg-slate-50 block space-y-1 bg-card"
                              >
                                <div className="flex items-center justify-between font-bold">
                                  <span className="text-indigo-600">{bug.bugKey || "DEFECT"}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                    bug.status === "Closed" ? "bg-slate-100 text-slate-500" :
                                    bug.status === "Fixed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                  }`}>
                                    {bug.status}
                                  </span>
                                </div>
                                <p className="text-slate-700 font-bold leading-snug">{bug.title}</p>
                                <p className="text-[10px] text-slate-500 truncate">Actual: {bug.actualResult}</p>
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
                <div className="space-y-4 text-[11px]">
                  {(() => {
                    const sync = syncMap[activeTestCase.id]
                    
                    return (
                      <div className="space-y-3">
                        <div className="p-3 border rounded-xl bg-slate-50 space-y-2">
                          <span className="text-[10px] text-slate-400 uppercase font-bold">OpenProject Integration</span>
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">Sync Status:</span>
                            <span className={`h-2.5 w-2.5 rounded-full ${sync ? "bg-emerald-500" : "bg-slate-300"}`} />
                          </div>
                          {sync && (
                            <div className="space-y-1.5 pt-1">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Work Package ID:</span>
                                <span className="font-bold text-slate-700">{sync.externalId}</span>
                              </div>
                              {sync.externalUrl && (
                                <a href={sync.externalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-indigo-600 font-bold hover:underline w-fit mt-1">
                                  View Work Package <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>

                        <Button 
                          onClick={() => handleSyncSingleOP(activeTestCase.id)}
                          disabled={isSyncing}
                          className="w-full flex items-center justify-center gap-1.5 shadow-sm font-semibold h-9"
                        >
                          {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} Sync OpenProject
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
            <div className="p-4 rounded-full bg-slate-50 text-slate-300">
              <ClipboardList className="h-8 w-8" />
            </div>
            <div>
              <h4 className="font-extrabold text-xs text-slate-700">No test case selected</h4>
              <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] leading-relaxed mx-auto font-medium">
                Click any case card in the cockpit grid list to view step details, execution history runs, and OpenProject mappings.
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
            <div className="p-5 border-b flex items-center justify-between bg-accent/15">
              <div>
                <h3 className="font-bold text-base flex items-center gap-1.5">
                  <Video className="h-5 w-5 text-indigo-500" /> Playwright Steps Recorder
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeSession ? "Session running live..." : "Configure & launch automated browser session"}
                </p>
              </div>
              <button onClick={() => { if (!activeSession) setShowRecorderDrawer(false) }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {!activeSession ? (
                <form onSubmit={handleStartRecording} className="space-y-4 text-xs font-semibold">
                  <div className="space-y-1.5">
                    <Label className="font-bold text-slate-700">Test Case Title</Label>
                    <Input 
                      value={recTitle} 
                      onChange={(e) => setRecTitle(e.target.value)} 
                      placeholder="e.g., Verify checkout cart checkout path" 
                      className="h-9 bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="font-bold text-slate-700">Target Web URL</Label>
                    <Input 
                      value={recStartUrl} 
                      onChange={(e) => setRecStartUrl(e.target.value)} 
                      placeholder="https://example.com" 
                      className="h-9 bg-background"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="font-bold text-slate-700">Target Browser</Label>
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
                      <Label className="font-bold text-slate-700">Viewport Mode</Label>
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
                      <Label className="font-bold text-slate-700">Test Priority</Label>
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
                      <Label className="font-bold text-slate-700">Preconditions Credential</Label>
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
                    <Label className="font-bold text-slate-700">Preconditions</Label>
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
                      <p className="text-slate-700 font-extrabold">{recTitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={handleFinishRecording} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8">
                        Save Case
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancelRecording} className="text-slate-500 h-8">
                        Cancel
                      </Button>
                    </div>
                  </div>

                  {/* Captured Steps Timeline */}
                  <div className="space-y-3">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Recorded Steps Timeline ({recSteps.length})</span>
                    {recSteps.length === 0 ? (
                      <div className="p-8 border border-dashed rounded-xl text-center text-slate-400 font-medium italic">
                        Interact inside the controlled browser window to record steps dynamically...
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recSteps.map((step) => (
                          <div key={step.id} className="p-3 border rounded-xl bg-card space-y-2 shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-slate-800 text-[11px]">Step {step.stepNumber}</span>
                              <div className="flex items-center gap-0.5">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-5 w-5 rounded hover:bg-slate-200 text-red-500"
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
            <div className="p-5 border-b flex items-center justify-between bg-accent/15">
              <div>
                <h3 className="font-bold text-base flex items-center gap-1.5">
                  <PlusCircle className="h-5 w-5 text-indigo-500" /> Create Manual Test Case
                </h3>
              </div>
              <button onClick={() => setShowCreateDrawer(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveNewTestCase} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">Test Case Title</Label>
                <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="e.g. Verify cart checkout path" className="h-9 bg-background" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="font-bold text-slate-700">Priority</Label>
                  <select value={createPriority} onChange={(e) => setCreatePriority(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">Preconditions</Label>
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
      {formModalOpen && (
        <HierarchyFormModal 
          isOpen={formModalOpen}
          onClose={() => setFormModalOpen(false)}
          onSuccess={() => { fetchHierarchy(); fetchTestCases() }}
          projectId={projectId}
          level={formLevel}
          mode={formMode}
          editData={formEditData}
          parentModuleId={parentModuleId}
          parentFeatureId={parentFeatureId}
        />
      )}

      {moveModalOpen && (
        <MoveCaseModal 
          isOpen={moveModalOpen}
          onClose={() => setMoveModalOpen(false)}
          onSuccess={fetchTestCases}
          projectId={projectId}
          testCaseId={moveTestCaseId}
          testCaseTitle={moveTestCaseTitle}
          currentModuleId={moveCurrentModuleId}
          currentFeatureId={moveCurrentFeatureId}
          currentComponentId={moveCurrentComponentId}
        />
      )}

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

    </div>
  )
}
