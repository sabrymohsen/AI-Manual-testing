"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Video,
  Pause,
  Play,
  Save,
  Plus,
  Check,
  X,
  FileText,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Zap,
  Trash2,
  Image as ImageIcon,
  Sparkles,
  Eye,
  EyeOff,
  Loader2,
  ExternalLink,
  Edit2,
  AlertCircle,
  HelpCircle,
  Bug,
  Compass,
  ArrowUp,
  ArrowDown,
  Code2,
  CheckCircle2,
  Copy,
  RefreshCw,
  Globe,
  MousePointer2,
  PenLine,
  Clock,
} from "lucide-react"
import { RecorderExportModal } from "@/components/recorder/recorder-export-modal"
import { LiveBrowserView } from "@/components/recorder/live-browser-view"

interface Credential {
  id: string
  roleName: string
  username: string
}

interface Project {
  id: string
  name: string
  webAppUrl: string
  credentials: Credential[]
}

interface RecordedStep {
  id: string
  stepNumber: number
  pageUrl: string
  actionType: string
  actionDescription: string
  targetType: string
  targetValue: string | null
  inputValue: string | null
  expectedResult: string | null
  actualResult: string | null
  notes: string | null
  tagName: string | null
  visibleText: string | null
  recommendedSelector: string | null
  cssSelector: string | null
  xpathSelector: string | null
  idSelector: string | null
  testIdSelector: string | null
  roleSelector: string | null
  labelSelector: string | null
  placeholderSelector: string | null
  reliabilityScore: number
  attributes: any
  alternativeLocators: any
  screenshotAfter: string | null
  includeInFinalTestCase: boolean
  assertionType: string | null
  assertionValue: string | null
  componentType?: string | null
  groupId?: string | null
  validationStatus?: string | null
  validationMessage?: string | null
  selectedOptionText?: string | null
  selectedOptionValue?: string | null
}

interface RecordedTestCase {
  id: string
  title: string
  module: string | null
  moduleId: string | null
  featureId: string | null
  componentId: string | null
  priority: string
  preconditions: string | null
  status: string
  finalTestCaseId: string | null
}

interface BugReport {
  id: string
  bugKey: string | null
  title: string
  severity: string
  status: string
}

