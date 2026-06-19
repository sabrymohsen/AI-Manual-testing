"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CredentialsList } from "@/components/credentials/credentials-list"
import { RoleSelectModal } from "@/components/test-runs/role-select-modal"
import { PromptInput } from "@/components/ai/prompt-input"
import { GeneratedTestCasePreview } from "@/components/ai/generated-test-case-preview"
import { FigmaConfig } from "@/components/figma/figma-config"
import { IntegrationConfig } from "@/components/integrations/integration-config"
import { ImportModal } from "@/components/test-cases/import-modal"
import { HierarchyExplorer } from "@/components/hierarchy/hierarchy-explorer"
import { Play, FileText, Bug, Settings, Layers, ShieldCheck, Sparkles, RefreshCw, Eye, Compass, Video, Trash2, FileSpreadsheet, Key, FileCheck, GitBranch, Search, ChevronRight, CheckCircle2, AlertCircle, X, ChevronDown, ListFilter, HelpCircle, ArrowRight, Home, LayoutGrid, Check, Plus, AlertTriangle, Shield, User } from "lucide-react"

interface Project {
  id: string
  name: string
  webAppUrl: string
  figmaUrl: string | null
  description: string | null
  environment: string
  browserType: string
  viewport: string
  testType: string
  credentials: Array<{
    id: string
    roleName: string
    username: string
    loginUrl: string | null
    notes: string | null
  }>
  _count: {
    testCases: number
    testRuns: number
  }
  figmaConfig: {
    id: string
    fileKey: string | null
    nodeId: string | null
    visualTolerancePercent: number
  } | null
}

interface TestCase {
  id: string
  title: string
  module: string
  priority: string
  source: string
  steps: Array<{ id: string }>
  moduleId?: string | null
  featureId?: string | null
  componentId?: string | null
}

interface TestRun {
  id: string
  status: string
  roleUsed: string
  browserType: string
  viewport: string
  startedAt: string | null
  completedAt: string | null
  durationMs: number
  testCaseId: string | null
  credentialId: string | null
  testCase: { id: string; title: string } | null
}

interface BugReport {
  id: string
  title: string
  severity: string
  priority: string
  createdAt: string
}

