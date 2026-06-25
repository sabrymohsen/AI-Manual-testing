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
  Zap,
  Trash2,
  Image as ImageIcon,
  Sparkles,
  Eye,
  Loader2,
  ExternalLink,
  Edit2,
  AlertCircle,
  HelpCircle,
  Bug,
  Compass,
  ArrowUp,
  ArrowDown
} from "lucide-react"
import { HierarchySelector } from "@/components/hierarchy/hierarchy-selector"

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
  const [moduleId, setModuleId] = useState("")
  const [featureId, setFeatureId] = useState("")
  const [componentId, setComponentId] = useState("")
  const [priority, setPriority] = useState("Medium")
  const [preconditions, setPreconditions] = useState("")
  const [requiredCredentialId, setRequiredCredentialId] = useState("")
  const [startUrl, setStartUrl] = useState("")
  const [browserType, setBrowserType] = useState("Chromium")
  const [viewport, setViewport] = useState("Desktop")
  const [recordingMode, setRecordingMode] = useState("Fast")
  const [isStartingSession, setIsStartingSession] = useState(false)
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
  const [newCaseModuleId, setNewCaseModuleId] = useState("")
  const [newCaseFeatureId, setNewCaseFeatureId] = useState("")
  const [newCaseComponentId, setNewCaseComponentId] = useState("")
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

  // Polling ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

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
          moduleId: moduleId || null,
          featureId: featureId || null,
          componentId: componentId || null,
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
          moduleId: newCaseModuleId || null,
          featureId: newCaseFeatureId || null,
          componentId: newCaseComponentId || null,
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
        setNewCaseModuleId("")
        setNewCaseFeatureId("")
        setNewCaseComponentId("")
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
        try {
          const res = await fetch(`/api/recording/${sessionId}/cancel`, { method: "POST" })
          if (res.ok) {
            router.push(`/projects/${params.id}/test-cases`)
          }
        } catch {
          alert("Network error cancelling session.")
        }
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

  if (loadingProject) return <p className="text-muted-foreground p-6">Loading Workspace details...</p>
  if (!project) return <p className="text-destructive p-6">Project not found</p>

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 min-h-[90vh] flex flex-col">
      
      {/* Header Panel */}
      <div className="flex items-center justify-between border-b pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${project.id}/test-cases`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Test Case Recorder</h1>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
              Record manual actions in a real browser, capture smart locators, add expected results, and save executable test cases.
            </p>
          </div>
        </div>

        {sessionId && (
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold animate-pulse ${
              sessionStatus === "Active" ? "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400"
            }`}>
              <Video className="h-3.5 w-3.5 fill-current" />
              {sessionStatus === "Active" ? "Live Recording..." : "Paused"}
            </span>
          </div>
        )}
      </div>

      {/* WORKSPACE CONTENT AREA */}
      {!sessionId ? (
        
        /* 1. SETUP SESSION SCREEN */
        <div className="flex-1 max-w-2xl mx-auto w-full py-8 space-y-6">
          <div className="p-6 border rounded-2xl bg-card/50 backdrop-blur-sm shadow-md space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Video className="h-5 w-5 text-red-500" /> Start Recording Session
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure your recording scope. A dedicated recorder worker launches Playwright in an external browser window.
            </p>

            <div className="rounded-xl border bg-accent/10 p-3 text-xs space-y-1.5">
              <div className="font-bold text-muted-foreground uppercase tracking-wide">Pre-flight checklist</div>
              <div className={startUrl.trim() ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>
                {startUrl.trim() ? "✓" : "○"} Target URL configured
              </div>
              <div className={requiredCredentialId || !requiredCredentialId ? "text-green-700 dark:text-green-400" : ""}>
                ✓ Credentials {requiredCredentialId ? "selected" : "optional (public test)"}
              </div>
              <div className={workerOnline ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                {workerOnline ? "✓" : "✗"} Recorder worker {workerOnline ? "online" : "offline — run npm run recorder-worker"}
              </div>
              <div className={playwrightInstalled !== false ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                {playwrightInstalled !== false ? "✓" : "✗"} Playwright {playwrightInstalled === false ? "not installed" : "ready"}
              </div>
            </div>

            {startError && (
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40 p-3 text-sm text-red-700 dark:text-red-400">
                <div className="font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {startError}
                </div>
                {startErrorDetails && (
                  <p className="text-xs mt-1 opacity-90">{startErrorDetails}</p>
                )}
                <button
                  type="button"
                  className="text-xs underline mt-2"
                  onClick={() => setShowDebugPanel(!showDebugPanel)}
                >
                  {showDebugPanel ? "Hide" : "Show"} debug details
                </button>
                {showDebugPanel && startErrorDetails && (
                  <pre className="mt-2 text-[10px] overflow-auto bg-black/5 p-2 rounded">{startErrorDetails}</pre>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold text-muted-foreground">Test Case Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Verify User Login Flow"
                />
              </div>

              <div className="sm:col-span-2 border p-4 rounded-xl bg-accent/5 space-y-3">
                <h4 className="font-semibold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Suite Hierarchy Selection</h4>
                <HierarchySelector
                  projectId={params.id as string}
                  moduleId={moduleId}
                  onChangeModuleId={setModuleId}
                  featureId={featureId}
                  onChangeFeatureId={setFeatureId}
                  componentId={componentId}
                  onChangeComponentId={setComponentId}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Priority</Label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold text-muted-foreground">Preconditions</Label>
                <textarea
                  value={preconditions}
                  onChange={(e) => setPreconditions(e.target.value)}
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                  placeholder="e.g. Ensure user account is registered in DB"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold text-muted-foreground">Target URL *</Label>
                <Input
                  value={startUrl}
                  onChange={(e) => setStartUrl(e.target.value)}
                  placeholder="https://example.com/login"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Login Role (Optional Vault Credential)</Label>
                <select
                  value={requiredCredentialId}
                  onChange={(e) => setRequiredCredentialId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="">No Automatic Login</option>
                  {project.credentials.map((c) => (
                     <option key={c.id} value={c.id}>
                       {c.roleName} ({c.username})
                     </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Browser</Label>
                <select
                  value={browserType}
                  onChange={(e) => setBrowserType(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="Chromium">Chromium</option>
                  <option value="Firefox">Firefox</option>
                  <option value="WebKit">WebKit</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Recording Mode</Label>
                <select
                  value={recordingMode}
                  onChange={(e) => setRecordingMode(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="Fast">Fast Recording</option>
                  <option value="Detailed">Detailed Recording</option>
                  <option value="Assertion">Assertion Recording</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Viewport Size</Label>
                <select
                  value={viewport}
                  onChange={(e) => setViewport(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="Desktop">Desktop (1280x800)</option>
                  <option value="Tablet">Tablet (768x1024)</option>
                  <option value="Mobile">Mobile (375x667)</option>
                </select>
              </div>
            </div>

            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 mt-2"
              onClick={handleStartSession}
              disabled={isStartingSession}
            >
              {isStartingSession ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Launching Playwright Browser...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" /> Start Recording Session
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        
        /* 2. LIVE RECORDING WORKSPACE */
        <div className="flex-1 grid gap-6 md:grid-cols-3 min-h-[500px]">
          
          {/* LEFT/MIDDLE: Control panel & Playwright Guidance */}
          <div className="md:col-span-1 space-y-6 flex flex-col">
            
            {/* Session Controller bar */}
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Session Controls</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  connectionStatus === "Connected"
                    ? "text-green-600 bg-green-50 dark:bg-green-950/20 dark:text-green-400"
                    : connectionStatus === "BrowserClosed"
                      ? "text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400"
                      : "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 dark:text-yellow-400"
                }`}>
                  {connectionStatus === "Connected" ? "Browser Connected" : connectionStatus}
                </span>
              </div>
              {connectionError && connectionStatus !== "Connected" && (
                <div className="text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/40 rounded-lg p-2">
                  {connectionError}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {sessionStatus === "Active" ? (
                  <Button variant="outline" size="sm" onClick={handlePauseSession} className="flex-1 flex items-center gap-1.5 text-xs">
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleResumeSession} className="flex-1 flex items-center gap-1.5 text-xs bg-red-50 hover:bg-red-100 dark:bg-red-950/20 text-red-600">
                    <Play className="h-4 w-4 fill-current" /> Resume
                  </Button>
                )}
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setIsNewCaseModalOpen(true)}
                  className="flex-1 flex items-center gap-1.5 text-xs"
                >
                  <Plus className="h-4 w-4" /> New Case
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSaveCurrentCase}
                  disabled={isSavingCase}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-green-600/30 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/20 text-xs font-bold"
                >
                  <Save className="h-4 w-4" /> Save Case
                </Button>
                <Button
                  onClick={handleFinishAll}
                  disabled={isFinishing}
                  size="sm"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  {isFinishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Finish Session
                </Button>
              </div>
              <Button
                onClick={handleCancelSession}
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs"
              >
                Cancel Recording Session
              </Button>
            </div>

            {/* Active Test Case card */}
            <div className="p-4 border rounded-xl bg-accent/5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Active Test Case Draft</div>
                <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 rounded-full font-bold uppercase">
                  {currentTestCase?.priority}
                </span>
              </div>
              <h3 className="text-md font-bold text-foreground">{currentTestCase?.title}</h3>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Module: <span className="font-semibold text-foreground">{currentTestCase?.module}</span></div>
                {currentTestCase?.preconditions && (
                  <div>Preconditions: <span className="italic text-foreground">{currentTestCase.preconditions}</span></div>
                )}
              </div>
            </div>

            {/* In-Session navigation lists tabs */}
            <div className="border rounded-xl bg-card overflow-hidden flex flex-col flex-1 min-h-[200px]">
              <div className="flex border-b text-xs font-semibold bg-accent/15">
                <button 
                  onClick={() => setActiveTab("steps")} 
                  className={`flex-1 py-2 px-3 border-r text-center ${activeTab === "steps" ? "bg-background text-primary" : "text-muted-foreground"}`}
                >
                  Test Cases ({savedCasesList.length})
                </button>
                <button 
                  onClick={() => setActiveTab("bugs")} 
                  className={`flex-1 py-2 px-3 text-center ${activeTab === "bugs" ? "bg-background text-primary" : "text-muted-foreground"}`}
                >
                  Bugs Created ({sessionBugs.length})
                </button>
              </div>

              <div className="flex-1 p-3 overflow-y-auto space-y-2">
                {activeTab === "steps" && (
                  savedCasesList.map((c) => (
                    <div key={c.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium ${
                      c.id === currentTestCase?.id
                        ? "border-primary bg-primary/5 text-primary"
                        : c.status === "SavedAsTestCase"
                          ? "border-green-200 bg-green-50/50 text-green-700 dark:border-green-950/40 dark:bg-green-950/10 dark:text-green-400"
                          : "border-border bg-accent/10 text-muted-foreground"
                    }`}>
                      <span className="truncate max-w-[170px]">{c.title}</span>
                      <span className="text-[10px] text-muted-foreground">{c.status === "SavedAsTestCase" ? "Saved" : "Recording"}</span>
                    </div>
                  ))
                )}

                {activeTab === "bugs" && (
                  sessionBugs.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground">No bugs reported in this session yet.</div>
                  ) : (
                    sessionBugs.map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-2 rounded border text-xs bg-red-50/50 border-red-200 text-red-800 dark:bg-red-950/10 dark:border-red-900/50 dark:text-red-400">
                        <span className="font-semibold">{b.bugKey}: {b.title}</span>
                        <span className="text-[10px] uppercase font-bold text-red-600">{b.severity}</span>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>
          </div>

          {/* MIDDLE/RIGHT: Live Recorded Steps Panel */}
          <div className="md:col-span-2 border rounded-2xl bg-card shadow-lg flex flex-col overflow-hidden max-h-[85vh]">
            <div className="px-4 py-3 border-b flex items-center justify-between bg-accent/25">
              <div className="font-bold text-sm">Live Recorded Steps ({recordedSteps.length})</div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs border-indigo-600/30 text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1" 
                  onClick={handleValidateRecordedFlow}
                  disabled={isValidatingFlow}
                >
                  {isValidatingFlow ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Validate Flow
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={fetchSessionSteps}>
                  Refresh List
                </Button>
              </div>
            </div>

            {/* Grouped vs Raw tabs */}
            <div className="flex border-b text-xs font-semibold bg-accent/5">
              <button 
                onClick={() => setStepsFilter("grouped")} 
                className={`flex-1 py-2 text-center border-r transition-colors ${stepsFilter === "grouped" ? "bg-background text-primary border-b-2 border-b-primary font-bold" : "text-muted-foreground hover:bg-accent/10"}`}
              >
                Grouped Steps ({recordedSteps.filter(s => s.includeInFinalTestCase).length})
              </button>
              <button 
                onClick={() => setStepsFilter("raw")} 
                className={`flex-1 py-2 text-center transition-colors ${stepsFilter === "raw" ? "bg-background text-primary border-b-2 border-b-primary font-bold" : "text-muted-foreground hover:bg-accent/10"}`}
              >
                Raw Events ({recordedSteps.length})
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {recordedSteps.length === 0 ? (
                <div className="text-center py-24 text-muted-foreground space-y-3">
                  <Video className="h-12 w-12 mx-auto stroke-1 text-muted-foreground/50 animate-pulse" />
                  <h4 className="font-semibold text-sm">Interactive Browser Active</h4>
                  <p className="text-xs max-w-sm mx-auto">
                    Open the external Chromium browser and start clicking or filling inputs. Every action is reflected here live.
                  </p>
                </div>
              ) : (
                (() => {
                  const filteredSteps = stepsFilter === "grouped"
                    ? recordedSteps.filter(s => s.includeInFinalTestCase)
                    : recordedSteps;
                  return filteredSteps.map((step, idx) => {
                  const validation = validationResults[step.id]
                  const isValidating = validatingLocators[step.id]
                  
                  return (
                    <div key={step.id} className={`border rounded-xl p-4 bg-card shadow-sm space-y-4 transition-all ${
                      !step.includeInFinalTestCase ? "opacity-50 border-dashed bg-slate-50/50 dark:bg-slate-900/20" : ""
                    }`}>
                      {/* Step Header */}
                      <div className="flex items-start justify-between border-b pb-2 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 px-2 py-0.5 rounded">
                            Step {step.stepNumber}
                          </span>
                          <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 px-2 py-0.5 rounded uppercase">
                            {step.actionType}
                          </span>
                          {step.validationStatus && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              step.validationStatus === "Passed"
                                ? "bg-green-50 text-green-700 border-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/50"
                                : "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50"
                            }`} title={step.validationMessage || ""}>
                              {step.validationStatus === "Passed" ? "✓ Resolved" : "✗ Error"}
                            </span>
                          )}
                        </div>

                        {/* Reliability score */}
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-bold ${
                            step.reliabilityScore >= 80 ? "text-green-600 dark:text-green-400" :
                            step.reliabilityScore >= 50 ? "text-yellow-600 dark:text-yellow-400" :
                            "text-red-600 dark:text-red-400"
                          }`}>
                            Score: {step.reliabilityScore}%
                          </span>
                        </div>
                      </div>

                      {/* Step Description */}
                      <p className="text-sm font-semibold text-foreground leading-normal" dir="auto">
                        {step.actionDescription}
                      </p>

                      {/* Selector & metadata info panel */}
                      <div className="space-y-1 bg-accent/20 p-2.5 rounded-lg text-xs text-muted-foreground font-medium">
                        <div className="truncate" title={step.pageUrl}>
                          Page URL: <span className="font-mono text-foreground">{step.pageUrl}</span>
                        </div>
                        {step.recommendedSelector && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">
                              Selector: <span className="font-mono text-foreground">{step.recommendedSelector}</span>
                            </span>
                            <button
                              onClick={() => handleValidateStepLocator(step.id)}
                              disabled={isValidating}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 flex items-center gap-1 font-bold"
                            >
                              {isValidating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Compass className="h-3 w-3" />
                              )}
                              Validate
                            </button>
                          </div>
                        )}
                        {step.inputValue && (
                          <div>
                            Input Value: <span className="font-mono text-foreground font-semibold">{step.inputValue}</span>
                          </div>
                        )}

                        {/* Locator validation result badge */}
                        {validation && (
                          <div className="mt-1.5 flex items-center">
                            {validation.success && validation.matches === 1 ? (
                              <span className="text-[10px] bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400 px-2 py-0.5 rounded font-bold">
                                ✓ Valid Locator (1 Element found)
                              </span>
                            ) : validation.matches > 1 ? (
                              <span className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400 px-2 py-0.5 rounded font-bold">
                                ⚠ Ambiguous Locator ({validation.matches} Elements found)
                              </span>
                            ) : (
                              <span className="text-[10px] bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400 px-2 py-0.5 rounded font-bold">
                                ✗ Not Found (0 Elements match)
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {step.validationStatus === "Failed" && step.validationMessage && (
                        <div className="bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/10 dark:border-red-900/45 dark:text-red-400 p-2.5 rounded-xl text-xs flex items-start gap-2 font-medium">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                          <div>{step.validationMessage}</div>
                        </div>
                      )}

                      {/* Expected Result Field */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-muted-foreground">Expected Result</Label>
                          <button
                            onClick={() => handleSuggestExpectedResult(step)}
                            className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 font-bold"
                          >
                            <Sparkles className="h-3.5 w-3.5 fill-current" /> AI Fill
                          </button>
                        </div>
                        <Input
                          value={step.expectedResult || ""}
                          onChange={(e) => handleUpdateStepField(step.id, "expectedResult", e.target.value)}
                          placeholder="Action completes successfully..."
                          className="h-9 text-xs bg-background"
                        />
                      </div>

                      {/* Screenshot after action */}
                      {step.screenshotAfter && (
                        <div className="border rounded-xl overflow-hidden bg-accent/20 max-h-48 flex items-center justify-center p-1.5 relative group">
                          <img 
                            src={`/api/files/${step.screenshotAfter}`} 
                            alt="Recorded Action screenshot"
                            className="object-contain max-h-44 rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/50 text-white flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => window.open(`/api/files/${step.screenshotAfter}`)}
                              className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-xs flex items-center gap-1 font-semibold"
                            >
                              <Eye className="h-4 w-4" /> Full View
                            </button>
                            <button 
                              onClick={() => handleTriggerAnnotation(step)}
                              className="bg-primary hover:bg-primary/90 p-2 rounded-lg text-xs flex items-center gap-1 font-semibold text-white"
                            >
                              <Edit2 className="h-4 w-4" /> Annotate
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Notes / Actual result section */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-muted-foreground uppercase">Actual Result</Label>
                          <Input
                            value={step.actualResult || ""}
                            onChange={(e) => handleUpdateStepField(step.id, "actualResult", e.target.value)}
                            placeholder="Observed execution output..."
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-muted-foreground uppercase">Developer Notes</Label>
                          <Input
                            value={step.notes || ""}
                            onChange={(e) => handleUpdateStepField(step.id, "notes", e.target.value)}
                            placeholder="Warnings, APIs slow loads..."
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      {/* Footer Actions: Include state, Bug report, ordering */}
                      <div className="flex items-center justify-between border-t pt-3.5 text-xs text-muted-foreground font-semibold">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={step.includeInFinalTestCase}
                            onChange={(e) => handleUpdateStepField(step.id, "includeInFinalTestCase", e.target.checked)}
                            className="rounded border-muted-foreground/30 text-primary focus:ring-primary h-4 w-4"
                          />
                          <span>Include in Test Case</span>
                        </label>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleTriggerBugModal(step)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 px-2 py-1 rounded flex items-center gap-1 text-xs"
                          >
                            <Bug className="h-3.5 w-3.5" /> Report Bug
                          </button>
                          
                          <div className="flex border rounded-lg overflow-hidden">
                            <button
                              disabled={idx === 0}
                              onClick={() => handleMoveStep(step.id, "up")}
                              className="p-1 hover:bg-accent disabled:opacity-30"
                              title="Move step up"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              disabled={idx === recordedSteps.length - 1}
                              onClick={() => handleMoveStep(step.id, "down")}
                              className="p-1 hover:bg-accent border-l disabled:opacity-30"
                              title="Move step down"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <button
                            onClick={() => handleDeleteStep(step.id)}
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1 rounded transition-colors"
                            title="Delete step"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                    </div>
                  )
                })
              })()
            )}
            </div>
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

              <div className="border p-4 rounded-xl bg-accent/5 space-y-3">
                <h4 className="font-semibold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Suite Hierarchy Selection</h4>
                <HierarchySelector
                  projectId={params.id as string}
                  moduleId={newCaseModuleId}
                  onChangeModuleId={setNewCaseModuleId}
                  featureId={newCaseFeatureId}
                  onChangeFeatureId={setNewCaseFeatureId}
                  componentId={newCaseComponentId}
                  onChangeComponentId={setNewCaseComponentId}
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

    </div>
  )
}
