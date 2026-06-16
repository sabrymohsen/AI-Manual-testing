"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  ExternalLink
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
}

interface RecordedTestCase {
  id: string
  title: string
  module: string
  priority: string
  preconditions: string | null
  status: string
  finalTestCaseId: string | null
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
  const [isStartingSession, setIsStartingSession] = useState(false)

  // Workspace interface controls
  const [isSavingCase, setIsSavingCase] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [activeTab, setActiveTab] = useState<"steps" | "previews">("steps")
  const [savedCasesList, setSavedCasesList] = useState<RecordedTestCase[]>([])
  
  // New Case overlay modal state (inside recording session)
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false)
  const [newCaseTitle, setNewCaseTitle] = useState("")
  const [newCaseModule, setNewCaseModule] = useState("General")
  const [newCaseModuleId, setNewCaseModuleId] = useState("")
  const [newCaseFeatureId, setNewCaseFeatureId] = useState("")
  const [newCaseComponentId, setNewCaseComponentId] = useState("")
  const [newCasePriority, setNewCasePriority] = useState("Medium")
  const [newCasePreconditions, setNewCasePreconditions] = useState("")

  // Polling ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmLabel: string
    isDestructive?: boolean
    onConfirm: () => void
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
    onConfirm: () => void
  }) {
    setConfirmModal({
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
      isDestructive: options.isDestructive,
      onConfirm: () => {
        options.onConfirm()
        setConfirmModal((prev) => ({ ...prev, isOpen: false }))
      },
    })
  }

  // Fetch project details
  useEffect(() => {
    fetchProjectDetails()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [params.id])

  // Poll for steps if session is active
  useEffect(() => {
    if (sessionId && sessionStatus === "Active") {
      startStepsPolling()
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
    } catch (err) {
      console.error("Error fetching steps:", err)
    }
  }

  // 1. Initial Start session
  async function handleStartSession() {
    if (!startUrl.trim()) {
      alert("Starting URL is required.")
      return
    }
    if (!title.trim()) {
      alert("Test Case Title is required.")
      return
    }

    setIsStartingSession(true)
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
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setSessionId(data.session.id)
        setSessionStatus("Active")
        setCurrentTestCase(data.testCase)
        setRecordedSteps([])
        setSavedCasesList([data.testCase])
      } else {
        const err = await res.json()
        alert(err.error || "Failed to start recording session.")
      }
    } catch {
      alert("Network error starting recorder.")
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

    const shouldSave = currentTestCase && currentTestCase.status === "Draft" && recordedSteps.length > 0
    
    if (shouldSave) {
      const missingExpected = recordedSteps.filter(s => s.includeInFinalTestCase && !s.expectedResult)
      if (missingExpected.length > 0) {
        triggerConfirm({
          title: "Save & Exit?",
          message: `Warning: ${missingExpected.length} step(s) do not have Expected Results. Do you want to save the test case and exit anyway?`,
          confirmLabel: "Save & Exit",
          onConfirm: () => proceedFinishAll(true)
        })
      } else {
        triggerConfirm({
          title: "Save & Exit?",
          message: "Are you sure you want to save the current test case and finish recording? This will close the browser window.",
          confirmLabel: "Save & Exit",
          onConfirm: () => proceedFinishAll(true)
        })
      }
    } else {
      triggerConfirm({
        title: "Finish Recording?",
        message: "Are you sure you want to finish recording? This will close the browser window.",
        confirmLabel: "Finish & Exit",
        onConfirm: () => proceedFinishAll(false)
      })
    }
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
        router.push(`/projects/${params.id}/test-cases`)
      } else {
        alert("Failed to finish recording session.")
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
    } else if (step.actionType === "select") {
      suggestion = "Dropdown value should change and display the selected option."
    } else if (step.actionType === "upload_file") {
      suggestion = "Selected file should upload and verify successfully."
    } else if (step.actionType === "screenshot") {
      suggestion = "Page screenshot should be captured for visual comparison verification."
    }

    handleUpdateStepField(step.id, "expectedResult", suggestion)
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
            <h1 className="text-2xl font-bold tracking-tight">Manual Test Case Recorder</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Project: <span className="font-semibold text-foreground">{project.name}</span>
            </p>
          </div>
        </div>

        {sessionId && (
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold animate-pulse ${
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
              Configure your recording scope. Playwright will launch a local browser session to automatically record your steps.
            </p>

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
          <div className="md:col-span-2 space-y-6 flex flex-col">
            
            {/* Session Controller bar */}
            <div className="p-4 border rounded-xl bg-card shadow-sm shrink-0 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {sessionStatus === "Active" ? (
                  <Button variant="outline" size="sm" onClick={handlePauseSession} className="flex items-center gap-1.5 text-xs">
                    <Pause className="h-4 w-4" /> Pause Recording
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleResumeSession} className="flex items-center gap-1.5 text-xs bg-red-50 hover:bg-red-100 dark:bg-red-950/20 text-red-600">
                    <Play className="h-4 w-4 fill-current" /> Resume Recording
                  </Button>
                )}

                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setIsNewCaseModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Plus className="h-4 w-4" /> Start New Test Case
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSaveCurrentCase}
                  disabled={isSavingCase}
                  variant="outline"
                  size="sm"
                  className="border-green-600/30 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/20 text-xs font-bold"
                >
                  <Save className="h-4 w-4" /> Save Case Draft
                </Button>
                <Button
                  onClick={handleFinishAll}
                  disabled={isFinishing}
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  {isFinishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Finish & Exit
                </Button>
                <Button
                  onClick={handleCancelSession}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>

            {/* Active Test Case card */}
            <div className="p-4 border border-dashed rounded-xl bg-accent/10 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Active Test Case Draft</div>
                <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 rounded-full font-bold uppercase">
                  {currentTestCase?.priority}
                </span>
              </div>
              <h3 className="text-md font-bold text-foreground">{currentTestCase?.title}</h3>
              <p className="text-xs text-muted-foreground">
                Module: <span className="font-semibold text-foreground">{currentTestCase?.module}</span>
                {currentTestCase?.preconditions && (
                  <> · Preconditions: <span className="italic text-foreground">{currentTestCase.preconditions}</span></>
                )}
              </p>
            </div>

            {/* In-Browser Interaction Guidance Container */}
            <div className="flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-card/25 min-h-[300px]">
              <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950/20 flex items-center justify-center text-red-600 animate-pulse mb-4">
                <Video className="h-8 w-8 fill-current" />
              </div>
              <h4 className="font-bold text-lg">Interactive Browser Session Active!</h4>
              <p className="text-sm text-muted-foreground max-w-md mt-2 leading-relaxed">
                A non-headless browser window has been opened on your display. 
                Perform your manual actions there. Every click, keystroke, and select is being tracked, indexed, and displayed in the sidebar.
              </p>
              <div className="flex flex-wrap gap-4 justify-center mt-6 text-xs text-muted-foreground bg-accent/20 p-3 rounded-lg border">
                <div>Start URL: <strong className="text-foreground">{startUrl}</strong></div>
                <div>Browser: <strong className="text-foreground">{browserType}</strong></div>
                <div>Viewport: <strong className="text-foreground">{viewport}</strong></div>
              </div>
            </div>

            {/* Saved Test Cases Drafts in this Session tracker list */}
            <div className="p-4 border rounded-xl bg-card space-y-3 shrink-0">
              <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wide">Test Cases in this session</h4>
              <div className="flex flex-wrap gap-2">
                {savedCasesList.map((c) => (
                  <div key={c.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                    c.id === currentTestCase?.id
                      ? "border-primary bg-primary/5 text-primary"
                      : c.status === "SavedAsTestCase"
                        ? "border-green-200 bg-green-50 text-green-700 dark:border-green-950 dark:bg-green-950/20 dark:text-green-400"
                        : "border-border bg-accent/20 text-muted-foreground"
                  }`}>
                    <FileText className="h-3.5 w-3.5" />
                    <span>{c.title}</span>
                    {c.status === "SavedAsTestCase" && <Check className="h-3 w-3 text-green-600" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Recorded Steps List */}
          <div className="md:col-span-1 border rounded-2xl bg-card shadow-lg flex flex-col overflow-hidden max-h-[80vh]">
            {/* Header tab */}
            <div className="px-4 py-3 border-b flex items-center justify-between bg-accent/25">
              <div className="font-bold text-sm">Recorded Steps ({recordedSteps.length})</div>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={fetchSessionSteps}>
                Refresh
              </Button>
            </div>

            {/* List container */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {recordedSteps.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <Video className="h-8 w-8 mx-auto stroke-1" />
                  <p className="text-xs">No steps recorded yet. Intercepting browser actions...</p>
                </div>
              ) : (
                recordedSteps.map((step) => (
                  <div key={step.id} className={`border rounded-xl p-3 bg-card shadow-sm space-y-3 transition-opacity ${
                    !step.includeInFinalTestCase ? "opacity-50" : ""
                  }`}>
                    {/* Top indicator */}
                    <div className="flex items-start justify-between border-b pb-2 gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-muted-foreground">Step {step.stepNumber}</span>
                        <span className="text-[9px] font-semibold bg-secondary/80 text-secondary-foreground border px-1.5 py-0.5 rounded uppercase tracking-wider">
                          {step.actionType}
                        </span>
                      </div>
                      
                      {/* Reliability indicator */}
                      <span className={`text-[10px] font-bold ${
                        step.reliabilityScore >= 80 ? "text-green-600 dark:text-green-400" :
                        step.reliabilityScore >= 50 ? "text-yellow-600 dark:text-yellow-400" :
                        "text-red-600 dark:text-red-400"
                      }`}>
                        {step.reliabilityScore}%
                      </span>
                    </div>

                    {/* Action description text */}
                    <p className="text-xs font-semibold leading-normal text-foreground" dir="auto">
                      {step.actionDescription}
                    </p>

                    {/* Meta values */}
                    <div className="space-y-1 bg-accent/15 p-2 rounded-lg text-[10px] text-muted-foreground">
                      <div className="truncate" title={step.pageUrl}>URL: <span className="font-mono text-foreground">{step.pageUrl}</span></div>
                      {step.targetValue && (
                        <div className="truncate" title={step.targetValue}>
                          Locator ({step.targetType}): <span className="font-mono text-foreground">{step.targetValue}</span>
                        </div>
                      )}
                      {step.inputValue && (
                        <div>Input Value: <span className="font-mono text-foreground font-semibold">{step.inputValue}</span></div>
                      )}
                    </div>

                    {/* Expected Result Input */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold text-muted-foreground">Expected Result</Label>
                        
                        {/* AI suggest expected result */}
                        <button
                          onClick={() => handleSuggestExpectedResult(step)}
                          className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 font-bold"
                          title="Generate Expected Result using AI description analysis"
                        >
                          <Sparkles className="h-3 w-3 fill-current" /> AI Auto-Fill
                        </button>
                      </div>
                      
                      <Input
                        value={step.expectedResult || ""}
                        onChange={(e) => handleUpdateStepField(step.id, "expectedResult", e.target.value)}
                        placeholder="Write what should occur..."
                        className="h-8 text-xs bg-background/50 focus:bg-background"
                      />
                    </div>

                    {/* Screenshot preview */}
                    {step.screenshotAfter && (
                      <div className="border rounded-lg overflow-hidden bg-accent/20 max-h-24 flex items-center justify-center p-1 relative group">
                        <img 
                          src={`/api/files/${step.screenshotAfter}`} 
                          alt="After action screenshot"
                          className="object-contain max-h-20 rounded"
                        />
                        <button 
                          onClick={() => window.open(`/api/files/${step.screenshotAfter}`)}
                          className="absolute inset-0 bg-black/40 text-white flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        >
                          <Eye className="h-3.5 w-3.5" /> Full Size
                        </button>
                      </div>
                    )}

                    {/* Step notes input */}
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-muted-foreground">Notes</Label>
                      <Input
                        value={step.notes || ""}
                        onChange={(e) => handleUpdateStepField(step.id, "notes", e.target.value)}
                        placeholder="Additional step logs..."
                        className="h-7 text-[11px] bg-background/50"
                      />
                    </div>

                    {/* Checkbox controls for final commit */}
                    <div className="flex items-center justify-between pt-1 border-t text-[11px]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={step.includeInFinalTestCase}
                          onChange={(e) => handleUpdateStepField(step.id, "includeInFinalTestCase", e.target.checked)}
                          className="rounded border-muted-foreground/30 text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span className="text-muted-foreground">Include in case</span>
                      </label>

                      <button
                        onClick={() => handleDeleteStep(step.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 p-1 rounded transition-colors"
                        title="Delete step"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                  </div>
                ))
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
              <Button size="sm" onClick={handleCreateNewTestCase} className="bg-primary hover:bg-primary/95">
                Create & Start Recording
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* NON-BLOCKING CUSTOM CONFIRMATION DIALOG */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                {confirmModal.isDestructive ? (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                ) : (
                  <Sparkles className="h-5 w-5 text-primary" />
                )}
                {confirmModal.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {confirmModal.message}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={confirmModal.onConfirm}
                className={
                  confirmModal.isDestructive
                    ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    : "bg-primary hover:bg-primary/90"
                }
              >
                {confirmModal.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