type Tab = "overview" | "design" | "execution" | "coverage" | "reports" | "settings"

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("overview")
  const [loading, setLoading] = useState(true)

  // Sub-data states
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [testRuns, setTestRuns] = useState<TestRun[]>([])
  const [bugReports, setBugReports] = useState<BugReport[]>([])
  const [hierarchyModules, setHierarchyModules] = useState<any[]>([])
  const [requirementsSummary, setRequirementsSummary] = useState<any>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Modal and Execution states
  const [selectedTestCase, setSelectedTestCase] = useState<string | null>(null)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [runningTestId, setRunningTestId] = useState<string | null>(null)

  // AI states
  const [generatedCase, setGeneratedCase] = useState<any>(null)
  const [showAiCase, setShowAiCase] = useState(false)

  // Import states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // New UI states for UX redesign
  const [userMode, setUserMode] = useState<"beginner" | "qa_engineer" | "qa_lead">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`userMode_${params.id}`)
      if (stored === "beginner" || stored === "qa_engineer" || stored === "qa_lead") {
        return stored
      }
    }
    return "qa_engineer"
  })

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandSearch, setCommandSearch] = useState("")
  const [quickStartCollapsed, setQuickStartCollapsed] = useState(false)
  const [showStartTestingModal, setShowStartTestingModal] = useState(false)
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false)

  // Keyboard shortcut listener for Command Palette (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key?.toLowerCase() === "k") {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Persist userMode changes
  const handleUserModeChange = (mode: "beginner" | "qa_engineer" | "qa_lead") => {
    setUserMode(mode)
    if (typeof window !== "undefined") {
      localStorage.setItem(`userMode_${params.id}`, mode)
    }
  }

  // Fetch Project Details and initial metrics
  useEffect(() => {
    fetchProject()
    fetchTestCases()
    fetchTestRuns()
    fetchHierarchy()
    fetchRequirementsSummary()
  }, [params.id])

  // Fetch contextual tab data
  useEffect(() => {
    if (activeTab === "design") {
      fetchTestCases()
    } else if (activeTab === "execution") {
      fetchTestRuns()
    } else if (activeTab === "reports") {
      fetchBugReports()
    } else if (activeTab === "coverage") {
      fetchHierarchy()
      fetchRequirementsSummary()
    }
  }, [params.id, activeTab])

  // Helper to compute module stats
  const getModuleStats = () => {
    const statsMap: Record<string, { total: number; passed: number; failed: number; untested: number }> = {}

    testCases.forEach((tc) => {
      const modName = tc.module || "General"
      if (!statsMap[modName]) {
        statsMap[modName] = { total: 0, passed: 0, failed: 0, untested: 0 }
      }
      statsMap[modName].total++

      const runsForCase = testRuns.filter((r) => r.testCaseId === tc.id && r.status !== "Queued")
      if (runsForCase.length === 0) {
        statsMap[modName].untested++
      } else {
        const latestRun = runsForCase.reduce((latest, current) => {
          const latestTime = latest.completedAt ? new Date(latest.completedAt).getTime() : 0
          const currentTime = current.completedAt ? new Date(current.completedAt).getTime() : 0
          return currentTime > latestTime ? current : latest
        }, runsForCase[0])

        if (latestRun.status === "Passed") {
          statsMap[modName].passed++
        } else if (latestRun.status === "Failed") {
          statsMap[modName].failed++
        } else {
          statsMap[modName].untested++
        }
      }
    })

    return Object.entries(statsMap).map(([name, stat]) => ({
      name,
      ...stat,
      passRate: stat.total > 0 ? (stat.passed / stat.total) * 100 : 0
    }))
  }

  function fetchProject() {
    fetch(`/api/projects/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data.project)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  function fetchTestCases() {
    fetch(`/api/projects/${params.id}/test-cases`)
      .then((res) => res.json())
      .then((data) => {
        setTestCases(data.testCases || [])
        setRefreshKey((prev) => prev + 1)
      })
  }

  function fetchTestRuns() {
    fetch(`/api/projects/${params.id}/test-runs`)
      .then((res) => res.json())
      .then((data) => setTestRuns(data.testRuns || []))
  }

  function fetchBugReports() {
    fetch(`/api/projects/${params.id}/bug-reports`)
      .then((res) => res.json())
      .then((data) => setBugReports(data.bugReports || []))
  }

  function fetchHierarchy() {
    fetch(`/api/projects/${params.id}/hierarchy`)
      .then((res) => res.json())
      .then((data) => setHierarchyModules(data.modules || []))
      .catch(() => { })
  }

  function fetchRequirementsSummary() {
    fetch(`/api/projects/${params.id}/coverage-summary`)
      .then((res) => res.json())
      .then((data) => setRequirementsSummary(data))
      .catch(() => { })
  }

  async function handleStartTestRun(tcId: string) {
    setSelectedTestCase(tcId)
    if (project && project.credentials && project.credentials.length > 0) {
      setShowRoleModal(true)
    } else {
      await executeTestRun(tcId, null)
    }
  }

  async function executeTestRun(tcId: string, credentialId: string | null) {
    setShowRoleModal(false)
    setRunningTestId(tcId)

    try {
      const res = await fetch(`/api/projects/${params.id}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: tcId, credentialId }),
      })

      if (res.ok) {
        const data = await res.json()
        // Navigate to live progress page
        router.push(`/projects/${params.id}/test-runs/${data.testRun.id}`)
      } else {
        alert("Failed to start test execution")
      }
    } catch {
      alert("Network error starting test")
    } finally {
      setRunningTestId(null)
      setSelectedTestCase(null)
    }
  }

  async function saveAiTestCase(tc: any) {
    try {
      const res = await fetch(`/api/projects/${params.id}/test-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tc),
      })

      if (res.ok) {
        fetchTestCases()
        setShowAiCase(false)
        setGeneratedCase(null)
      } else {
        alert("Failed to save AI test case")
      }
    } catch {
      alert("Network error saving test case")
    }
  }

  const getComponentsWithNoCases = () => {
    const list: string[] = []
    hierarchyModules.forEach(mod => {
      mod.features?.forEach((feat: any) => {
        feat.components?.forEach((comp: any) => {
          const hasCase = testCases.some(tc => tc.componentId === comp.id)
          if (!hasCase) {
            list.push(`${mod.name} / ${feat.name} / ${comp.name}`)
          }
        })
      })
    })
    return list
  }

  const getFeaturesWithNoCases = () => {
    const list: string[] = []
    hierarchyModules.forEach(mod => {
      mod.features?.forEach((feat: any) => {
        const hasCase = testCases.some(tc => tc.featureId === feat.id)
        if (!hasCase) {
          list.push(`${mod.name} / ${feat.name}`)
        }
      })
    })
    return list
  }

  const getNotExecutedCases = () => {
    return testCases.filter(tc => {
      const runs = testRuns.filter(r => r.testCaseId === tc.id)
      return runs.length === 0
    })
  }

  const getComponentStatus = (compId: string) => {
    const cases = testCases.filter(tc => tc.componentId === compId)
    if (cases.length === 0) return "No Test Cases"

    const runs = testRuns.filter(r => cases.some(c => c.id === r.testCaseId) && r.status !== "Queued")
    if (runs.length === 0) return "Not Executed"

    let hasFailed = false
    let hasBlocked = false
    let hasWarning = false
    let allPassed = true
    let executedCount = 0

    cases.forEach(tc => {
      const caseRuns = runs.filter(r => r.testCaseId === tc.id)
      if (caseRuns.length === 0) {
        allPassed = false
      } else {
        executedCount++
        const latest = caseRuns.reduce((l, cur) => {
          const lTime = l.completedAt ? new Date(l.completedAt).getTime() : 0
          const curTime = cur.completedAt ? new Date(cur.completedAt).getTime() : 0
          return curTime > lTime ? cur : l
        }, caseRuns[0])

        if (latest.status === "Failed") hasFailed = true
        if (latest.status === "Blocked") hasBlocked = true
        if (latest.status === "Warning") hasWarning = true
        if (latest.status !== "Passed") allPassed = false
      }
    })

    if (hasFailed) return "Failed"
    if (hasBlocked) return "Blocked"
    if (hasWarning) return "Warning"
    if (allPassed && executedCount === cases.length) return "Passed"
    return "Partially Tested"
  }

  if (loading) return <p className="text-muted-foreground p-6">Loading project dashboard...</p>
  if (!project) return <p className="text-destructive p-6">Project not found</p>

  const getTabs = (): Array<{ id: Tab; label: string; icon: any }> => {
    const allTabs: Array<{ id: Tab; label: string; icon: any }> = [
      { id: "overview", label: "Overview", icon: LayoutGrid },
      { id: "design", label: "Design", icon: FileText },
      { id: "execution", label: "Execution", icon: Play },
      { id: "coverage", label: "Coverage", icon: ShieldCheck },
      { id: "reports", label: "Reports", icon: Bug },
      { id: "settings", label: "Settings", icon: Settings },
    ]

    if (userMode === "beginner") {
      return allTabs.filter(t => ["overview", "design", "execution", "settings"].includes(t.id))
    }
    if (userMode === "qa_engineer") {
      return allTabs.filter(t => ["overview", "design", "execution", "reports", "settings"].includes(t.id))
    }
    return allTabs // qa_lead shows all
  }

  const getFilteredActions = () => {
    const allActions = [
      {
        title: "Create Case",
        description: "Write a new manual functional test case",
        icon: Plus,
        onClick: () => router.push(`/projects/${project.id}/test-cases/new`),
      },
      {
        title: "Record Case",
        description: "Launch interactive browser recorder",
        icon: Video,
        onClick: () => router.push(`/projects/${project.id}/record`),
      },
      {
        title: "Start Testing / Session",
        description: "Initiate manual testing execution workspace",
        icon: Play,
        onClick: () => router.push(`/projects/${project.id}/manual-sessions/new`),
      },
      {
        title: "Add Requirement",
        description: "Manage software requirements specifications",
        icon: FileCheck,
        onClick: () => router.push(`/projects/${project.id}/requirements`),
      },
      {
        title: "Add Credential / Role",
        description: "Create role login configurations",
        icon: ShieldCheck,
        onClick: () => {
          setActiveTab("settings")
          setTimeout(() => {
            document.getElementById("credentials-section")?.scrollIntoView({ behavior: "smooth" })
          }, 100)
        },
      },
      {
        title: "Open Element Picker",
        description: "Capture elements & CSS/Text selectors",
        icon: Compass,
        onClick: () => router.push(`/projects/${project.id}/locators`),
      },
      {
        title: "Open Test Data Variables",
        description: "Define environments variables profiles",
        icon: Key,
        onClick: () => router.push(`/projects/${project.id}/test-data`),
      },
      {
        title: "Open Reusable Steps",
        description: "Manage reusable functional sequences",
        icon: Layers,
        onClick: () => router.push(`/projects/${project.id}/reusable-flows`),
      },
      {
        title: "Open Requirement Traceability",
        description: "View coverage trace matrix mapping",
        icon: GitBranch,
        onClick: () => router.push(`/projects/${project.id}/coverage-matrix`),
      },
      {
        title: "Open Bug Reports",
        description: "Inspect defect lists and screenshots",
        icon: Bug,
        onClick: () => {
          setActiveTab("reports")
        },
      },
      {
        title: "Edit Project Settings",
        description: "Update URLs, browser and viewports details",
        icon: Settings,
        onClick: () => router.push(`/projects/${project.id}/edit`),
      },
    ]

    if (!commandSearch) return allActions
    return allActions.filter(
      (a) =>
        a.title.toLowerCase().includes(commandSearch.toLowerCase()) ||
        a.description.toLowerCase().includes(commandSearch.toLowerCase())
    )
  }

  const hasNoCredentials = !project.credentials || project.credentials.length === 0
  const hasNoTestCases = testCases.length === 0
  const hasNoRuns = testRuns.length === 0
  const hasFailedRuns = testRuns.some((r) => r.status === "Failed")
  const requirementsTotal = requirementsSummary?.summary?.total ?? 0
  const requirementsCovered = requirementsSummary?.summary?.covered ?? 0
  const hasUncoveredRequirements = requirementsTotal > 0 && requirementsCovered < requirementsTotal

  const getNextBestAction = () => {
    if (hasNoCredentials) {
      return {
        title: "Next step: Add credentials",
        description: "You need at least one role credential before running login-based tests.",
        btnLabel: "Add Credentials",
        onClick: () => {
          setActiveTab("settings")
          setTimeout(() => {
            document.getElementById("credentials-section")?.scrollIntoView({ behavior: "smooth" })
          }, 100)
        }
      }
    }
    if (hasNoTestCases) {
      return {
        title: "Next step: Create your first test case",
        description: "You can create manually, record from browser, or import from Excel.",
        btnLabel: "Create Test Case",
        onClick: () => router.push(`/projects/${project.id}/test-cases/new`),
        extraBtns: [
          { label: "Record Case", onClick: () => router.push(`/projects/${project.id}/record`) },
          { label: "Import", onClick: () => setIsImportModalOpen(true) }
        ]
      }
    }
    if (hasNoRuns) {
      return {
        title: "Next step: Start a manual session",
        description: "You have test cases ready. Start testing now.",
        btnLabel: "Start Manual Session",
        onClick: () => router.push(`/projects/${project.id}/manual-sessions/new`)
      }
    }
    if (hasUncoveredRequirements) {
      return {
        title: "Next step: Link requirements to test cases",
        description: `${requirementsTotal - requirementsCovered} of your requirements are not covered by any test cases.`,
        btnLabel: "Open Traceability",
        onClick: () => {
          if (userMode === "beginner") {
            router.push(`/projects/${project.id}/coverage-matrix`)
          } else {
            setActiveTab("coverage")
          }
        }
      }
    }
    if (hasFailedRuns) {
      return {
        title: "Next step: Review failed tests",
        description: "There are failed test runs that need bug reports or retesting.",
        btnLabel: "Review Failures",
        onClick: () => {
          setActiveTab("execution")
        }
      }
    }
    return null
  }

  const nextAction = getNextBestAction()
  const isLimitedActivity = testCases.length < 5 || testRuns.length < 5
  const showQuickStartPanel = isLimitedActivity || !quickStartCollapsed

  const checklistItems = [
    {
      id: "url",
      label: "Project URL configured",
      isCompleted: !!project.webAppUrl,
      btnLabel: "Configure URL",
      action: () => router.push(`/projects/${project.id}/edit`),
    },
    {
      id: "credential",
      label: "At least one credential added",
      isCompleted: project.credentials.length > 0,
      btnLabel: "Add Credential",
      action: () => {
        setActiveTab("settings")
        setTimeout(() => {
          document.getElementById("credentials-section")?.scrollIntoView({ behavior: "smooth" })
        }, 100)
      },
    },
    {
      id: "module",
      label: "At least one module created",
      isCompleted: hierarchyModules.length > 0,
      btnLabel: "Create Module",
      action: () => setActiveTab("design"),
    },
    {
      id: "testcase",
      label: "At least one test case created",
      isCompleted: testCases.length > 0,
      btnLabel: "Create Case",
      action: () => router.push(`/projects/${project.id}/test-cases/new`),
    },
    {
      id: "requirement",
      label: "At least one requirement added",
      isCompleted: requirementsTotal > 0,
      btnLabel: "Add Requirement",
      action: () => router.push(`/projects/${project.id}/requirements`),
    },
    {
      id: "testrun",
      label: "At least one test run completed",
      isCompleted: testRuns.length > 0,
      btnLabel: "Run Test",
      action: () => setActiveTab("execution"),
    },
    {
      id: "bug",
      label: "Bug report workflow tested",
      isCompleted: bugReports.length > 0,
      btnLabel: "View Bugs",
      action: () => {
        if (userMode === "beginner") {
          router.push(`/projects/${project.id}/bug-reports`)
        } else {
          setActiveTab("reports")
        }
      },
    },
  ]

  const completedChecklistCount = checklistItems.filter((i) => i.isCompleted).length

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
      {/* Breadcrumbs Navigation */}
      <nav className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2">
        <Link href="/dashboard" className="hover:text-indigo-600 transition-colors flex items-center gap-1.5">
          <Home className="h-3.5 w-3.5" /> Dashboard
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <Link href="/projects" className="hover:text-indigo-600 transition-colors">
          Projects
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <span className="text-slate-800 font-bold max-w-[150px] truncate">{project.name}</span>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <span className="text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 rounded capitalize">{activeTab}</span>
      </nav>

      {/* Project Header Redesign */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="space-y-2.5 w-full lg:w-auto">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">{project.name}</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              {project.environment || "Dev"}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-850 dark:text-slate-300">
              {project.testType || "Functional"}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-slate-500">
            <a
              href={project.webAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 underline font-medium truncate flex items-center gap-1 max-w-[300px]"
            >
              {project.webAppUrl}
            </a>
            <span className="hidden sm:inline text-slate-350">|</span>
            <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 px-2 py-1 rounded border border-slate-100 dark:border-slate-800/60 text-xs">
              <span className="font-semibold text-slate-750 dark:text-slate-300">Browser:</span> {project.browserType}
            </span>
            <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 px-2 py-1 rounded border border-slate-100 dark:border-slate-800/60 text-xs">
              <span className="font-semibold text-slate-750 dark:text-slate-300">Viewport:</span> {project.viewport}
            </span>
          </div>
        </div>

        {/* Header Actions: Start Testing (Primary) and More Actions (Secondary) */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto self-stretch sm:self-auto justify-end">
          <Button
            onClick={() => setShowStartTestingModal(true)}
            className="flex-1 sm:flex-initial bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98] transition-all"
          >
            <Play className="h-4 w-4 fill-white" /> Start Testing
          </Button>

          {/* More Actions Dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setIsMoreActionsOpen(!isMoreActionsOpen)}
              className="flex items-center gap-1.5 border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/80 font-semibold text-slate-700 dark:text-slate-300"
            >
              More Actions <ChevronDown className="h-4 w-4 text-slate-500" />
            </Button>

            {isMoreActionsOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setIsMoreActionsOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-2 z-30 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50 dark:border-slate-800/60 pb-1 mb-1">
                    Quick Actions
                  </div>
                  <Link
                    href={`/projects/${project.id}/record`}
                    onClick={() => setIsMoreActionsOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-750 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                  >
                    <Video className="h-4 w-4 text-slate-400" /> Record Case
                  </Link>
                  <button
                    onClick={() => {
                      setIsMoreActionsOpen(false)
                      setIsImportModalOpen(true)
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left text-slate-750 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-slate-400" /> Import Cases
                  </button>
                  <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>

                  <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50 dark:border-slate-800/60 pb-1 mb-1">
                    QA Libraries
                  </div>
                  <Link
                    href={`/projects/${project.id}/locators`}
                    onClick={() => setIsMoreActionsOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-750 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                  >
                    <Compass className="h-4 w-4 text-slate-400" /> Element Picker
                  </Link>
                  <Link
                    href={`/projects/${project.id}/test-data`}
                    onClick={() => setIsMoreActionsOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-750 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                  >
                    <Key className="h-4 w-4 text-slate-400" /> Test Data Variables
                  </Link>
                  <Link
                    href={`/projects/${project.id}/reusable-flows`}
                    onClick={() => setIsMoreActionsOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-750 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                  >
                    <Layers className="h-4 w-4 text-slate-400" /> Reusable Steps
                  </Link>
                  <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>

                  <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50 dark:border-slate-800/60 pb-1 mb-1">
                    Figma / Setup
                  </div>
                  <Link
                    href={`/projects/${project.id}/visual-comparison`}
                    onClick={() => setIsMoreActionsOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-750 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                  >
                    <Eye className="h-4 w-4 text-slate-400" /> Figma Visual Check
                  </Link>
                  <Link
                    href={`/projects/${project.id}/edit`}
                    onClick={() => setIsMoreActionsOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-805 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors font-semibold text-indigo-650"
                  >
                    <Settings className="h-4 w-4" /> Edit Project Details
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* User Mode Quick Switcher */}
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px]">
            <span className="px-1.5 font-bold text-slate-400">User Mode:</span>
            {(["beginner", "qa_engineer", "qa_lead"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleUserModeChange(mode)}
                className={`px-2 py-0.5 rounded-lg font-bold capitalize transition-all ${userMode === mode
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-100 dark:border-slate-800"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
              >
                {mode.replace("qa_", "")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs list navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-850 overflow-x-auto gap-5">
        {getTabs().map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
            >
              <Icon className="h-4.5 w-4.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ----------------- OVERVIEW TAB ----------------- */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Smart Next Best Action */}
          {nextAction && (
            <div className="bg-gradient-to-r from-indigo-50/70 to-violet-50/70 dark:from-indigo-950/20 dark:to-violet-950/20 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-md">
                  <Sparkles className="h-5 w-5 fill-indigo-200" />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 dark:text-slate-50 text-sm md:text-base">{nextAction.title}</h4>
                  <p className="text-xs md:text-sm text-slate-500 mt-0.5">{nextAction.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                {nextAction.extraBtns?.map((btn, bidx) => (
                  <Button
                    key={bidx}
                    variant="outline"
                    size="sm"
                    onClick={btn.onClick}
                    className="text-xs font-semibold"
                  >
                    {btn.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  onClick={nextAction.onClick}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                >
                  {nextAction.btnLabel}
                </Button>
              </div>
            </div>
          )}

          {/* Quick Start Panel */}
          {showQuickStartPanel && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-indigo-650" /> What do you want to do?
                </h3>
                {!isLimitedActivity && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setQuickStartCollapsed(true)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Hide Panel
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Card 1 */}
                <div className="border border-slate-150 dark:border-slate-850 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/20 hover:shadow-sm transition-shadow flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <div className="h-10 w-10 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-emerald-600 flex items-center justify-center">
                      <Play className="h-5 w-5 fill-emerald-600" />
                    </div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Start Manual Session</h4>
                    <p className="text-xs text-slate-400 leading-normal">Run multiple test cases and mark results manually.</p>
                  </div>
                  <Link href={`/projects/${project.id}/manual-sessions/new`}>
                    <Button size="sm" className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">Start Testing</Button>
                  </Link>
                </div>

                {/* Card 2 */}
                <div className="border border-slate-150 dark:border-slate-850 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/20 hover:shadow-sm transition-shadow flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <div className="h-10 w-10 bg-red-50 dark:bg-red-950/30 rounded-lg text-red-600 flex items-center justify-center">
                      <Video className="h-5 w-5" />
                    </div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Record Test Case</h4>
                    <p className="text-xs text-slate-400 leading-normal">Record user actions and convert them into a test case.</p>
                  </div>
                  <Link href={`/projects/${project.id}/record`}>
                    <Button size="sm" className="w-full text-xs font-bold bg-red-600 hover:bg-red-700 text-white">Record Case</Button>
                  </Link>
                </div>

                {/* Card 3 */}
                <div className="border border-slate-150 dark:border-slate-850 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/20 hover:shadow-sm transition-shadow flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <div className="h-10 w-10 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg text-indigo-650 flex items-center justify-center">
                      <Plus className="h-5 w-5" />
                    </div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Create Test Case</h4>
                    <p className="text-xs text-slate-400 leading-normal">Write a new functional test case manually.</p>
                  </div>
                  <Link href={`/projects/${project.id}/test-cases/new`}>
                    <Button size="sm" className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white">Create Case</Button>
                  </Link>
                </div>

                {/* Card 4 */}
                <div className="border border-slate-150 dark:border-slate-850 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/20 hover:shadow-sm transition-shadow flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <div className="h-10 w-10 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-amber-600 flex items-center justify-center">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Import Test Cases</h4>
                    <p className="text-xs text-slate-400 leading-normal">Upload Excel spreadsheet with predefined test cases.</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setIsImportModalOpen(true)}
                    className="w-full text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    Import Cases
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Start Panel toggle if collapsed */}
          {!showQuickStartPanel && (
            <div className="flex justify-start">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuickStartCollapsed(false)}
                className="text-xs font-bold text-indigo-650 dark:text-indigo-400 hover:underline flex items-center gap-1 p-0 h-auto"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Show Guided Quick Start Panel
              </Button>
            </div>
          )}

          {/* Grid Layout: Setup Checklist + Metrics */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Project Setup Checklist */}
            <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">Project Setup Checklist</h3>
                <p className="text-xs text-slate-450 mt-0.5">Configure your project workspace completely.</p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-850 rounded-xl p-3 flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Project setup progress</span>
                <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{completedChecklistCount} / 7 completed</span>
              </div>

              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${(completedChecklistCount / 7) * 100}%` }}
                />
              </div>

              <div className="space-y-2.5 pt-2">
                {checklistItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 text-xs border-b border-slate-50 dark:border-slate-800/40 pb-2 last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-2 truncate">
                      {item.isCompleted ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-slate-300 flex-shrink-0" />
                      )}
                      <span className={`truncate ${item.isCompleted ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-300 font-medium"}`}>
                        {item.label}
                      </span>
                    </div>
                    {!item.isCompleted && (
                      <button
                        onClick={item.action}
                        className="text-[10px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 font-bold px-2 py-1 rounded transition-colors text-slate-605"
                      >
                        {item.btnLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Clickable Metrics cards grid */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">Key Metrics Overview</h3>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">

                {/* 1. Test Cases */}
                <div
                  onClick={() => setActiveTab("design")}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 hover:shadow-md hover:border-indigo-150 transition-all cursor-pointer group"
                >
                  <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-indigo-500" /> Test Cases
                  </p>
                  <p className="text-2xl font-black mt-2 text-slate-800 dark:text-slate-100">{project._count.testCases}</p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5 group-hover:text-indigo-600 transition-colors">
                    View design matrix <ChevronRight className="h-3 w-3" />
                  </p>
                </div>

                {/* 2. Test Runs */}
                <div
                  onClick={() => setActiveTab("execution")}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 hover:shadow-md hover:border-indigo-150 transition-all cursor-pointer group"
                >
                  <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                    <Play className="h-4 w-4 text-emerald-500" /> Test Runs
                  </p>
                  <p className="text-2xl font-black mt-2 text-slate-800 dark:text-slate-100">{project._count.testRuns}</p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5 group-hover:text-indigo-600 transition-colors">
                    View executions list <ChevronRight className="h-3 w-3" />
                  </p>
                </div>

                {/* 3. Requirements */}
                <div
                  onClick={() => {
                    if (userMode === "beginner") {
                      router.push(`/projects/${project.id}/requirements`)
                    } else {
                      setActiveTab("coverage")
                    }
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 hover:shadow-md hover:border-indigo-150 transition-all cursor-pointer group"
                >
                  <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                    <FileCheck className="h-4 w-4 text-purple-500" /> Requirements
                  </p>
                  <p className="text-2xl font-black mt-2 text-slate-800 dark:text-slate-100">{requirementsTotal}</p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5 group-hover:text-indigo-600 transition-colors">
                    View coverage specs <ChevronRight className="h-3 w-3" />
                  </p>
                </div>

                {/* 4. Coverage Percentage */}
                <div
                  onClick={() => {
                    if (userMode === "beginner") {
                      router.push(`/projects/${project.id}/coverage-matrix`)
                    } else {
                      setActiveTab("coverage")
                    }
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 hover:shadow-md hover:border-indigo-150 transition-all cursor-pointer group"
                >
                  <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-violet-500" /> Coverage Rate
                  </p>
                  <p className="text-2xl font-black mt-2 text-slate-800 dark:text-slate-100">
                    {requirementsSummary?.summary?.coveragePercentage ?? 0}%
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5 group-hover:text-indigo-600 transition-colors">
                    View coverage overview <ChevronRight className="h-3 w-3" />
                  </p>
                </div>

                {/* 5. Open Bugs */}
                <div
                  onClick={() => {
                    if (userMode === "beginner") {
                      router.push(`/projects/${project.id}/bug-reports`)
                    } else {
                      setActiveTab("reports")
                    }
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 hover:shadow-md hover:border-indigo-150 transition-all cursor-pointer group"
                >
                  <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                    <Bug className="h-4 w-4 text-red-500" /> Open Bugs
                  </p>
                  <p className="text-2xl font-black mt-2 text-slate-800 dark:text-slate-100">{bugReports.length}</p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5 group-hover:text-indigo-600 transition-colors">
                    Review defects list <ChevronRight className="h-3 w-3" />
                  </p>
                </div>

                {/* 6. Failed Runs */}
                <div
                  onClick={() => setActiveTab("execution")}
                  className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 hover:shadow-md hover:border-indigo-150 transition-all cursor-pointer group"
                >
                  <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-orange-500" /> Failed Runs
                  </p>
                  <p className="text-2xl font-black mt-2 text-slate-800 dark:text-slate-100">
                    {testRuns.filter((r) => r.status === "Failed").length}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-0.5 group-hover:text-indigo-600 transition-colors">
                    Review failed logs <ChevronRight className="h-3 w-3" />
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Module Pass Rate stats */}
          {userMode !== "beginner" && (
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 bg-white dark:bg-slate-900 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">Module Coverage & Test Metrics</h3>
              </div>

              {getModuleStats().length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  No modules or test cases defined to analyze coverage.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                  {getModuleStats().map((m) => (
                    <div key={m.name} className="border border-slate-100 dark:border-slate-800/60 rounded-xl p-4 bg-slate-50/20 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate max-w-[180px]">{m.name}</span>
                        <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-450 px-2 py-0.5 rounded-full font-bold">
                          {m.total} case{m.total > 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>Pass Rate</span>
                          <span className="font-bold text-slate-850 dark:text-slate-100">{Math.round(m.passRate)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-green-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${m.passRate}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 justify-between text-[10px] font-bold pt-2 border-t border-slate-100 dark:border-slate-800/60">
                        <span className="text-green-600">Passed: {m.passed}</span>
                        <span className="text-red-500">Failed: {m.failed}</span>
                        <span className="text-slate-400">Untested: {m.untested}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Requirements Coverage stats */}
          {userMode === "qa_lead" && (
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 bg-white dark:bg-slate-900 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">Requirements Coverage by Module</h3>
              </div>

              {!requirementsSummary?.moduleCoverage || requirementsSummary.moduleCoverage.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  No requirement coverage data available. Add modules to requirements.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                  {requirementsSummary.moduleCoverage.map((m: any) => (
                    <div key={m.name} className="border border-slate-100 dark:border-slate-800/60 rounded-xl p-4 bg-slate-50/20 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate max-w-[180px]">{m.name}</span>
                        <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                          {m.covered}/{m.total} covered
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>Coverage</span>
                          <span className="font-bold text-slate-855 dark:text-slate-100">{m.percent}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${m.percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Project description */}
          {project.description && (
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 bg-white dark:bg-slate-900">
              <p className="text-xs font-bold uppercase text-slate-400 tracking-wider">Project Description</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-350 whitespace-pre-wrap leading-relaxed">{project.description}</p>
            </div>
          )}
        </div>
      )}

      {/* ----------------- DESIGN TAB ----------------- */}
      {activeTab === "design" && (
        <div className="space-y-6">
          {/* Action Header */}
          <div className="bg-slate-50 dark:bg-slate-800/30 p-4 border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">Test Design Console</h3>
              <p className="text-xs text-slate-500 mt-0.5">Author test cases, sync from Excel files, and run locators picker checks.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="flex items-center gap-1.5 border-amber-500/30 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/20 text-xs font-semibold h-9"
                onClick={() => setIsImportModalOpen(true)}
              >
                <FileSpreadsheet className="h-4 w-4" /> Import Cases
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-1.5 border-violet-500/30 text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/20 text-xs font-semibold h-9"
                onClick={() => setShowAiCase(true)}
              >
                <Sparkles className="h-4 w-4" /> AI Generate Case
              </Button>
              <Button
                onClick={() => router.push(`/projects/${project.id}/test-cases/new`)}
                className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold h-9"
              >
                Create Case
              </Button>
            </div>
          </div>

          {/* AI Generator In-place box */}
          {showAiCase && (
            <div className="border border-indigo-150 dark:border-indigo-900/60 rounded-xl p-5 bg-indigo-50/20 dark:bg-indigo-950/10 space-y-4 animate-in fade-in slide-in-from-top-3 duration-250">
              <div className="flex items-center justify-between border-b border-indigo-100/60 dark:border-indigo-900/40 pb-2">
                <h4 className="font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5 text-sm">
                  <Sparkles className="h-4 w-4 fill-indigo-200" /> AI Test Generator
                </h4>
                <Button size="sm" variant="ghost" onClick={() => setShowAiCase(false)} className="h-7 text-xs text-slate-500 hover:bg-slate-200/40">
                  Close
                </Button>
              </div>

              {!generatedCase ? (
                <PromptInput
                  projectId={project.id}
                  onGenerated={(tc) => setGeneratedCase(tc)}
                />
              ) : (
                <GeneratedTestCasePreview
                  testCase={generatedCase}
                  onApprove={() => saveAiTestCase(generatedCase)}
                  onReject={() => setGeneratedCase(null)}
                  onEdit={(updated) => setGeneratedCase(updated)}
                />
              )}
            </div>
          )}

          {/* Grouped QA Design Tools cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div
              onClick={() => router.push(`/projects/${project.id}/locators`)}
              className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 bg-white dark:bg-slate-900 hover:shadow-md cursor-pointer hover:border-indigo-200 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="h-9 w-9 bg-purple-50 dark:bg-purple-950/30 rounded-lg text-purple-600 flex items-center justify-center">
                  <Compass className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </div>
              <h4 className="font-extrabold text-sm text-slate-850 dark:text-slate-200 mt-3">Element Picker</h4>
              <p className="text-xs text-slate-400 mt-1">Capture selector paths (IDs, CSS, expected roles) from your target app.</p>
            </div>

            <div
              onClick={() => router.push(`/projects/${project.id}/test-data`)}
              className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 bg-white dark:bg-slate-900 hover:shadow-md cursor-pointer hover:border-indigo-200 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="h-9 w-9 bg-orange-50 dark:bg-orange-950/30 rounded-lg text-orange-600 flex items-center justify-center">
                  <Key className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </div>
              <h4 className="font-extrabold text-sm text-slate-850 dark:text-slate-200 mt-3">Test Data Variables</h4>
              <p className="text-xs text-slate-400 mt-1">Configure inputs, credentials placeholders, and data profiles tables.</p>
            </div>

            <div
              onClick={() => router.push(`/projects/${project.id}/reusable-flows`)}
              className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 bg-white dark:bg-slate-900 hover:shadow-md cursor-pointer hover:border-indigo-200 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="h-9 w-9 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-blue-650 flex items-center justify-center">
                  <Layers className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
              </div>
              <h4 className="font-extrabold text-sm text-slate-850 dark:text-slate-200 mt-3">Reusable Steps</h4>
              <p className="text-xs text-slate-400 mt-1">Construct modular components (login steps, setup procedures) to link inside tests.</p>
            </div>
          </div>

          {/* Test cases list */}
          {hasNoTestCases ? (
            <div className="text-center py-14 border border-dashed rounded-2xl bg-white dark:bg-slate-900 space-y-4">
              <div className="h-12 w-12 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No test cases created yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-normal">
                  Start by writing a test case manually, launching the browser action recorder, or importing from Excel.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => router.push(`/projects/${project.id}/test-cases/new`)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
                >
                  Create Case
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/projects/${project.id}/record`)}
                  className="border-slate-250 font-semibold text-xs text-slate-700 hover:bg-slate-50"
                >
                  Record Case
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsImportModalOpen(true)}
                  className="border-slate-250 font-semibold text-xs text-slate-700 hover:bg-slate-50"
                >
                  Import Excel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">Project Module Hierarchy</h3>
              <HierarchyExplorer
                key={refreshKey}
                projectId={project.id}
                onStartTestRun={handleStartTestRun}
                runningTestId={runningTestId}
              />
            </div>
          )}
        </div>
      )}

      {/* ----------------- EXECUTION TAB ----------------- */}
      {activeTab === "execution" && (
        <div className="space-y-6">
          <div className="bg-slate-50 dark:bg-slate-800/30 p-4 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">Manual & Automated Executions</h3>
              <p className="text-xs text-slate-500 mt-0.5">Start execution runners, view results logs, or review rerun queues.</p>
            </div>
            <Link href={`/projects/${project.id}/manual-sessions/new`}>
              <Button className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm text-xs h-9">
                <Play className="h-4 w-4 fill-white" /> Start Manual Session
              </Button>
            </Link>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Test Runs History</h3>
              <Button variant="outline" size="sm" onClick={fetchTestRuns} className="flex items-center gap-1 h-8 text-xs font-semibold">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>

            {testRuns.length === 0 ? (
              <p className="text-slate-400 text-center py-12 border border-dashed rounded-xl bg-white dark:bg-slate-900 text-sm">
                No test run executions recorded yet. Launch a manual session above to begin.
              </p>
            ) : (
              <div className="border border-slate-200/60 dark:border-slate-800 rounded-xl divide-y dark:divide-slate-800 overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                {testRuns.map((run) => (
                  <div
                    key={run.id}
                    onClick={() => router.push(`/projects/${project.id}/test-runs/${run.id}/report`)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-card hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors gap-3"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{run.testCase?.title || "Standalone Visual Diff"}</p>
                      <p className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>Role: <strong className="text-slate-600 dark:text-slate-350">{run.roleUsed}</strong></span>
                        <span>·</span>
                        <span>Browser: <strong className="text-slate-605 dark:text-slate-350">{run.browserType}</strong></span>
                        <span>·</span>
                        <span>Viewport: <strong className="text-slate-605 dark:text-slate-350">{run.viewport}</strong></span>
                        {run.completedAt && (
                          <>
                            <span>·</span>
                            <span>{new Date(run.completedAt).toLocaleString()}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${run.status === "Passed" ? "bg-green-50 text-green-700 border-green-200" :
                            run.status === "Failed" ? "bg-red-50 text-red-700 border-red-200" :
                              run.status === "Running" ? "bg-blue-50 text-blue-700 border-blue-200 animate-pulse" :
                                run.status === "Queued" ? "bg-slate-50 text-slate-700 border-slate-200" :
                                  "bg-yellow-50 text-yellow-750 border-yellow-200"
                          }`}>
                          {run.status}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {run.durationMs > 0 ? `${(run.durationMs / 1000).toFixed(1)}s` : "running"}
                        </span>
                      </div>
                      {run.testCaseId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await executeTestRun(run.testCaseId!, run.credentialId)
                          }}
                          disabled={runningTestId === run.testCaseId}
                          className="flex items-center gap-1 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-800 h-8 font-bold text-xs"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          Rerun
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- COVERAGE TAB ----------------- */}
      {activeTab === "coverage" && (
        <div className="space-y-6">
          <div className="bg-slate-50 dark:bg-slate-800/30 p-4 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">Requirements & Coverage</h3>
              <p className="text-xs text-slate-500 mt-0.5">Map test cases to specifications and identify coverage gaps.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => router.push(`/projects/${project.id}/coverage-matrix`)}
                className="flex items-center gap-1.5 border-emerald-500/30 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold h-9"
              >
                <GitBranch className="h-4 w-4" /> Requirement Traceability
              </Button>
              <Button
                onClick={() => router.push(`/projects/${project.id}/requirements`)}
                className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold h-9 flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" /> Add Requirement
              </Button>
            </div>
          </div>

          {requirementsTotal === 0 ? (
            <div className="text-center py-14 border border-dashed rounded-2xl bg-white dark:bg-slate-900 space-y-4">
              <div className="h-12 w-12 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <FileCheck className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No requirements added yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-normal">
                  Link functional targets to your specs by uploading requirements lists or adding them manually.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => router.push(`/projects/${project.id}/requirements`)}
                  className="bg-indigo-650 hover:bg-indigo-700 text-white font-semibold text-xs"
                >
                  Add Requirement
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/projects/${project.id}/requirements`)}
                  className="border-slate-250 font-semibold text-xs text-slate-700 hover:bg-slate-50"
                >
                  Import Requirements
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {/* Coverage Map */}
              <div className="md:col-span-2 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 bg-white dark:bg-slate-900 space-y-5 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Coverage Overview</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Hierarchical breakdown and execution health of Modules, Features, and Components.
                  </p>
                </div>

                {hierarchyModules.length === 0 ? (
                  <div className="text-center p-12 text-slate-400 text-sm">
                    No Modules defined. Construct your project structure inside the Design tab first.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {hierarchyModules.map((mod) => (
                      <div key={mod.id} className="border border-slate-100 dark:border-slate-800/60 rounded-xl p-4 bg-slate-50/20 space-y-3">
                        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b dark:border-slate-800 pb-2 flex justify-between items-center">
                          <span>📦 Module: {mod.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium">{mod.features?.length || 0} features</span>
                        </h3>

                        {mod.features?.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No features defined in this module.</p>
                        ) : (
                          <div className="space-y-3">
                            {mod.features.map((feat: any) => (
                              <div key={feat.id} className="pl-3.5 border-l-2 border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="text-xs font-bold text-slate-650 dark:text-slate-400">⚡ Feature: {feat.name}</h4>

                                {feat.components?.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic pl-2">No components defined.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-2 pl-2 animate-in fade-in duration-200">
                                    {feat.components.map((comp: any) => {
                                      const status = getComponentStatus(comp.id)
                                      const badgeColor =
                                        status === "Passed" ? "bg-green-50 text-green-750 border-green-200" :
                                          status === "Failed" ? "bg-red-50 text-red-750 border-red-200" :
                                            status === "Blocked" ? "bg-orange-50 text-orange-755 border-orange-200" :
                                              status === "Warning" ? "bg-amber-50 text-amber-750 border-amber-200" :
                                                status === "Partially Tested" ? "bg-yellow-50 text-yellow-750 border-yellow-250" :
                                                  status === "Not Executed" ? "bg-blue-50 text-blue-750 border-blue-200" :
                                                    "bg-slate-50 text-slate-600 border-slate-200"

                                      return (
                                        <div
                                          key={comp.id}
                                          className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 ${badgeColor}`}
                                          title={`Status: ${status}`}
                                        >
                                          <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                                          {comp.name}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Warnings & Attention needed */}
              <div className="space-y-6">
                <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-4">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Coverage Warnings</h3>

                  <div className="space-y-2 text-xs">
                    <div className="p-3 bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-350">Components with No Cases</span>
                      <span className="font-extrabold font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-700">{getComponentsWithNoCases().length}</span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-855 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-350">Features with No Cases</span>
                      <span className="font-extrabold font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-700">{getFeaturesWithNoCases().length}</span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-855 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-350">Not Executed Test Cases</span>
                      <span className="font-extrabold font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-700">{getNotExecutedCases().length}</span>
                    </div>
                  </div>
                </div>

                {getComponentsWithNoCases().length > 0 && (
                  <div className="border border-slate-200/85 dark:border-slate-800/85 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-3">
                    <h3 className="text-xs font-black text-amber-600 dark:text-amber-500 uppercase tracking-wider">Needs Cases</h3>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs text-slate-600 dark:text-slate-350">
                      {getComponentsWithNoCases().map((c, idx) => (
                        <div key={idx} className="p-2 bg-amber-50/30 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 rounded-lg truncate">
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {getNotExecutedCases().length > 0 && (
                  <div className="border border-slate-200/85 dark:border-slate-800/85 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-3">
                    <h3 className="text-xs font-black text-blue-600 dark:text-blue-500 uppercase tracking-wider">Unexecuted Test Cases</h3>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs text-slate-600 dark:text-slate-350">
                      {getNotExecutedCases().map((tc) => (
                        <div key={tc.id} className="p-2 bg-blue-50/30 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-lg truncate">
                          {tc.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- REPORTS TAB ----------------- */}
      {activeTab === "reports" && (
        <div className="space-y-6">
          <div className="bg-slate-50 dark:bg-slate-800/30 p-4 border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base">Defects & Evidence Reports</h3>
              <p className="text-xs text-slate-500 mt-0.5">Track reported bugs, review screens layout comparisons, and download QA reports.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => router.push(`/projects/${project.id}/visual-comparison`)}
                className="flex items-center gap-1.5 border-indigo-500/30 text-indigo-700 hover:bg-indigo-50 text-xs font-semibold h-9"
              >
                <Eye className="h-4 w-4" /> Figma Visual Check
              </Button>
              <Button
                onClick={() => router.push(`/projects/${project.id}/bug-reports`)}
                className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold h-9 flex items-center gap-1.5"
              >
                <Bug className="h-4 w-4" /> Review Bugs
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Active Bug Reports</h3>
            {bugReports.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-xl bg-white dark:bg-slate-900 space-y-3">
                <p className="text-slate-400 text-sm">No bugs reported for this project.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("execution")}
                  className="text-xs font-semibold"
                >
                  View Test Runs
                </Button>
              </div>
            ) : (
              <div className="border border-slate-200/60 dark:border-slate-800 rounded-xl divide-y dark:divide-slate-800 overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                {bugReports.map((bug) => (
                  <div
                    key={bug.id}
                    onClick={() => router.push(`/projects/${project.id}/bug-reports/${bug.id}`)}
                    className="flex items-center justify-between p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{bug.title}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Logged on {new Date(bug.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded font-bold ${bug.severity === "Critical" ? "bg-red-50 text-red-700 border border-red-100" :
                          bug.severity === "High" ? "bg-orange-50 text-orange-700 border border-orange-100" :
                            "bg-blue-50 text-blue-700 border border-blue-100"
                        }`}>
                        {bug.severity}
                      </span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded font-bold ${bug.priority === "Critical" ? "bg-red-50 text-red-700 border border-red-100" :
                          bug.priority === "High" ? "bg-orange-50 text-orange-700 border border-orange-100" :
                            "bg-blue-50 text-blue-700 border border-blue-100"
                        }`}>
                        Priority: {bug.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- SETTINGS TAB ----------------- */}
      {activeTab === "settings" && (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">

            {/* Credentials vault section */}
            <div id="credentials-section" className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
              <div className="border-b dark:border-slate-800 pb-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-indigo-600" /> Credentials Vault
                </h3>
                <p className="text-xs text-slate-450 mt-0.5">
                  Manage encrypted passwords and multi-role credentials safe.
                </p>
              </div>
              <CredentialsList
                projectId={project.id}
                credentials={project.credentials}
                onUpdate={fetchProject}
              />
            </div>

            {/* Figma syncer */}
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
              <div className="border-b dark:border-slate-800 pb-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <Eye className="h-5 w-5 text-violet-600" /> Figma Mock Configuration
                </h3>
                <p className="text-xs text-slate-450 mt-0.5">
                  Connect target designs with Figma URL node configurations.
                </p>
              </div>
              <FigmaConfig
                projectId={project.id}
                onSyncComplete={(data) => {
                  fetchProject()
                  alert("Figma mock synced successfully!")
                }}
              />
            </div>

            {/* AI integrations config */}
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
              <div className="border-b dark:border-slate-800 pb-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-650" /> AI Settings & Integrations
                </h3>
                <p className="text-xs text-slate-450 mt-0.5">
                  Configure OpenAI/Anthropic model keys for functional checks.
                </p>
              </div>
              <IntegrationConfig projectId={project.id} />
            </div>
          </div>

          <div className="space-y-6">
            {/* Quick overview detail actions */}
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Project configuration</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-450 block">Default viewport configuration</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 mt-0.5 block">{project.viewport}</span>
                </div>
                <div>
                  <span className="text-slate-450 block">Browser environment type</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 mt-0.5 block capitalize">{project.browserType}</span>
                </div>
                <div>
                  <span className="text-slate-450 block">Selected testing environment profile</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 mt-0.5 block uppercase">{project.environment}</span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full text-xs font-semibold border-slate-250 hover:bg-slate-50"
                onClick={() => router.push(`/projects/${project.id}/edit`)}
              >
                Edit Setup Details
              </Button>
            </div>

            {/* Dangerous deletion area */}
            <div className="border border-red-150/70 dark:border-red-900/60 rounded-2xl p-5 bg-red-50/10 dark:bg-red-950/5 space-y-3">
              <h3 className="text-xs font-black text-red-650 dark:text-red-500 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> Danger Zone
              </h3>
              <p className="text-xs text-slate-450 leading-relaxed">
                Deleting this project deletes all associated test cases, historical test runs, and logs. This cannot be undone.
              </p>
              <Button
                variant="destructive"
                className="w-full mt-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                onClick={async () => {
                  if (confirm("Are you absolutely sure you want to delete this project?")) {
                    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" })
                    if (res.ok) router.push("/projects")
                  }
                }}
              >
                Delete Project Workspace
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- DIALOG OVERLAYS ----------------- */}

      {/* Start Testing Mode Selection Dialog */}
      {showStartTestingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setShowStartTestingModal(false)}
          />
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 z-10 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <Play className="h-5 w-5 text-indigo-650" /> Select Testing Activity
              </h3>
              <button
                onClick={() => setShowStartTestingModal(false)}
                className="text-slate-400 hover:text-slate-650 p-1 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-normal">
              Choose how you would like to run or create tests in the project <strong>{project.name}</strong>.
            </p>

            <div className="grid gap-3 pt-1">
              <Link
                href={`/projects/${project.id}/manual-sessions/new`}
                onClick={() => setShowStartTestingModal(false)}
                className="flex items-start gap-3.5 p-3.5 rounded-xl border border-slate-150 hover:bg-slate-50 hover:border-indigo-150 transition-all text-left group"
              >
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-emerald-600">
                  <Play className="h-5 w-5 fill-emerald-600" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-indigo-650 transition-colors">Start Manual Session</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal">Execute test cases, capture evidence, and log bugs manually.</p>
                </div>
              </Link>

              <Link
                href={`/projects/${project.id}/record`}
                onClick={() => setShowStartTestingModal(false)}
                className="flex items-start gap-3.5 p-3.5 rounded-xl border border-slate-150 hover:bg-slate-50 hover:border-indigo-150 transition-all text-left group"
              >
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 rounded-xl text-red-600">
                  <Video className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-indigo-650 transition-colors">Record New Test Case</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-normal">Interact with target site inside live browser and generate test cases.</p>
                </div>
              </Link>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStartTestingModal(false)}
                className="border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette Modal (Cmd + K) */}
      {commandPaletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setCommandPaletteOpen(false)}
          />
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="flex items-center gap-3 px-4 border-b border-slate-100 dark:border-slate-800">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="Search QA actions... (e.g. 'record', 'bugs', 'credentials')"
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                className="w-full py-4 bg-transparent border-0 outline-none text-slate-800 dark:text-slate-200 placeholder-slate-400 text-sm font-semibold"
              />
              <button
                onClick={() => setCommandPaletteOpen(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-650 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-2.5 space-y-1">
              {getFilteredActions().length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">No action found matching &quot;{commandSearch}&quot;</p>
              ) : (
                getFilteredActions().map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCommandPaletteOpen(false)
                      action.onClick()
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-indigo-50/50 dark:hover:bg-slate-800/80 hover:text-indigo-650 dark:hover:text-indigo-400 text-left text-slate-705 dark:text-slate-300 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg group-hover:bg-indigo-50 dark:group-hover:bg-slate-900 text-slate-400 group-hover:text-indigo-600 transition-colors">
                        <action.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-bold text-xs text-slate-800 dark:text-slate-250 group-hover:text-indigo-650 transition-colors">{action.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{action.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-indigo-600" />
                  </button>
                ))
              )}
            </div>

            <div className="bg-slate-50 dark:bg-slate-850 px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[10px] text-slate-400 font-semibold">
              <span>Use <kbd className="font-sans font-bold bg-white dark:bg-slate-800 px-1 border rounded shadow-sm">↑</kbd> <kbd className="font-sans font-bold bg-white dark:bg-slate-800 px-1 border rounded shadow-sm">↓</kbd> to navigate</span>
              <span>Press <kbd className="font-sans font-bold bg-white dark:bg-slate-800 px-1 border rounded shadow-sm">esc</kbd> to close</span>
            </div>
          </div>
        </div>
      )}

      {/* Role Selection Modal */}
      {showRoleModal && project && (
        <RoleSelectModal
          credentials={project.credentials}
          onSelect={(credId) => selectedTestCase && executeTestRun(selectedTestCase, credId)}
          onCancel={() => { setShowRoleModal(false); setSelectedTestCase(null) }}
        />
      )}

      {/* Import Modal */}
      {isImportModalOpen && project && (
        <ImportModal
          projectId={project.id}
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportSuccess={fetchTestCases}
        />
      )}
    </div>
  )
}