export default function RecorderWorkspacePage() {
  const params = useParams()
  const router = useRouter()

  // Project data
  const [project, setProject] = useState<Project | null>(null)
  const [loadingProject, setLoadingProject] = useState(true)

  // Session state variables
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<string>("Inactive")
  const [currentTestCase, setCurrentTestCase] = useState<RecordedTestCase | null>(null)
  const [recordedSteps, setRecordedSteps] = useState<RecordedStep[]>([])
  const [sessionBugs, setSessionBugs] = useState<BugReport[]>([])
  const [savedCasesList, setSavedCasesList] = useState<RecordedTestCase[]>([])

  // Setup form states
  const [title, setTitle] = useState("")
  const [module, setModule] = useState("General")
  const [priority, setPriority] = useState("Medium")
  const [preconditions, setPreconditions] = useState("")
  const [requiredCredentialId, setRequiredCredentialId] = useState("")
  const [startUrl, setStartUrl] = useState("")
  const [browserType, setBrowserType] = useState("Chromium")
  const [viewport, setViewport] = useState("Desktop")
  const [recordingMode, setRecordingMode] = useState("Fast")
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [showLiveView, setShowLiveView] = useState(true)
  const [startError, setStartError] = useState<string | null>(null)
  const [startErrorDetails, setStartErrorDetails] = useState<string | null>(null)
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null)
  const [playwrightInstalled, setPlaywrightInstalled] = useState<boolean | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<string>("Unknown")
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [finishStats, setFinishStats] = useState<{ savedCount: number; draftCount: number; draftStepCount: number } | null>(null)
  const [showFinishModal, setShowFinishModal] = useState(false)

  // Workspace interface controls
  const [isSavingCase, setIsSavingCase] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [activeTab, setActiveTab] = useState<"steps" | "cases" | "bugs">("steps")
  
  // New Case overlay modal state (inside recording session)
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false)
  const [newCaseTitle, setNewCaseTitle] = useState("")
  const [newCaseModule, setNewCaseModule] = useState("General")
  const [newCasePriority, setNewCasePriority] = useState("Medium")
  const [newCasePreconditions, setNewCasePreconditions] = useState("")

  // Dynamic locator validation state map
  const [validatingLocators, setValidatingLocators] = useState<{ [stepId: string]: boolean }>({})
  const [validationResults, setValidationResults] = useState<{ [stepId: string]: { success: boolean; matches: number } }>({})
  const [isValidatingFlow, setIsValidatingFlow] = useState(false)
  const [stepsFilter, setStepsFilter] = useState<"grouped" | "raw">("grouped")

  // Bug reporting modal from step
  const [bugModalStep, setBugModalStep] = useState<RecordedStep | null>(null)
  const [bugTitle, setBugTitle] = useState("")
  const [bugSeverity, setBugSeverity] = useState("Medium")
  const [bugPriority, setBugPriority] = useState("Medium")
  const [bugActualResult, setBugActualResult] = useState("")
  const [bugNotes, setBugNotes] = useState("")
  const [bugReporting, setBugReporting] = useState(false)

  // Annotation Tool Canvas Modal states
  const [annotationStep, setAnnotationStep] = useState<RecordedStep | null>(null)
  const [annotationColor, setAnnotationColor] = useState("#ef4444") // Red default
  const [annotationShape, setAnnotationShape] = useState<"arrow" | "rect" | "circle" | "text" | "blur">("rect")
  const [annotationTextVal, setAnnotationTextVal] = useState("")
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [canvasDrawingHistory, setCanvasDrawingHistory] = useState<ImageData[]>([])

  // Pre-flight checklist helpers
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null)
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)

  // Inline step description rename
  const [editingDescId, setEditingDescId] = useState<string | null>(null)
  const [editingDescValue, setEditingDescValue] = useState("")

  // Assertion builder: which step's assertion panel is open
  const [assertionExpandedId, setAssertionExpandedId] = useState<string | null>(null)

  // Code export modal
  const [showExportModal, setShowExportModal] = useState(false)

  // Polling ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Recording timer
  const [displayTimer, setDisplayTimer] = useState("00:00")
  const recordingStartRef = useRef<number | null>(null)

  // Per-step detail drawers (collapsed by default)
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())

  // Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmLabel: string
    isDestructive?: boolean
    onConfirm: () => Promise<void> | void
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    onConfirm: () => {},
  })

  function triggerConfirm(options: {
    title: string
    message: string
    confirmLabel: string
    isDestructive?: boolean
    onConfirm: () => Promise<void> | void
  }) {
    setConfirmModal({
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
      isDestructive: options.isDestructive,
      onConfirm: async () => {
        await options.onConfirm()
        setConfirmModal((prev) => ({ ...prev, isOpen: false }))
      },
    })
  }

  // Fetch project details + recover active session
  useEffect(() => {
    fetchProjectDetails()
    recoverActiveSession()
    fetchRecorderStatus()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [params.id])

  async function fetchRecorderStatus() {
    try {
      const res = await fetch(`/api/projects/${params.id}/recording/status`)
      if (res.ok) {
        const data = await res.json()
        setWorkerOnline(data.worker?.online ?? false)
        setPlaywrightInstalled(data.worker?.playwrightInstalled ?? false)
      }
    } catch {
      setWorkerOnline(false)
    }
  }

  async function recoverActiveSession() {
    try {
      const res = await fetch(`/api/projects/${params.id}/recording/active`)
      if (!res.ok) return
      const data = await res.json()
      if (!data.session) return

      setSessionId(data.session.id)
      setSessionStatus(data.session.status)
      setCurrentTestCase(data.currentTestCase || data.session.recordedTestCases?.[0] || null)
      setSavedCasesList(data.session.recordedTestCases || [])
      if (data.currentTestCase) {
        setRecordedSteps(data.currentTestCase.steps || [])
      }
      if (data.connection) {
        setConnectionStatus(data.connection.connectionStatus || "Unknown")
        setConnectionError(data.connection.lastError || null)
      }
    } catch (err) {
      console.error("Failed to recover recording session:", err)
    }
  }

  async function fetchConnectionHealth() {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/recording/${sessionId}/connection`)
      if (res.ok) {
        const data = await res.json()
        setConnectionStatus(data.connectionStatus || "Unknown")
        setConnectionError(data.lastError || null)
        if (data.sessionStatus && data.sessionStatus !== sessionStatus) {
          setSessionStatus(data.sessionStatus)
        }
      }
    } catch {
      setConnectionStatus("Disconnected")
    }
  }

  // Poll for steps if session is active
  useEffect(() => {
    if (sessionId && (sessionStatus === "Active" || sessionStatus === "Paused")) {
      startStepsPolling()
      fetchConnectionHealth()
      const healthInterval = setInterval(fetchConnectionHealth, 4000)
      return () => {
        stopStepsPolling()
        clearInterval(healthInterval)
      }
    } else {
      stopStepsPolling()
    }
    return () => stopStepsPolling()
  }, [sessionId, sessionStatus])

  // Timer: start on Active, pause on Paused, reset when no session
  useEffect(() => {
    if (sessionStatus === "Active" && !recordingStartRef.current) {
      recordingStartRef.current = Date.now()
    }
    if (!sessionId) {
      recordingStartRef.current = null
      setDisplayTimer("00:00")
    }
  }, [sessionStatus, sessionId])

  useEffect(() => {
    const timerInterval = setInterval(() => {
      if (!recordingStartRef.current || sessionStatus === "Paused") return
      const secs = Math.floor((Date.now() - recordingStartRef.current) / 1000)
      setDisplayTimer(
        String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0")
      )
    }, 1000)
    return () => clearInterval(timerInterval)
  }, [sessionStatus])

  async function fetchProjectDetails() {
    try {
      const res = await fetch(`/api/projects/${params.id}`)
      const data = await res.json()
      setProject(data.project)
      if (data.project) {
        setStartUrl(data.project.webAppUrl)
        setTitle(`Test case recorded at ${new Date().toLocaleDateString()}`)
      }
    } catch (err) {
      console.error("Failed to load project details:", err)
    } finally {
      setLoadingProject(false)
    }
  }

  function startStepsPolling() {
    stopStepsPolling()
    pollingRef.current = setInterval(fetchSessionSteps, 1500)
  }

  function stopStepsPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  async function fetchSessionSteps() {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/recording/${sessionId}/steps`)
      if (res.ok) {
        const data = await res.json()
        setRecordedSteps(data.steps || [])
      }

      // Fetch bugs list for the active test case
      if (currentTestCase) {
        const bugsRes = await fetch(`/api/bug-reports?projectId=${params.id}&page=1&pageSize=100`)
        if (bugsRes.ok) {
          const bugsData = await bugsRes.json()
          // Filter bugs belonging to the recorded case
          setSessionBugs((bugsData.items || []).filter((b: any) => b.recordedTestCaseId === currentTestCase.id))
        }
      }
    } catch (err) {
      console.error("Error fetching steps:", err)
    }
  }

  // 1. Initial Start session
  async function handleStartSession() {
    if (!startUrl.trim()) {
      setStartError("Starting URL is required.")
      return
    }
    if (!title.trim()) {
      setStartError("Test Case Title is required.")
      return
    }
    if (workerOnline === false) {
      setStartError("Recorder worker is offline.")
      setStartErrorDetails("Start the recorder service in a terminal: npm run recorder-worker")
      return
    }

    setIsStartingSession(true)
    setStartError(null)
    setStartErrorDetails(null)
    try {
      const res = await fetch(`/api/projects/${params.id}/recording/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          module,
          priority,
          preconditions,
          requiredCredentialId: requiredCredentialId || null,
          startUrl,
          browserType,
          viewport,
          recordingMode,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setSessionId(data.session.id)
        setSessionStatus(data.session.status || "Active")
        setCurrentTestCase(data.testCase)
        setRecordedSteps([])
        setSavedCasesList([data.testCase])
        setConnectionStatus("Connected")
      } else {
        setStartError(data.error || "Failed to start recording session.")
        setStartErrorDetails(data.details || data.troubleshooting || null)
      }
    } catch {
      setStartError("Network error starting recorder.")
    } finally {
      setIsStartingSession(false)
    }
  }

  // 2. Pause session
  async function handlePauseSession() {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/recording/${sessionId}/pause`, { method: "POST" })
      if (res.ok) {
        setSessionStatus("Paused")
      }
    } catch {
      alert("Error pausing session.")
    }
  }

  // 3. Resume session
  async function handleResumeSession() {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/recording/${sessionId}/resume`, { method: "POST" })
      if (res.ok) {
        setSessionStatus("Active")
      }
    } catch {
      alert("Error resuming session.")
    }
  }

  // 4. Save current test case draft
  async function handleSaveCurrentCase() {
    if (!sessionId || !currentTestCase) return
    
    // Check validation (Expected results)
    const missingExpected = recordedSteps.filter(s => s.includeInFinalTestCase && !s.expectedResult)
    if (missingExpected.length > 0) {
      triggerConfirm({
        title: "Missing Expected Results",
        message: `Warning: ${missingExpected.length} step(s) do not have Expected Results. Do you want to continue saving anyway?`,
        confirmLabel: "Save Anyway",
        onConfirm: () => proceedSaveCurrentCase()
      })
    } else {
      proceedSaveCurrentCase()
    }
  }

  async function proceedSaveCurrentCase() {
    if (!sessionId || !currentTestCase) return
    setIsSavingCase(true)
    try {
      const res = await fetch(`/api/recording/${sessionId}/test-case/save-current`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: currentTestCase.id }),
      })

      if (res.ok) {
        alert(`Successfully saved "${currentTestCase.title}" to project!`)
        // Update list of saved cases
        setSavedCasesList(prev => 
          prev.map(c => c.id === currentTestCase.id ? { ...c, status: "SavedAsTestCase" } : c)
        )
        // Set state to start a new case modal
        setIsNewCaseModalOpen(true)
      } else {
        alert("Failed to save test case.")
      }
    } catch {
      alert("Network error saving test case.")
    } finally {
      setIsSavingCase(false)
    }
  }

  // 5. Start new test case draft inside current session
  async function handleCreateNewTestCase() {
    if (!newCaseTitle.trim()) {
      alert("Title is required for the new test case.")
      return
    }

    try {
      const res = await fetch(`/api/recording/${sessionId}/test-case/start-new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newCaseTitle,
          module: newCaseModule,
          priority: newCasePriority,
          preconditions: newCasePreconditions
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setCurrentTestCase(data.testCase)
        setRecordedSteps([])
        setSavedCasesList(prev => [...prev, data.testCase])
        setIsNewCaseModalOpen(false)
        
        // Reset modal fields
        setNewCaseTitle("")
        setNewCaseModule("General")
        setNewCasePriority("Medium")
        setNewCasePreconditions("")

        fetchSessionSteps()
      } else {
        alert("Failed to start new test case draft.")
      }
    } catch {
      alert("Network error starting new test case.")
    }
  }

  // 6. Finish all sessions
  async function handleFinishAll() {
    if (!sessionId) return
    try {
      const statsRes = await fetch(`/api/recording/${sessionId}/stats`)
      if (statsRes.ok) {
        setFinishStats(await statsRes.json())
      } else {
        setFinishStats({ savedCount: 0, draftCount: 1, draftStepCount: recordedSteps.length })
      }
    } catch {
      setFinishStats({ savedCount: 0, draftCount: 1, draftStepCount: recordedSteps.length })
    }
    setShowFinishModal(true)
  }

  async function proceedFinishAll(shouldSave: boolean) {
    if (!sessionId) return
    setIsFinishing(true)
    try {
      if (shouldSave && currentTestCase) {
        const saveRes = await fetch(`/api/recording/${sessionId}/test-case/save-current`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testCaseId: currentTestCase.id }),
        })
        if (!saveRes.ok) {
          alert("Failed to save current test case draft before exit.")
          setIsFinishing(false)
          return
        }
      }

      const res = await fetch(`/api/recording/${sessionId}/finish`, { method: "POST" })
      if (res.ok) {
        setShowFinishModal(false)
        router.push(`/projects/${params.id}/test-cases`)
      } else {
        const err = await res.json()
        alert(err.error || "Failed to finish recording session.")
      }
    } catch {
      alert("Network error finishing recording.")
    } finally {
      setIsFinishing(false)
    }
  }

  // 7. Cancel recording
  async function handleCancelSession() {
    if (!sessionId) return
    triggerConfirm({
      title: "Cancel Recording?",
      message: "Are you sure you want to cancel? All unsaved recording drafts in this session will be discarded.",
      confirmLabel: "Yes, Discard All",
      isDestructive: true,
      onConfirm: async () => {
        // Best-effort: tell the worker to stop. If the worker is offline the session
        // is already gone on that side, so we ignore both HTTP errors and network errors.
        try {
          await fetch(`/api/recording/${sessionId}/cancel`, { method: "POST" })
        } catch {
          // network error — ignored, we navigate away regardless
        }
        // Always reset local state and leave, whether the API succeeded or not.
        // Keeping the user trapped because the worker is unreachable is worse than
        // leaving a stale session row in the DB.
        stopStepsPolling()
        setSessionId(null)
        setSessionStatus("Inactive")
        setRecordedSteps([])
        setCurrentTestCase(null)
        setSavedCasesList([])
        router.push(`/projects/${params.id}/test-cases`)
      }
    })
  }

  // 8. Update recorded step details (expectedResult, targetType, ignore etc.)
  async function handleUpdateStepField(stepId: string, field: string, value: any) {
    try {
      await fetch(`/api/recording/steps/${stepId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      // Local state update immediately for reactive feeling
      setRecordedSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, [field]: value } : s))
      )
    } catch {
      console.error("Failed to update step field")
    }
  }

  // 9. Delete recorded step
  async function handleDeleteStep(stepId: string) {
    triggerConfirm({
      title: "Delete Step?",
      message: "Are you sure you want to delete this recorded step?",
      confirmLabel: "Delete",
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/recording/steps/${stepId}`, { method: "DELETE" })
          if (res.ok) {
            setRecordedSteps((prev) => prev.filter((s) => s.id !== stepId))
          }
        } catch {
          alert("Error deleting step.")
        }
      }
    })
  }

  // 10. AI Assist: Suggest expected result based on action keywords
  function handleSuggestExpectedResult(step: RecordedStep) {
    let suggestion = "Verify page is updated."
    const desc = step.actionDescription.toLowerCase()
    
    if (step.actionType === "open_url" || desc.includes("open") || desc.includes("navigate")) {
      suggestion = "The target webpage should load successfully with no console errors."
    } else if (step.actionType === "click") {
      if (desc.includes("login") || desc.includes("sign in")) {
        suggestion = "User should be logged in and redirected to the dashboard."
      } else if (desc.includes("submit") || desc.includes("save") || desc.includes("create")) {
        suggestion = "Form should submit successfully and new data should be updated in the system."
      } else if (desc.includes("cancel") || desc.includes("close")) {
        suggestion = "Action should cancel and user should return to previous screen."
      } else {
        suggestion = `Element clicked successfully and target UI state should update.`
      }
    } else if (step.actionType === "fill") {
      const name = step.actionDescription.replace("Fill ", "").replace(/\"/g, "")
      suggestion = `Field "${name}" should accept input value and show it correctly.`
    } else if (["select", "select_custom", "select_searchable", "autocomplete_select"].includes(step.actionType)) {
      const val = step.selectedOptionText || step.inputValue || "selected option"
      suggestion = `Dropdown selection should update and display "${val}".`
    } else if (step.actionType === "multi_select") {
      suggestion = "Multiple options should be selected successfully."
    } else if (step.actionType === "check") {
      suggestion = "Checkbox option should be checked/enabled."
    } else if (step.actionType === "uncheck") {
      suggestion = "Checkbox option should be unchecked/disabled."
    } else if (step.actionType === "radio_select") {
      suggestion = "Radio option should be activated/selected."
    } else if (step.actionType === "toggle_on") {
      suggestion = "Toggle switch should be switched ON/active."
    } else if (step.actionType === "toggle_off") {
      suggestion = "Toggle switch should be switched OFF/inactive."
    } else if (step.actionType === "tab_select") {
      suggestion = "Active tab panel content should display the selected tab section."
    } else if (step.actionType === "menu_select") {
      suggestion = "Menu item should be selected and trigger action or navigation."
    } else if (step.actionType === "modal_open") {
      suggestion = "Modal dialog should be displayed overlaying the main page."
    } else if (step.actionType === "modal_close") {
      suggestion = "Modal dialog should close and restore page focus."
    } else if (step.actionType === "accordion_expand") {
      suggestion = "Accordion panel should expand to reveal underlying content."
    } else if (step.actionType === "accordion_collapse") {
      suggestion = "Accordion panel should collapse to hide content."
    } else if (step.actionType === "pagination_next" || step.actionType === "pagination_previous") {
      suggestion = "List view should refresh and show the requested page."
    } else if (step.actionType === "table_row_select") {
      suggestion = "Row action should execute successfully and update row state."
    } else if (step.actionType === "slider_set") {
      suggestion = `Slider value should be adjusted to ${step.inputValue || "the selected value"}.`
    } else if (step.actionType === "date_select") {
      suggestion = `Selected date ${step.inputValue || ""} should be accepted.`
    } else if (step.actionType === "time_select") {
      suggestion = `Selected time ${step.inputValue || ""} should be set.`
    } else if (step.actionType === "wait_for_text") {
      suggestion = `Page text "${step.assertionValue || step.inputValue || ""}" should appear successfully.`
    } else if (step.actionType === "upload_file") {
      suggestion = "Selected file should upload and verify successfully."
    } else if (step.actionType === "screenshot") {
      suggestion = "Page screenshot should be captured for visual comparison verification."
    }

    handleUpdateStepField(step.id, "expectedResult", suggestion)
  }

  // 11. Playwright Live Locator Validation
  async function handleValidateStepLocator(stepId: string) {
    setValidatingLocators(prev => ({ ...prev, [stepId]: true }))
    try {
      const res = await fetch(`/api/recording/steps/${stepId}/validate-locator`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        setValidationResults(prev => ({ ...prev, [stepId]: { success: data.success, matches: data.matches } }))
      }
    } catch {
      console.error("Locator validation request failed")
    } finally {
      setValidatingLocators(prev => ({ ...prev, [stepId]: false }))
    }
  }

  async function handleValidateRecordedFlow() {
    if (!sessionId) return
    setIsValidatingFlow(true)
    try {
      const res = await fetch(`/api/recording/${sessionId}/validate-flow`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          alert(`Flow validation: ${data.overallStatus || (data.success ? "Passed" : "Failed")}`)
        } else {
          alert(`Flow validation completed with errors (${data.overallStatus || "Failed"}). Review failed steps below.`)
        }
        fetchSessionSteps()
      } else {
        alert("Failed to run flow validation.")
      }
    } catch (err) {
      console.error("Flow validation failed:", err)
      alert("Error calling validation endpoint.")
    } finally {
      setIsValidatingFlow(false)
    }
  }

  // 12. Move steps Up/Down
  async function handleMoveStep(stepId: string, direction: "up" | "down") {
    const idx = recordedSteps.findIndex(s => s.id === stepId)
    if (idx === -1) return
    if (direction === "up" && idx === 0) return
    if (direction === "down" && idx === recordedSteps.length - 1) return

    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    const currentStep = recordedSteps[idx]
    const targetStep = recordedSteps[targetIdx]

    // Swap stepNumbers
    const tempNum = currentStep.stepNumber
    currentStep.stepNumber = targetStep.stepNumber
    targetStep.stepNumber = tempNum

    // PUT updates to database
    try {
      await Promise.all([
        fetch(`/api/recording/steps/${currentStep.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepNumber: currentStep.stepNumber })
        }),
        fetch(`/api/recording/steps/${targetStep.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepNumber: targetStep.stepNumber })
        })
      ])
      fetchSessionSteps()
    } catch (e) {
      console.error("Failed to swap steps:", e)
    }
  }

  // 13. Create Bug Report from Step Modal
  function handleTriggerBugModal(step: RecordedStep) {
    setBugModalStep(step)
    setBugTitle(`Bug in step ${step.stepNumber}: ${step.actionDescription}`)
    setBugSeverity("Medium")
    setBugPriority("Medium")
    setBugActualResult(step.actualResult || "Element did not respond to click as expected.")
    setBugNotes(step.notes || "")
  }

  async function handleCreateBugFromStep(e: React.FormEvent) {
    e.preventDefault()
    if (!bugModalStep) return
    setBugReporting(true)

    try {
      const res = await fetch(`/api/recording/steps/${bugModalStep.id}/bug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bugTitle,
          severity: bugSeverity,
          priority: bugPriority,
          actualResult: bugActualResult,
          notes: bugNotes
        })
      })

      if (res.ok) {
        const data = await res.json()
        alert(`Bug report successfully created! ID: ${data.bug.bugKey}`)
        setBugModalStep(null)
        fetchSessionSteps()
      } else {
        alert("Failed to submit bug report.")
      }
    } catch {
      alert("Error reporting bug.")
    } finally {
      setBugReporting(false)
    }
  }

  // 14. Screenshot Annotation Tools Canvas logic
  function handleTriggerAnnotation(step: RecordedStep) {
    setAnnotationStep(step)
    setCanvasDrawingHistory([])
  }

  useEffect(() => {
    if (!annotationStep || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new window.Image()
    img.src = `/api/files/${annotationStep.screenshotAfter}`
    img.onload = () => {
      canvas.width = img.naturalWidth || 800
      canvas.height = img.naturalHeight || 500
      ctx.drawImage(img, 0, 0)
      
      // Save initial state in history
      const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setCanvasDrawingHistory([initialData])
    }

    let drawing = false
    let startX = 0
    let startY = 0

    const getMousePos = (evt: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: (evt.clientX - rect.left) * (canvas.width / rect.width),
        y: (evt.clientY - rect.top) * (canvas.height / rect.height)
      }
    }

    const mousedown = (e: MouseEvent) => {
      drawing = true
      const pos = getMousePos(e)
      startX = pos.x
      startY = pos.y
    }

    const mousemove = (e: MouseEvent) => {
      if (!drawing) return
      const pos = getMousePos(e)
      
      // Restore previous state before drawing preview
      if (canvasDrawingHistory.length > 0) {
        ctx.putImageData(canvasDrawingHistory[canvasDrawingHistory.length - 1], 0, 0)
      }

      ctx.strokeStyle = annotationColor
      ctx.fillStyle = annotationColor
      ctx.lineWidth = 3

      if (annotationShape === "rect") {
        ctx.strokeRect(startX, startY, pos.x - startX, pos.y - startY)
      } else if (annotationShape === "circle") {
        ctx.beginPath()
        const radius = Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2))
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI)
        ctx.stroke()
      } else if (annotationShape === "arrow") {
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()

        // Draw arrowhead
        const angle = Math.atan2(pos.y - startY, pos.x - startX)
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        ctx.lineTo(pos.x - 15 * Math.cos(angle - Math.PI / 6), pos.y - 15 * Math.sin(angle - Math.PI / 6))
        ctx.lineTo(pos.x - 15 * Math.cos(angle + Math.PI / 6), pos.y - 15 * Math.sin(angle + Math.PI / 6))
        ctx.closePath()
        ctx.fill()
      } else if (annotationShape === "blur") {
        // Simple pixelated/blurred rect
        ctx.fillStyle = "rgba(100,116,139,0.95)"
        ctx.fillRect(startX, startY, pos.x - startX, pos.y - startY)
      }
    }

    const mouseup = (e: MouseEvent) => {
      if (!drawing) return
      drawing = false

      if (annotationShape === "text" && annotationTextVal) {
        const pos = getMousePos(e)
        ctx.font = "bold 20px sans-serif"
        ctx.fillStyle = annotationColor
        ctx.fillText(annotationTextVal, pos.x, pos.y)
        setAnnotationTextVal("")
      }

      // Commit state to history
      const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setCanvasDrawingHistory(prev => [...prev, currentData])
    }

    canvas.addEventListener("mousedown", mousedown)
    canvas.addEventListener("mousemove", mousemove)
    canvas.addEventListener("mouseup", mouseup)

    return () => {
      canvas.removeEventListener("mousedown", mousedown)
      canvas.removeEventListener("mousemove", mousemove)
      canvas.removeEventListener("mouseup", mouseup)
    }
  }, [annotationStep, annotationColor, annotationShape, annotationTextVal, canvasDrawingHistory])

  function handleUndoCanvas() {
    if (canvasDrawingHistory.length <= 1 || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const newHistory = canvasDrawingHistory.slice(0, -1)
    setCanvasDrawingHistory(newHistory)
    ctx.putImageData(newHistory[newHistory.length - 1], 0, 0)
  }

  async function handleSaveAnnotation() {
    if (!annotationStep || !canvasRef.current) return

    const canvas = canvasRef.current
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const formData = new FormData()
      formData.append("file", blob, `annotated-${annotationStep.id}.png`)
      
      try {
        // Upload canvas image blob to files endpoint
        const uploadRes = await fetch(`/api/files/screenshots/annotated-${annotationStep.id}.png`, {
          method: "POST",
          body: formData
        })
        if (uploadRes.ok) {
          const filePath = `screenshots/annotated-${annotationStep.id}.png`
          await handleUpdateStepField(annotationStep.id, "screenshotAfter", filePath)
          alert("Annotation saved successfully!")
          setAnnotationStep(null)
          fetchSessionSteps()
        }
      } catch {
        alert("Error saving canvas drawing")
      }
    }, "image/png")
  }

  // ── Assertion builder helpers ────────────────────────────────────────────
  const ASSERTION_LABELS: Record<string, string> = {
    visible: "element is visible",
    hidden: "element is hidden",
    text_equals: "text equals",
    text_contains: "text contains",
    url_equals: "URL equals",
    url_contains: "URL contains",
    title_contains: "title contains",
    value_equals: "value equals",
  }

  function getAssertionPlaceholder(type: string): string {
    switch (type) {
      case "text_equals":    return "Exact expected text..."
      case "text_contains":  return "Text to find on the page..."
      case "url_equals":     return "https://example.com/page"
      case "url_contains":   return "/dashboard"
      case "title_contains": return "Page title keyword..."
      case "value_equals":   return "Expected field value..."
      default:               return "Expected value..."
    }
  }

  // ── Step card helpers ────────────────────────────────────────────────
  function getStepIcon(type: string) {
    if (type === "open_url") return <Globe className="h-3.5 w-3.5 text-blue-500" />
    if (type === "fill") return <PenLine className="h-3.5 w-3.5 text-violet-400" />
    if (["select","select_custom","select_searchable","multi_select","autocomplete_select","date_select","time_select"].includes(type))
      return <ChevronDown className="h-3.5 w-3.5 text-teal-400" />
    if (["check","uncheck","toggle_on","toggle_off","radio_select"].includes(type))
      return <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
    if (["wait","wait_for_text","wait_for_url"].includes(type))
      return <Clock className="h-3.5 w-3.5 text-sky-400" />
    if (["assert_visible","visible"].includes(type)) return <Eye className="h-3.5 w-3.5 text-emerald-400" />
    if (["assert_hidden","hidden"].includes(type)) return <EyeOff className="h-3.5 w-3.5 text-red-400" />
    if (["assert_text","text_contains","text_equals","value_equals","url_equals","url_contains","title_contains","assert_url"].includes(type))
      return <CheckCircle2 className="h-3.5 w-3.5 text-purple-400" />
    if (type === "screenshot") return <ImageIcon className="h-3.5 w-3.5 text-indigo-400" />
    if (type === "note") return <FileText className="h-3.5 w-3.5 text-amber-400" />
    if (type === "upload_file") return <FileText className="h-3.5 w-3.5 text-orange-400" />
    return <MousePointer2 className="h-3.5 w-3.5 text-slate-400" />
  }

  function getStepVerb(type: string): string {
    const map: Record<string, string> = {
      open_url: "Navigate", click: "Click", fill: "Fill",
      select: "Select", select_custom: "Select", select_searchable: "Search & select",
      multi_select: "Multi-select", autocomplete_select: "Autocomplete",
      date_select: "Pick date", time_select: "Set time",
      check: "Check", uncheck: "Uncheck", radio_select: "Radio select",
      tab_select: "Switch tab", menu_select: "Menu click",
      modal_open: "Open modal", modal_close: "Close modal",
      table_row_select: "Select row", pagination_next: "Next page",
      pagination_previous: "Prev page", accordion_expand: "Expand",
      accordion_collapse: "Collapse", toggle_on: "Toggle on", toggle_off: "Toggle off",
      slider_set: "Set slider", upload_file: "Upload",
      wait: "Wait", wait_for_text: "Wait for text", wait_for_url: "Wait for URL",
      assert_visible: "Assert visible", assert_hidden: "Assert hidden",
      assert_text: "Assert text", assert_url: "Assert URL",
      visible: "Assert visible", hidden: "Assert hidden",
      text_contains: "Assert contains", text_equals: "Assert equals",
      value_equals: "Assert value", url_equals: "Assert URL",
      url_contains: "Assert URL contains", title_contains: "Assert title",
      screenshot: "Screenshot", note: "Note", custom_instruction: "Custom",
    }
    return map[type] ?? type.replace(/_/g, " ")
  }

  const currentPhase = !sessionId ? 1
    : showExportModal ? 4
    : savedCasesList.some(c => c.status === "SavedAsTestCase") ? 3
    : 2

  if (loadingProject) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading workspace...</p>
      </div>
    </div>
  )
  if (!project) return <p className="text-destructive p-6">Project not found</p>

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* ── STICKY PAGE HEADER ── */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          {/* Back + title */}
          <div className="flex items-center gap-2 min-w-0">
            <Link href={`/projects/${project.id}/test-cases`}>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="font-bold text-base tracking-tight truncate">Test Case Recorder</h1>
          </div>

          {/* Phase stepper */}
          <div className="hidden lg:flex items-center gap-0 text-[11px] font-semibold">
            {[
              { n: 1, label: "Setup" },
              { n: 2, label: "Recording" },
              { n: 3, label: "Review" },
              { n: 4, label: "Export" },
            ].map((ph, i) => (
              <div key={ph.n} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors ${
                  currentPhase === ph.n ? "text-primary" :
                  currentPhase > ph.n ? "text-muted-foreground" : "text-muted-foreground/40"
                }`}>
                  <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold transition-colors ${
                    currentPhase > ph.n ? "bg-emerald-500 text-white" :
                    currentPhase === ph.n ? "bg-primary text-primary-foreground" :
                    "bg-muted text-muted-foreground/50"
                  }`}>
                    {currentPhase > ph.n ? "✓" : ph.n}
                  </span>
                  {ph.label}
                </div>
                {i < 3 && <div className={`w-6 h-px mx-0.5 ${currentPhase > ph.n ? "bg-emerald-300 dark:bg-emerald-800" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          {/* Status pill */}
          <div className="shrink-0">
            {!sessionId ? (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Idle
              </span>
            ) : sessionStatus === "Active" ? (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-bold animate-pulse">
                <Video className="h-3 w-3 fill-current" /> Recording
              </span>
            ) : sessionStatus === "Paused" ? (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 font-bold">
                <Pause className="h-3 w-3" /> Paused
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="h-3 w-3" /> Done
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      {!sessionId ? (
        
        /* 1. SETUP PHASE */
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-6 py-8 space-y-5">
          <div>
            <h2 className="text-xl font-bold">Start a new recording session</h2>
            <p className="text-sm text-muted-foreground mt-1">
              The browser opens right here in the studio and captures every interaction automatically.
            </p>
          </div>

          {/* Section 1 — What are you testing? */}
          <div className="border rounded-2xl bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-accent/10">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">What are you testing?</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Test case name *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Verify user login flow"
                  className="h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Priority</Label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Preconditions (optional)</Label>
                  <Input
                    value={preconditions}
                    onChange={(e) => setPreconditions(e.target.value)}
                    placeholder="e.g. User account exists"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 — Browser & environment */}
          <div className="border rounded-2xl bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-accent/10">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Browser & environment</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Target URL *</Label>
                <Input
                  value={startUrl}
                  onChange={(e) => setStartUrl(e.target.value)}
                  placeholder="https://example.com/login"
                  className="h-10 font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Browser</Label>
                  <select
                    value={browserType}
                    onChange={(e) => setBrowserType(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="Chromium">Chromium</option>
                    <option value="Firefox">Firefox</option>
                    <option value="WebKit">WebKit</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Viewport</Label>
                  <select
                    value={viewport}
                    onChange={(e) => setViewport(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="Desktop">Desktop (1280×800)</option>
                    <option value="Tablet">Tablet (768×1024)</option>
                    <option value="Mobile">Mobile (375×667)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Login role</Label>
                  <select
                    value={requiredCredentialId}
                    onChange={(e) => setRequiredCredentialId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">No auto-login</option>
                    {project.credentials.map((c) => (
                      <option key={c.id} value={c.id}>{c.roleName} ({c.username})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground">Recording mode</Label>
                  <select
                    value={recordingMode}
                    onChange={(e) => setRecordingMode(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="Fast">Fast</option>
                    <option value="Detailed">Detailed</option>
                    <option value="Assertion">Assertion</option>
                  </select>
                </div>
              </div>

            </div>
          </div>

          {/* Section 3 — Pre-flight + error + CTA */}
          <div className="border rounded-2xl bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-accent/10 flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pre-flight check</h3>
              <button
                type="button"
                onClick={async () => { setIsCheckingStatus(true); await fetchRecorderStatus(); setIsCheckingStatus(false) }}
                disabled={isCheckingStatus}
                className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-3 w-3 ${isCheckingStatus ? "animate-spin" : ""}`} /> Re-check
              </button>
            </div>
            <div className="px-5 py-4 space-y-2 text-xs">
              <div className={startUrl.trim() ? "text-emerald-700 dark:text-emerald-400 flex items-center gap-2" : "text-muted-foreground flex items-center gap-2"}>
                <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold ${startUrl.trim() ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground/50"}`}>{startUrl.trim() ? "✓" : "○"}</span>
                Target URL {startUrl.trim() ? "configured" : "not set"}
              </div>
              <div className="text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <span className="w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold bg-emerald-500 text-white">✓</span>
                Credentials {requiredCredentialId ? "selected" : "optional — public test"}
              </div>
              {workerOnline ? (
                <div className="text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold bg-emerald-500 text-white">✓</span>
                  Recorder worker online
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-red-600 dark:text-red-400 flex items-center gap-2 font-semibold">
                    <span className="w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold bg-red-500 text-white">✗</span>
                    Recorder worker offline
                  </div>
                  <div className="flex items-center gap-2 bg-slate-900 text-slate-100 rounded-lg px-3 py-2 font-mono ml-6">
                    <span className="flex-1 select-all text-[11px]">npm run recorder-worker</span>
                    <button type="button" onClick={() => { navigator.clipboard.writeText("npm run recorder-worker"); setCopiedCmd("worker"); setTimeout(() => setCopiedCmd(null), 1800) }} className="shrink-0 text-slate-400 hover:text-slate-100 transition-colors">
                      {copiedCmd === "worker" ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  <p className="text-muted-foreground ml-6">Run in a separate terminal and keep it open while you record.</p>
                </div>
              )}
              {workerOnline && (
                playwrightInstalled !== false ? (
                  <div className="text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold bg-emerald-500 text-white">✓</span>
                    Playwright browsers ready
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-red-600 dark:text-red-400 flex items-center gap-2 font-semibold">
                      <span className="w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold bg-red-500 text-white">✗</span>
                      Playwright not installed
                    </div>
                    <div className="flex items-center gap-2 bg-slate-900 text-slate-100 rounded-lg px-3 py-2 font-mono ml-6">
                      <span className="flex-1 select-all text-[11px]">npx playwright install chromium</span>
                      <button type="button" onClick={() => { navigator.clipboard.writeText("npx playwright install chromium"); setCopiedCmd("playwright"); setTimeout(() => setCopiedCmd(null), 1800) }} className="shrink-0 text-slate-400 hover:text-slate-100 transition-colors">
                        {copiedCmd === "playwright" ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                )
              )}
              {!workerOnline && (
                <div className="text-muted-foreground/50 flex items-center gap-2 italic">
                  <span className="w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold bg-muted text-muted-foreground/40">○</span>
                  Playwright — check after worker starts
                </div>
              )}
            </div>

            {startError && (
              <div className="mx-5 mb-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-400">
                <div className="font-semibold flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {startError}</div>
                {startErrorDetails && <p className="text-xs mt-1 opacity-90">{startErrorDetails}</p>}
                <button type="button" className="text-xs underline mt-2" onClick={() => setShowDebugPanel(!showDebugPanel)}>
                  {showDebugPanel ? "Hide" : "Show"} debug details
                </button>
                {showDebugPanel && startErrorDetails && (
                  <pre className="mt-2 text-[10px] overflow-auto bg-black/5 p-2 rounded">{startErrorDetails}</pre>
                )}
              </div>
            )}

            <div className="px-5 pb-5">
              <Button
                className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2"
                onClick={handleStartSession}
                disabled={isStartingSession}
              >
                {isStartingSession ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Launching browser...</>
                ) : (
                  <><Play className="h-4 w-4 fill-current" /> Launch recording session</>
                )}
              </Button>
            </div>
          </div>
        </main>
      ) : (

        /* 2. RECORDING WORKSPACE */
        <div className="flex flex-col flex-1">

          {/* ── Sticky session control bar ── */}
          <div className="sticky top-14 z-20 border-b bg-card/95 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 flex items-center gap-4">
              {/* Case name + hierarchy */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-foreground truncate max-w-xs">{currentTestCase?.title || "Recording…"}</span>
                  <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
                    currentTestCase?.priority === "Critical" ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" :
                    currentTestCase?.priority === "High" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400" :
                    currentTestCase?.priority === "Medium" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400" :
                    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  }`}>{currentTestCase?.priority}</span>
                  {currentTestCase?.module && (
                    <span className="text-[10px] text-muted-foreground">{currentTestCase.module}</span>
                  )}
                </div>
              </div>
              {/* Connection status + timer */}
              <div className="hidden md:flex items-center gap-3 text-[11px] shrink-0">
                <span className={`flex items-center gap-1.5 font-semibold ${
                  connectionStatus === "Connected" ? "text-emerald-600 dark:text-emerald-400" :
                  connectionStatus === "BrowserClosed" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    connectionStatus === "Connected" ? "bg-emerald-500" :
                    connectionStatus === "BrowserClosed" ? "bg-red-500" : "bg-amber-500"
                  }`} />
                  {connectionStatus === "Connected" ? "Browser connected" : connectionStatus}
                </span>
                <span className="font-mono text-muted-foreground">{displayTimer}</span>
              </div>
              {/* Controls */}
              <div className="flex items-center gap-2 shrink-0">
                {sessionStatus === "Active" ? (
                  <Button variant="outline" size="sm" onClick={handlePauseSession} className="h-8 text-xs gap-1.5">
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleResumeSession} className="h-8 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/40 dark:hover:bg-red-950/20">
                    <Play className="h-3.5 w-3.5 fill-current" /> Resume
                  </Button>
                )}
                <Button size="sm" onClick={handleFinishAll} disabled={isFinishing} className="h-8 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white">
                  {isFinishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Finish
                </Button>
              </div>
            </div>
            {connectionError && connectionStatus !== "Connected" && (
              <div className="max-w-7xl mx-auto px-4 md:px-6 pb-2 text-[11px] text-red-600 dark:text-red-400 font-medium">{connectionError}</div>
            )}
          </div>

          {/* ── Two-panel layout ── */}
          <div className="max-w-7xl mx-auto w-full flex flex-1">

            {/* LEFT SIDEBAR */}
            <aside className="hidden md:flex flex-col w-56 lg:w-64 shrink-0 border-r py-5 px-4 gap-5">

              {/* Cases list */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Test cases ({savedCasesList.length})
                </p>
                <div className="space-y-1.5">
                  {savedCasesList.map((c) => (
                    <div key={c.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      c.id === currentTestCase?.id
                        ? "border-primary/30 bg-primary/5 text-primary"
                        : c.status === "SavedAsTestCase"
                        ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border bg-accent/10 text-muted-foreground"
                    }`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        c.id === currentTestCase?.id ? "bg-red-500 animate-pulse" :
                        c.status === "SavedAsTestCase" ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                      }`} />
                      <span className="truncate flex-1">{c.title}</span>
                      {c.status === "SavedAsTestCase" && <Check className="h-3 w-3 shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Bugs */}
              {sessionBugs.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Bugs ({sessionBugs.length})</p>
                  <div className="space-y-1">
                    {sessionBugs.map((b) => (
                      <div key={b.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10 text-red-700 dark:text-red-400 text-[11px] font-medium">
                        <Bug className="h-3 w-3 shrink-0" />
                        <span className="truncate">{b.bugKey || "Bug"}: {b.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 mt-auto">
                <Button variant="outline" size="sm" className="w-full text-xs h-8 gap-1.5" onClick={() => setIsNewCaseModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> New test case
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={handleSaveCurrentCase}
                  disabled={isSavingCase}
                  className="w-full text-xs h-8 gap-1.5 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                >
                  <Save className="h-3.5 w-3.5" /> Save current case
                </Button>
                <button
                  onClick={handleCancelSession}
                  className="w-full text-[11px] text-muted-foreground hover:text-destructive py-1 transition-colors text-center font-medium"
                >
                  Cancel session
                </button>
              </div>
            </aside>

            {/* STEP FEED */}
            <main className="flex-1 min-w-0 px-4 md:px-6 py-4">

              {/* Embedded live browser — the only way to drive the session when
                  the worker runs on a server (no native window there). */}
              {sessionId && (
                <div className="mb-4 overflow-hidden rounded-xl border bg-card">
                  <button
                    onClick={() => setShowLiveView((v) => !v)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/40"
                  >
                    <Video className="h-3.5 w-3.5 text-muted-foreground" />
                    Live Browser
                    <span className="text-[10px] font-normal text-muted-foreground">
                      click, type, and scroll here — every interaction is recorded
                    </span>
                    <span className="ml-auto text-muted-foreground">{showLiveView ? "Hide" : "Show"}</span>
                  </button>
                  {showLiveView && (
                    <LiveBrowserView
                      sessionId={sessionId}
                      browserType={browserType}
                      active={sessionStatus === "Active"}
                      className="max-h-[520px] min-h-[240px] border-t"
                    />
                  )}
                </div>
              )}

              {/* Feed header */}
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <div className="flex rounded-lg border text-xs font-semibold overflow-hidden shrink-0">
                  <button
                    onClick={() => setStepsFilter("grouped")}
                    className={`px-3 py-1.5 transition-colors ${stepsFilter === "grouped" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
                  >
                    Grouped ({recordedSteps.filter(s => s.includeInFinalTestCase).length})
                  </button>
                  <button
                    onClick={() => setStepsFilter("raw")}
                    className={`px-3 py-1.5 border-l transition-colors ${stepsFilter === "raw" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
                  >
                    All events ({recordedSteps.length})
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-indigo-600/30 text-indigo-600 dark:text-indigo-400 font-bold" onClick={handleValidateRecordedFlow} disabled={isValidatingFlow}>
                    {isValidatingFlow ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Validate
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-purple-600/30 text-purple-600 dark:text-purple-400 font-bold" onClick={() => setShowExportModal(true)} disabled={recordedSteps.length === 0}>
                    <Code2 className="h-3 w-3" /> Export code
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchSessionSteps} title="Refresh">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Empty state */}
              {recordedSteps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-4">
                  <div className="w-16 h-16 rounded-full bg-accent/30 flex items-center justify-center">
                    <Video className="h-8 w-8 stroke-1 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground">No steps yet</h3>
                    <p className="text-xs mt-1 max-w-xs">Interact with the page in the Live Browser above — every click, fill, and selection appears here live.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pb-8">
                  {(() => {
                    const filteredSteps = stepsFilter === "grouped"
                      ? recordedSteps.filter(s => s.includeInFinalTestCase)
                      : recordedSteps
                    return filteredSteps.map((step, idx) => {
                      const validation = validationResults[step.id]
                      const isValidating = validatingLocators[step.id]
                      const isDetailed = expandedDetails.has(step.id)

                      return (
                        <div key={step.id} className={`rounded-xl border bg-card shadow-sm transition-all ${
                          !step.includeInFinalTestCase ? "opacity-50 border-dashed" : ""
                        } ${step.validationStatus === "Passed" ? "border-l-[3px] border-l-emerald-400" : step.validationStatus === "Failed" ? "border-l-[3px] border-l-red-400" : ""}`}>

                          {/* ── Card header ── */}
                          <div className="flex items-center gap-3 px-4 pt-3.5 pb-3 border-b">
                            <span className="shrink-0 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center">
                              {step.stepNumber}
                            </span>
                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide bg-accent/50 px-2 py-1 rounded-md shrink-0 text-muted-foreground">
                              {getStepIcon(step.actionType)}
                              {getStepVerb(step.actionType)}
                            </span>
                            {editingDescId === step.id ? (
                              <Input
                                autoFocus
                                value={editingDescValue}
                                onChange={(e) => setEditingDescValue(e.target.value)}
                                onBlur={() => { handleUpdateStepField(step.id, "actionDescription", editingDescValue); setEditingDescId(null) }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { handleUpdateStepField(step.id, "actionDescription", editingDescValue); setEditingDescId(null) }
                                  if (e.key === "Escape") setEditingDescId(null)
                                }}
                                className="flex-1 h-7 text-sm font-semibold"
                              />
                            ) : (
                              <div className="flex-1 flex items-center gap-1 group/desc min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate flex-1" dir="auto" title={step.actionDescription}>
                                  {step.actionDescription}
                                </p>
                                <button
                                  onClick={() => { setEditingDescId(step.id); setEditingDescValue(step.actionDescription) }}
                                  className="shrink-0 opacity-0 group-hover/desc:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 rounded"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                            {step.reliabilityScore > 0 && (
                              <span className={`shrink-0 text-[10px] font-bold ${
                                step.reliabilityScore >= 80 ? "text-emerald-600 dark:text-emerald-400" :
                                step.reliabilityScore >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                              }`}>{step.reliabilityScore}%</span>
                            )}
                          </div>

                          {/* ── Card body ── */}
                          <div className="px-4 py-3.5 space-y-3">

                            {/* Expected result + screenshot thumbnail */}
                            <div className="flex items-start gap-3">
                              <div className="flex-1 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Expected result</Label>
                                  <button onClick={() => handleSuggestExpectedResult(step)} className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 font-bold">
                                    <Sparkles className="h-3 w-3 fill-current" /> AI Fill
                                  </button>
                                </div>
                                <Input
                                  value={step.expectedResult || ""}
                                  onChange={(e) => handleUpdateStepField(step.id, "expectedResult", e.target.value)}
                                  placeholder="Describe what should happen..."
                                  className="h-8 text-xs"
                                />
                              </div>
                              {step.screenshotAfter && (
                                <div className="shrink-0 group/shot relative mt-5">
                                  <img
                                    src={`/api/files/${step.screenshotAfter}`}
                                    alt="step screenshot"
                                    className="h-12 w-16 object-cover rounded-lg border cursor-pointer"
                                    onClick={() => handleTriggerAnnotation(step)}
                                  />
                                  <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover/shot:opacity-100 transition-opacity">
                                    <button onClick={() => window.open(`/api/files/${step.screenshotAfter}`)} className="p-1 text-white" title="View full"><Eye className="h-3 w-3" /></button>
                                    <button onClick={() => handleTriggerAnnotation(step)} className="p-1 text-white" title="Annotate"><Edit2 className="h-3 w-3" /></button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Assertion builder */}
                            <div className="rounded-lg border overflow-hidden">
                              <button
                                onClick={() => setAssertionExpandedId(assertionExpandedId === step.id ? null : step.id)}
                                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground bg-accent/10 hover:bg-accent/20 transition-colors"
                              >
                                <span className="flex items-center gap-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {step.assertionType ? `Check: ${ASSERTION_LABELS[step.assertionType] ?? step.assertionType}` : "Add assertion check"}
                                </span>
                                <div className="flex items-center gap-2">
                                  {step.assertionType && <span className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-bold uppercase">Set</span>}
                                  <ChevronRight className={`h-3 w-3 transition-transform ${assertionExpandedId === step.id ? "rotate-90" : ""}`} />
                                </div>
                              </button>
                              {assertionExpandedId === step.id && (
                                <div className="p-3 space-y-2.5 bg-background border-t">
                                  <div>
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Check type</Label>
                                    <select
                                      value={step.assertionType || ""}
                                      onChange={(e) => handleUpdateStepField(step.id, "assertionType", e.target.value || null)}
                                      className="mt-1 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus:outline-none"
                                    >
                                      <option value="">None</option>
                                      <option value="visible">Element is visible</option>
                                      <option value="hidden">Element is hidden</option>
                                      <option value="text_equals">Text equals</option>
                                      <option value="text_contains">Text contains</option>
                                      <option value="url_equals">URL equals</option>
                                      <option value="url_contains">URL contains</option>
                                      <option value="title_contains">Page title contains</option>
                                      <option value="value_equals">Input value equals</option>
                                    </select>
                                  </div>
                                  {step.assertionType && !["visible","hidden"].includes(step.assertionType) && (
                                    <div>
                                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Expected value</Label>
                                      <Input
                                        value={step.assertionValue || ""}
                                        onChange={(e) => handleUpdateStepField(step.id, "assertionValue", e.target.value)}
                                        placeholder={getAssertionPlaceholder(step.assertionType)}
                                        className="mt-1 h-8 text-xs"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Validation error */}
                            {step.validationStatus === "Failed" && step.validationMessage && (
                              <div className="bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-400 p-2.5 rounded-lg text-xs flex items-start gap-2">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {step.validationMessage}
                              </div>
                            )}

                            {/* Technical details drawer */}
                            <div className="rounded-lg border overflow-hidden">
                              <button
                                onClick={() => setExpandedDetails(prev => {
                                  const next = new Set(prev)
                                  next.has(step.id) ? next.delete(step.id) : next.add(step.id)
                                  return next
                                })}
                                className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-muted-foreground bg-accent/5 hover:bg-accent/15 transition-colors"
                              >
                                <span className="flex items-center gap-1.5"><HelpCircle className="h-3 w-3" /> Technical details</span>
                                <ChevronRight className={`h-3 w-3 transition-transform ${isDetailed ? "rotate-90" : ""}`} />
                              </button>
                              {isDetailed && (
                                <div className="p-3 border-t bg-background space-y-3">
                                  <div className="space-y-1.5 text-xs text-muted-foreground">
                                    <div className="truncate" title={step.pageUrl}><span className="font-bold">URL: </span><span className="font-mono">{step.pageUrl}</span></div>
                                    {step.recommendedSelector && (
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="truncate"><span className="font-bold">Selector: </span><span className="font-mono text-foreground">{step.recommendedSelector}</span></div>
                                        <button onClick={() => handleValidateStepLocator(step.id)} disabled={isValidating} className="shrink-0 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold">
                                          {isValidating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Compass className="h-3 w-3" />} Validate
                                        </button>
                                      </div>
                                    )}
                                    {step.inputValue && <div><span className="font-bold">Input: </span><span className="font-mono text-foreground">{step.inputValue}</span></div>}
                                    {validation && (
                                      <div>
                                        {validation.success && validation.matches === 1 ? (
                                          <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 px-2 py-0.5 rounded font-bold">✓ 1 element found</span>
                                        ) : validation.matches > 1 ? (
                                          <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 px-2 py-0.5 rounded font-bold">⚠ {validation.matches} elements — ambiguous</span>
                                        ) : (
                                          <span className="text-[10px] bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400 px-2 py-0.5 rounded font-bold">✗ Not found</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Actual result</Label>
                                      <Input value={step.actualResult || ""} onChange={(e) => handleUpdateStepField(step.id, "actualResult", e.target.value)} placeholder="Observed behavior…" className="mt-1 h-7 text-xs" />
                                    </div>
                                    <div>
                                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">Dev notes</Label>
                                      <Input value={step.notes || ""} onChange={(e) => handleUpdateStepField(step.id, "notes", e.target.value)} placeholder="Console errors…" className="mt-1 h-7 text-xs" />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* ── Card footer ── */}
                          <div className="flex items-center justify-between px-4 pb-3 pt-0.5 border-t">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={step.includeInFinalTestCase}
                                onChange={(e) => handleUpdateStepField(step.id, "includeInFinalTestCase", e.target.checked)}
                                className="rounded h-3.5 w-3.5 text-primary"
                              />
                              Include
                            </label>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => handleTriggerBugModal(step)} className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 px-2 py-1 rounded transition-colors">
                                <Bug className="h-3 w-3" /> Bug
                              </button>
                              <div className="flex border rounded-lg overflow-hidden">
                                <button disabled={idx === 0} onClick={() => handleMoveStep(step.id, "up")} className="p-1 hover:bg-accent disabled:opacity-30 transition-colors" title="Move up">
                                  <ArrowUp className="h-3 w-3" />
                                </button>
                                <button disabled={idx === filteredSteps.length - 1} onClick={() => handleMoveStep(step.id, "down")} className="p-1 hover:bg-accent border-l disabled:opacity-30 transition-colors" title="Move down">
                                  <ArrowDown className="h-3 w-3" />
                                </button>
                              </div>
                              <button onClick={() => handleDeleteStep(step.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors" title="Delete step">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </main>
          </div>
        </div>
      )}

      {/* NEW TEST CASE IN-SESSION CREATION DIALOG */}
      {isNewCaseModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Start New Test Case
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                The current recording browser session will remain open. Subsequent actions will belong to this new test case.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">New Title *</Label>
                <Input
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                  placeholder="e.g. Verify Profile Update Flow"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Priority</Label>
                <select
                  value={newCasePriority}
                  onChange={(e) => setNewCasePriority(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Preconditions</Label>
                <textarea
                  value={newCasePreconditions}
                  onChange={(e) => setNewCasePreconditions(e.target.value)}
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  placeholder="e.g. User is logged in to settings page"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsNewCaseModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateNewTestCase} className="bg-primary hover:bg-primary/95 text-white">
                Create & Start Recording
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE BUG REPORT MODAL */}
      {bugModalStep && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreateBugFromStep} className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <Bug className="h-5 w-5" /> Report Observed Bug
              </h3>
              <p className="text-xs text-muted-foreground">
                Observed at Step {bugModalStep.stepNumber}. Project context and steps recorded so far will be linked.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Bug Title *</Label>
                <Input
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder="Summarize the observed failure..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground">Severity</Label>
                  <select
                    value={bugSeverity}
                    onChange={(e) => setBugSeverity(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground">Priority</Label>
                  <select
                    value={bugPriority}
                    onChange={(e) => setBugPriority(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Actual Result *</Label>
                <textarea
                  value={bugActualResult}
                  onChange={(e) => setBugActualResult(e.target.value)}
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none"
                  placeholder="Explain actual browser behavior..."
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Notes (Optional)</Label>
                <Input
                  value={bugNotes}
                  onChange={(e) => setBugNotes(e.target.value)}
                  placeholder="Console warnings or API errors..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setBugModalStep(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={bugReporting} className="bg-red-600 hover:bg-red-700 text-white">
                {bugReporting ? "Submitting..." : "Submit Bug Report"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* SCREENSHOT ANNOTATION MODAL */}
      {annotationStep && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-4xl p-6 shadow-2xl flex flex-col gap-4 max-h-[95vh] overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-1.5">
                  <ImageIcon className="h-5 w-5 text-indigo-500" /> Annotate Screenshot
                </h3>
                <p className="text-xs text-muted-foreground">
                  Draw arrows, circles, rectangles, add text, or blur sensitive values directly on the evidence screenshot.
                </p>
              </div>
              <button onClick={() => setAnnotationStep(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Annotation Toolbar */}
            <div className="flex flex-wrap items-center gap-4 bg-accent/20 p-3 rounded-xl border text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-muted-foreground">Tools:</span>
                <div className="flex border rounded-lg overflow-hidden bg-background">
                  <button 
                    onClick={() => setAnnotationShape("rect")} 
                    className={`px-3 py-1.5 font-semibold ${annotationShape === "rect" ? "bg-primary text-white" : "hover:bg-accent"}`}
                  >
                    Rectangle
                  </button>
                  <button 
                    onClick={() => setAnnotationShape("circle")} 
                    className={`px-3 py-1.5 font-semibold border-l ${annotationShape === "circle" ? "bg-primary text-white" : "hover:bg-accent"}`}
                  >
                    Circle
                  </button>
                  <button 
                    onClick={() => setAnnotationShape("arrow")} 
                    className={`px-3 py-1.5 font-semibold border-l ${annotationShape === "arrow" ? "bg-primary text-white" : "hover:bg-accent"}`}
                  >
                    Arrow
                  </button>
                  <button 
                    onClick={() => setAnnotationShape("blur")} 
                    className={`px-3 py-1.5 font-semibold border-l ${annotationShape === "blur" ? "bg-primary text-white" : "hover:bg-accent"}`}
                  >
                    Blur Area
                  </button>
                  <button 
                    onClick={() => setAnnotationShape("text")} 
                    className={`px-3 py-1.5 font-semibold border-l ${annotationShape === "text" ? "bg-primary text-white" : "hover:bg-accent"}`}
                  >
                    Text
                  </button>
                </div>
              </div>

              {annotationShape === "text" && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-muted-foreground">Text Note:</span>
                  <Input 
                    value={annotationTextVal} 
                    onChange={(e) => setAnnotationTextVal(e.target.value)} 
                    placeholder="Type then click to draw..." 
                    className="h-8 text-xs w-44"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="font-bold text-muted-foreground">Color:</span>
                <select 
                  value={annotationColor} 
                  onChange={(e) => setAnnotationColor(e.target.value)} 
                  className="bg-background border rounded px-2 py-1"
                >
                  <option value="#ef4444">Red</option>
                  <option value="#3b82f6">Blue</option>
                  <option value="#10b981">Green</option>
                  <option value="#eab308">Yellow</option>
                  <option value="#a855f7">Purple</option>
                </select>
              </div>

              <div className="flex-1 flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={canvasDrawingHistory.length <= 1} 
                  onClick={handleUndoCanvas}
                >
                  Undo
                </Button>
              </div>
            </div>

            {/* Drawing Canvas Area */}
            <div className="flex-1 overflow-auto border rounded-xl bg-slate-900 flex items-center justify-center p-2 min-h-[300px]">
              <canvas 
                ref={canvasRef} 
                className="cursor-crosshair shadow-lg border bg-background"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => setAnnotationStep(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveAnnotation} className="bg-primary hover:bg-primary/95 text-white">
                Save & Link Annotated Screenshot
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* FINISH SESSION MODAL */}
      {showFinishModal && finishStats && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold">Finish Recording Session?</h3>
            <p className="text-sm text-muted-foreground">
              You have:
            </p>
            <ul className="text-sm space-y-1 bg-accent/10 rounded-lg p-3 border">
              <li>Saved test cases: <strong>{finishStats.savedCount}</strong></li>
              <li>Unsaved draft steps: <strong>{finishStats.draftStepCount}</strong> across <strong>{finishStats.draftCount}</strong> draft case(s)</li>
            </ul>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                disabled={isFinishing}
                onClick={() => proceedFinishAll(true)}
              >
                Save Current Case & Finish
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={isFinishing}
                onClick={() => proceedFinishAll(false)}
              >
                Finish Without Saving Draft
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setShowFinishModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        cancelLabel="Cancel"
        variant={confirmModal.isDestructive ? "danger" : "default"}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* CODE EXPORT MODAL */}
      {showExportModal && (
        <RecorderExportModal
          steps={recordedSteps}
          title={currentTestCase?.title || "Recorded Test"}
          onClose={() => setShowExportModal(false)}
        />
      )}

    </div>
  )
}
