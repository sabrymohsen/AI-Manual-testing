"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Sparkles,
  Plus,
  Play,
  FileText,
  Compass,
  Key,
  Bug,
  TrendingUp,
  BarChart2,
  Activity,
  Layers,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  X,
  ChevronDown,
  HelpCircle,
  ArrowRight,
  Shield,
  User,
  LayoutGrid,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Folder,
  Eye,
  Info
} from "lucide-react"

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts"

type DashboardMode = "qa_engineer" | "qa_lead" | "project_owner"

interface DashboardSummary {
  projects: number
  testCases: number
  testRuns: number
  passRate: number
  passed: number
  failed: number
  warnings: number
  openBugs: number
  requirementsCoverage: number
}

interface ActionRequired {
  failedTests: number
  criticalBugs: number
  uncoveredRequirements: number
  neverRunTestCases: number
  blockedTests: number
  unassignedTestCases: number
}

interface FailedTest {
  id: string
  testCaseId: string | null
  testCaseTitle: string
  project: string
  module: string
  featureId: string | null
  componentId: string | null
  failedAt: string
  failureReason: string
  bugId: string | null
  bugKey: string | null
}

interface OpenBug {
  id: string
  bugKey: string | null
  title: string
  project: string
  severity: string
  priority: string
  status: string
  linkedTestCase: string | null
  createdAt: string
}

interface ProjectHealthItem {
  id: string
  name: string
  environment: string
  testCases: number
  testRuns: number
  passRate: number
  openBugs: number
  coverage: number
  failedTests: number
  healthScore: number
}

interface ActivityItem {
  id: string
  action: string
  details: string
  project: string
  time: string
  user: string
}

interface DashboardData {
  healthScore: number
  summary: DashboardSummary
  actionRequired: ActionRequired
  recentFailedTests: FailedTest[]
  openBugs: OpenBug[]
  coverage: {
    total: number
    covered: number
    partiallyCovered: number
    uncovered: number
    failed: number
    blocked: number
    percent: number
  }
  riskAreas: Array<{
    id: string
    name: string
    failedRuns: number
    openBugs: number
    coverage: number
    risk: string
  }>
  trends: {
    dailyRuns: Array<{
      date: string
      passed: number
      failed: number
      blocked: number
      warning: number
      total: number
    }>
    severityPie: Array<{
      name: string
      value: number
    }>
    coverageByModule: Array<{
      name: string
      testCases: number
      passRate: number
      requirements: number
    }>
  }
  recentActivity: ActivityItem[]
  projectHealth: ProjectHealthItem[]
}

export default function DashboardPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [projectsList, setProjectsList] = useState<any[]>([])
  
  // Active state data
  const [data, setData] = useState<DashboardData | null>(null)
  
  // Filter states
  const [selectedProject, setSelectedProject] = useState<string>("All")
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("All")
  const [dateRange, setDateRange] = useState<string>("30days") // 7days, 30days, month, custom
  const [customDateFrom, setCustomDateFrom] = useState<string>("")
  const [customDateTo, setCustomDateTo] = useState<string>("")
  
  // View mode
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("qa_engineer")
  
  // Modal states
  const [showHealthScoreModal, setShowHealthScoreModal] = useState(false)
  const [activeListTab, setActiveListTab] = useState<"failed" | "bugs" | "health" | "activity">("failed")

  // Prevent Next.js hydration issues
  useEffect(() => {
    setMounted(true)
  }, [])

  // Initial load
  useEffect(() => {
    fetchProjects()
    fetchSummaryData()
  }, [selectedProject, selectedEnvironment, dateRange, customDateFrom, customDateTo])

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects")
      const d = await res.json()
      const proj = d.items || d.projects
      if (proj) {
        setProjectsList(proj)
      }
    } catch (err) {
      console.error("Error fetching projects", err)
    }
  }

  async function fetchSummaryData() {
    setLoading(true)
    try {
      let url = `/api/dashboard/summary?projectId=${selectedProject}&environment=${selectedEnvironment}`
      
      if (dateRange === "7days") {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        url += `&dateFrom=${d.toISOString()}`
      } else if (dateRange === "30days") {
        const d = new Date()
        d.setDate(d.getDate() - 30)
        url += `&dateFrom=${d.toISOString()}`
      } else if (dateRange === "month") {
        const d = new Date()
        d.setDate(1) // Start of month
        url += `&dateFrom=${d.toISOString()}`
      } else if (dateRange === "custom" && customDateFrom) {
        url += `&dateFrom=${new Date(customDateFrom).toISOString()}`
        if (customDateTo) {
          url += `&dateTo=${new Date(customDateTo).toISOString()}`
        }
      }

      const res = await fetch(url)
      const summaryData = await res.json()
      setData(summaryData)
    } catch (err) {
      console.error("Error loading dashboard summary data", err)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    fetchSummaryData()
  }

  // Next Best Action Calculator based on current project statistics
  const getNextBestAction = () => {
    if (!data) return null

    if (data.summary.projects === 0) {
      return {
        title: "Create your first project",
        description: "Welcome! To begin, register a project and configure its target URL.",
        cta: "Create Project",
        link: "/projects/new",
        icon: Folder
      }
    }

    if (data.summary.testCases === 0) {
      return {
        title: "Create or import test cases",
        description: "Your active workspace has no test cases. Write manually, import an Excel sheet, or use the recorder.",
        cta: "Create Test Case",
        link: "/projects", // Will redirect inside project detail
        icon: FileText
      }
    }

    if (data.actionRequired.criticalBugs > 0) {
      return {
        title: "Resolve Critical Bugs",
        description: `There are ${data.actionRequired.criticalBugs} unresolved critical bugs. Fix these to restore environment stability.`,
        cta: "Resolve Critical Bugs",
        link: "/bug-reports?severity=Critical",
        icon: Bug
      }
    }

    if (data.actionRequired.failedTests > 0) {
      return {
        title: "Review Failed Tests",
        description: `${data.actionRequired.failedTests} recent executions failed. Verify failure logs and log bugs if required.`,
        cta: "Review Failed Tests",
        link: "/test-cases", // Will go to test case hub last runs
        icon: AlertTriangle
      }
    }

    if (data.actionRequired.uncoveredRequirements > 0) {
      return {
        title: "Link Uncovered Requirements",
        description: `${data.actionRequired.uncoveredRequirements} requirements do not have any test cases mapped to them.`,
        cta: "View Coverage Matrix",
        link: "/test-cases",
        icon: ShieldCheck
      }
    }

    if (data.actionRequired.neverRunTestCases > 0) {
      return {
        title: "Execute Untested Cases",
        description: `${data.actionRequired.neverRunTestCases} test cases have never been executed. Schedule a manual session or automation run.`,
        cta: "Run Test Cases",
        link: "/test-cases?lastRunStatus=NotExecuted",
        icon: Play
      }
    }

    return {
      title: "Excellent Status!",
      description: "All recent test runs passed, critical bugs are resolved, and requirement coverage is solid.",
      cta: "Record New Scenarios",
      link: "/projects",
      icon: Sparkles
    }
  }

  const nextAction = getNextBestAction()

  // Health Score status colors
  const getHealthStatus = (score: number) => {
    if (score >= 90) return { label: "Excellent", color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" }
    if (score >= 75) return { label: "Good", color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200" }
    if (score >= 50) return { label: "Needs Attention", color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20 border-amber-200" }
    return { label: "High Risk", color: "text-rose-500 bg-rose-50 dark:bg-rose-950/20 border-rose-200" }
  }

  if (!mounted) return null

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header Filters Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-indigo-650" /> QA Command Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">Real-time indicators, health reports, risk tracking, and next best QA activities.</p>
        </div>

        {/* Dynamic Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Project select */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Project</span>
            <div className="relative">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-xs font-semibold rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
              >
                <option value="All">All Projects</option>
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Environment select */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Env</span>
            <div className="relative">
              <select
                value={selectedEnvironment}
                onChange={(e) => setSelectedEnvironment(e.target.value)}
                className="appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-xs font-semibold rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
              >
                <option value="All">All Environments</option>
                <option value="Dev">Dev</option>
                <option value="Staging">Staging</option>
                <option value="UAT">UAT</option>
                <option value="Production">Production</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Date range select */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Range</span>
            <div className="relative">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-xs font-semibold rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="month">This Month</option>
                <option value="custom">Custom Range</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Custom Date Pickers */}
          {dateRange === "custom" && (
            <div className="flex items-center gap-2 animate-in fade-in duration-200">
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-200"
              />
              <span className="text-xs text-slate-450">-</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-200"
              />
            </div>
          )}

          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* 2. User Mode & Next Best Action Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        {/* User Role toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200/40 dark:border-slate-800/40">
          <button
            onClick={() => setDashboardMode("qa_engineer")}
            className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
              dashboardMode === "qa_engineer"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-550 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <User className="h-3.5 w-3.5" /> QA Engineer
          </button>
          <button
            onClick={() => setDashboardMode("qa_lead")}
            className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
              dashboardMode === "qa_lead"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-550 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Shield className="h-3.5 w-3.5" /> QA Lead / Manager
          </button>
          <button
            onClick={() => setDashboardMode("project_owner")}
            className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
              dashboardMode === "project_owner"
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-550 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" /> Project Owner
          </button>
        </div>

        {/* Quick actions triggers */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => router.push("/projects")}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1"
          >
            <Play className="h-3 w-3 fill-current" /> Start Session
          </Button>
          <Button
            onClick={() => router.push("/test-cases")}
            size="sm"
            variant="outline"
            className="border-slate-250 font-bold text-xs text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" /> Create Case
          </Button>
          <Button
            onClick={() => router.push("/bug-reports")}
            size="sm"
            variant="outline"
            className="border-slate-250 font-bold text-xs text-slate-700 hover:bg-slate-50"
          >
            <Bug className="h-3.5 w-3.5" /> Create Bug
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <RefreshCw className="h-10 w-10 text-indigo-650 animate-spin" />
          <p className="text-sm text-slate-400 font-semibold">Generating QA statistics dashboard...</p>
        </div>
      ) : data?.summary.projects === 0 ? (
        /* Onboarding / Empty Dashboard State */
        <div className="flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-2xl max-w-2xl mx-auto space-y-6">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-full">
            <LayoutGrid className="h-12 w-12 text-indigo-650" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">Welcome to QA Tester Workspace</h2>
            <p className="text-sm text-slate-450 leading-normal max-w-md">
              Start by creating your first project, then add credentials, write or record test cases, and start a manual recording session.
            </p>
          </div>

          <div className="border border-slate-100 dark:border-slate-800 rounded-xl w-full p-5 space-y-3.5 text-left text-xs bg-slate-50/50">
            <h4 className="font-bold text-slate-500 uppercase tracking-wider">Recommended Setup Steps:</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center">1</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">Create a Project</span>
                <span className="text-slate-400">— Configure target web application URL.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-650 dark:text-slate-350 font-bold flex items-center justify-center">2</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">Add Project Credentials</span>
                <span className="text-slate-400">— Set up vault roles for automated login.</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-650 dark:text-slate-350 font-bold flex items-center justify-center">3</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">Write/Record Test Cases</span>
                <span className="text-slate-400">— Import or use floating recorder toolbar.</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full">
            <Button
              onClick={() => router.push("/projects/new")}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm"
            >
              Create Project
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/projects")}
              className="flex-1 border-slate-250 text-slate-700 font-bold text-sm"
            >
              Start Guide
            </Button>
          </div>
        </div>
      ) : (
        /* Loaded Dashboard Content */
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          
          {/* Left Column: Health score and Role-based layout */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Health Score Panel */}
            <div
              onClick={() => setShowHealthScoreModal(true)}
              className="relative overflow-hidden bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 border border-slate-850 hover:shadow-xl transition-all duration-300 cursor-pointer group"
            >
              <div className="absolute right-0 top-0 h-40 w-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform" />
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-900/50">Project Quality score</span>
                  <h2 className="text-2xl font-black mt-2">QA Health Score: {data?.healthScore}/100</h2>
                  <p className="text-xs text-slate-350 leading-relaxed max-w-sm mt-1">
                    Calculated from overall pass rates, uncovered requirements, never-run test cases, blocked test runs, and open bugs.
                  </p>
                </div>
                <div className={`text-xs font-black px-3.5 py-1 rounded-full border ${data ? getHealthStatus(data.healthScore).color : ""}`}>
                  {data ? getHealthStatus(data.healthScore).label : ""}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold mt-4">
                <Info className="h-4.5 w-4.5" /> Explain this score
              </div>
            </div>

            {/* Smart next best action recommendation */}
            {nextAction && (
              <div className="border border-indigo-100 dark:border-indigo-950/40 rounded-2xl p-5 bg-gradient-to-r from-indigo-50/20 to-violet-50/20 dark:from-indigo-950/5 dark:to-violet-950/5 flex items-start gap-4 shadow-sm border-l-4 border-l-indigo-600">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-650 dark:text-indigo-400">
                  <nextAction.icon className="h-5 w-5" />
                </div>
                <div className="space-y-1 flex-1">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Next Recommended Action</h4>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">{nextAction.title}</h3>
                  <p className="text-xs text-slate-450 leading-normal">{nextAction.description}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => router.push(nextAction.link)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  {nextAction.cta}
                </Button>
              </div>
            )}

            {/* Action Required Dashboard Panel */}
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-slate-50 flex items-center gap-1.5">
                  <AlertCircle className="h-5 w-5 text-rose-500" /> Action Required
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">High priority items needing immediate QA review and corrections.</p>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3">
                {/* 1. Failed tests */}
                <div className="border border-slate-150 dark:border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-4 bg-slate-50/30">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Failed Test Runs</span>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-slate-150 mt-1">{data?.actionRequired.failedTests}</h2>
                    <p className="text-[11px] text-slate-450 mt-1">Failed test case runs needing log review and triage.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/test-cases")}
                    className="w-full text-xs font-bold border-slate-250 hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-200"
                  >
                    Review Failed Tests
                  </Button>
                </div>

                {/* 2. Critical bugs */}
                <div className="border border-slate-150 dark:border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-4 bg-slate-50/30">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Critical Bugs Open</span>
                    <h2 className="text-2xl font-black text-rose-600 mt-1">{data?.actionRequired.criticalBugs}</h2>
                    <p className="text-[11px] text-slate-455 mt-1">Unresolved critical bug reports blocking environment releases.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/bug-reports?severity=Critical")}
                    className="w-full text-xs font-bold border-slate-250 hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-200"
                  >
                    Open Critical Bugs
                  </Button>
                </div>

                {/* 3. Uncovered Requirements */}
                <div className="border border-slate-150 dark:border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-4 bg-slate-50/30">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Uncovered Requirements</span>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-slate-150 mt-1">{data?.actionRequired.uncoveredRequirements}</h2>
                    <p className="text-[11px] text-slate-450 mt-1">Requirements with no linked test case verification scenarios.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/test-cases")}
                    className="w-full text-xs font-bold border-slate-250 hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-200"
                  >
                    View Coverage Matrix
                  </Button>
                </div>

                {/* 4. Never executed */}
                <div className="border border-slate-150 dark:border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-4 bg-slate-50/30">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Never-run Cases</span>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-slate-150 mt-1">{data?.actionRequired.neverRunTestCases}</h2>
                    <p className="text-[11px] text-slate-450 mt-1">Draft or imported test cases that have never been executed.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/test-cases?lastRunStatus=NotExecuted")}
                    className="w-full text-xs font-bold border-slate-250 hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-200"
                  >
                    Rerun Untested Cases
                  </Button>
                </div>

                {/* 5. Blocked test cases */}
                <div className="border border-slate-150 dark:border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-4 bg-slate-50/30">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Blocked Runs</span>
                    <h2 className="text-2xl font-black text-amber-600 mt-1">{data?.actionRequired.blockedTests}</h2>
                    <p className="text-[11px] text-slate-450 mt-1">Active test runs marked as blocked by missing setup or outages.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/test-cases")}
                    className="w-full text-xs font-bold border-slate-250 hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-200"
                  >
                    View Blocked Tests
                  </Button>
                </div>

                {/* 6. Unassigned test cases */}
                <div className="border border-slate-150 dark:border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-4 bg-slate-50/30">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Unassigned Cases</span>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-slate-150 mt-1">{data?.actionRequired.unassignedTestCases}</h2>
                    <p className="text-[11px] text-slate-450 mt-1">Test cases not grouped into any project module folders.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/test-cases")}
                    className="w-full text-xs font-bold border-slate-250 hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-200"
                  >
                    Assign Modules
                  </Button>
                </div>
              </div>
            </div>

            {/* Premium Recharts Charts for trends and severities */}
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-6">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-slate-50 flex items-center gap-1.5">
                  <BarChart2 className="h-5 w-5 text-indigo-650" /> Charts & Quality Insights
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Execution history, bug severity distributions, and coverage percentages.</p>
              </div>

              <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
                {/* Daily runs bar chart */}
                <div className="space-y-2 border border-slate-100 dark:border-slate-850 p-4 rounded-xl bg-slate-50/10">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Daily Run Volume</h4>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.trends.dailyRuns || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickLine={false} style={{ fontSize: 10 }} />
                        <YAxis tickLine={false} style={{ fontSize: 10 }} />
                        <RechartsTooltip />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="passed" stackId="a" fill="#10b981" name="Passed" />
                        <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
                        <Bar dataKey="blocked" stackId="a" fill="#f59e0b" name="Blocked" />
                        <Bar dataKey="warning" stackId="a" fill="#eab308" name="Warning" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Bug severities donut chart */}
                <div className="space-y-2 border border-slate-100 dark:border-slate-850 p-4 rounded-xl bg-slate-50/10 flex flex-col justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bugs by Severity</h4>
                  <div className="h-48 flex justify-center items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data?.trends.severityPie || []}
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          <Cell fill="#ef4444" />
                          <Cell fill="#f97316" />
                          <Cell fill="#3b82f6" />
                          <Cell fill="#94a3b8" />
                        </Pie>
                        <RechartsTooltip />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-[10px] text-center text-slate-400 font-semibold border-t dark:border-slate-800 pt-2">
                    Active Bug Count: {data?.summary.openBugs || 0}
                  </div>
                </div>
              </div>

              {/* Module requirement coverage Horizontal Bar Chart */}
              {data && data.trends.coverageByModule.length > 0 && (
                <div className="space-y-2 border border-slate-100 dark:border-slate-850 p-4 rounded-xl bg-slate-50/10">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Module Coverage Details</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.trends.coverageByModule} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickLine={false} style={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tickLine={false} style={{ fontSize: 10 }} width={80} />
                        <RechartsTooltip />
                        <Bar dataKey="passRate" fill="#3b82f6" name="Pass Rate %" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="requirements" fill="#10b981" name="Requirements" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Detailed Lists Tab Panel */}
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b dark:border-slate-800 pb-3 gap-3">
                <h3 className="font-black text-base text-slate-900 dark:text-slate-50">Detailed Reports & Feeds</h3>
                
                {/* Tabs selectors */}
                <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-bold">
                  <button
                    onClick={() => setActiveListTab("failed")}
                    className={`px-3 py-1 rounded transition-colors ${
                      activeListTab === "failed" ? "bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 shadow-sm" : "text-slate-450 hover:text-slate-700"
                    }`}
                  >
                    Failed Tests
                  </button>
                  <button
                    onClick={() => setActiveListTab("bugs")}
                    className={`px-3 py-1 rounded transition-colors ${
                      activeListTab === "bugs" ? "bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 shadow-sm" : "text-slate-450 hover:text-slate-700"
                    }`}
                  >
                    Open Bugs
                  </button>
                  <button
                    onClick={() => setActiveListTab("health")}
                    className={`px-3 py-1 rounded transition-colors ${
                      activeListTab === "health" ? "bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 shadow-sm" : "text-slate-450 hover:text-slate-700"
                    }`}
                  >
                    Project Health
                  </button>
                  <button
                    onClick={() => setActiveListTab("activity")}
                    className={`px-3 py-1 rounded transition-colors ${
                      activeListTab === "activity" ? "bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 shadow-sm" : "text-slate-450 hover:text-slate-700"
                    }`}
                  >
                    Feed
                  </button>
                </div>
              </div>

              {/* Tab: Failed Tests Table */}
              {activeListTab === "failed" && (
                <div className="overflow-x-auto min-h-[200px]">
                  {data?.recentFailedTests.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8 font-semibold">No recent failed test runs detected.</p>
                  ) : (
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead>
                        <tr className="border-b dark:border-slate-850 text-slate-400 uppercase tracking-wider text-[9px] font-bold">
                          <th className="py-2.5">Test Case</th>
                          <th className="py-2.5">Project</th>
                          <th className="py-2.5">Module</th>
                          <th className="py-2.5">Failure Reason</th>
                          <th className="py-2.5">Bug Reference</th>
                          <th className="py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.recentFailedTests.map((test) => (
                          <tr key={test.id} className="border-b dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-850/30">
                            <td className="py-3 font-bold text-slate-800 dark:text-slate-200">{test.testCaseTitle}</td>
                            <td className="py-3">{test.project}</td>
                            <td className="py-3">
                              <span className="bg-slate-105 dark:bg-slate-800 text-[10px] px-2 py-0.5 rounded font-medium">{test.module}</span>
                            </td>
                            <td className="py-3 max-w-[200px] truncate text-slate-400 font-mono" title={test.failureReason}>{test.failureReason}</td>
                            <td className="py-3">
                              {test.bugId ? (
                                <Link href={`/bug-reports`} className="text-indigo-650 hover:underline flex items-center gap-1 font-bold">
                                  🐛 {test.bugKey}
                                </Link>
                              ) : (
                                <span className="text-slate-400 text-[10px]">No linked bug</span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => router.push("/test-cases")}
                                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                                >
                                  Open
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Tab: Open Bugs List */}
              {activeListTab === "bugs" && (
                <div className="overflow-x-auto min-h-[200px]">
                  {data?.openBugs.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8 font-semibold">No open bug reports found matching filters.</p>
                  ) : (
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead>
                        <tr className="border-b dark:border-slate-850 text-slate-400 uppercase tracking-wider text-[9px] font-bold">
                          <th className="py-2.5">Key</th>
                          <th className="py-2.5">Title</th>
                          <th className="py-2.5">Project</th>
                          <th className="py-2.5">Severity</th>
                          <th className="py-2.5">Priority</th>
                          <th className="py-2.5">Status</th>
                          <th className="py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.openBugs.map((bug) => (
                          <tr key={bug.id} className="border-b dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-850/30">
                            <td className="py-3 font-bold text-indigo-650">
                              <Link href="/bug-reports">{bug.bugKey}</Link>
                            </td>
                            <td className="py-3 max-w-[200px] truncate font-bold text-slate-850 dark:text-slate-100">{bug.title}</td>
                            <td className="py-3">{bug.project}</td>
                            <td className="py-3">
                              <span className={`text-[10px] px-2.5 py-0.5 rounded font-black border ${
                                bug.severity === "Critical" ? "bg-rose-50 text-rose-700 border-rose-200" :
                                bug.severity === "High" ? "bg-orange-50 text-orange-700 border-orange-200" :
                                "bg-blue-50 text-blue-700 border-blue-200"
                              }`}>
                                {bug.severity}
                              </span>
                            </td>
                            <td className="py-3">{bug.priority}</td>
                            <td className="py-3 font-semibold text-slate-400">{bug.status}</td>
                            <td className="py-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => router.push("/bug-reports")}
                                className="text-xs font-bold text-indigo-600 hover:underline"
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Tab: Project Health Table */}
              {activeListTab === "health" && (
                <div className="overflow-x-auto min-h-[200px]">
                  <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                    <thead>
                      <tr className="border-b dark:border-slate-850 text-slate-400 uppercase tracking-wider text-[9px] font-bold">
                        <th className="py-2.5">Project</th>
                        <th className="py-2.5">Environment</th>
                        <th className="py-2.5">Test Cases</th>
                        <th className="py-2.5">Pass Rate</th>
                        <th className="py-2.5">Open Bugs</th>
                        <th className="py-2.5">Coverage</th>
                        <th className="py-2.5">Health Score</th>
                        <th className="py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.projectHealth.map((proj) => (
                        <tr key={proj.id} className="border-b dark:border-slate-850 hover:bg-slate-50/50 dark:hover:bg-slate-850/30">
                          <td className="py-3 font-bold text-slate-800 dark:text-slate-200">{proj.name}</td>
                          <td className="py-3 font-semibold text-slate-500">{proj.environment}</td>
                          <td className="py-3 font-semibold">{proj.testCases} cases</td>
                          <td className="py-3">
                            <span className={`font-bold ${proj.passRate >= 85 ? "text-emerald-500" : "text-amber-500"}`}>{proj.passRate}%</span>
                          </td>
                          <td className="py-3 font-bold text-rose-500">{proj.openBugs}</td>
                          <td className="py-3 font-semibold">{proj.coverage}%</td>
                          <td className="py-3">
                            <span className={`text-[10px] px-2.5 py-0.5 rounded font-black border ${
                              proj.healthScore >= 90 ? "bg-emerald-50 text-emerald-700 border-emerald-250" :
                              proj.healthScore >= 75 ? "bg-indigo-50 text-indigo-700 border-indigo-250" :
                              proj.healthScore >= 50 ? "bg-amber-50 text-amber-700 border-amber-250" :
                              "bg-rose-50 text-rose-700 border-rose-250"
                            }`}>
                              {proj.healthScore} / 100
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => router.push(`/projects/${proj.id}`)}
                              className="text-xs font-bold text-indigo-650 hover:underline"
                            >
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab: Activity Feed */}
              {activeListTab === "activity" && (
                <div className="space-y-4 min-h-[200px] pt-2">
                  {data?.recentActivity.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8 font-semibold">No recent activity detected.</p>
                  ) : (
                    <div className="space-y-4 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
                      {data?.recentActivity.map((act) => (
                        <div key={act.id} className="flex gap-4 relative">
                          <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-900 flex items-center justify-center text-slate-500 z-10">
                            <Activity className="h-3.5 w-3.5" />
                          </div>
                          <div className="space-y-0.5 flex-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-800 dark:text-slate-200">{act.action.replace(/_/g, " ")}</span>
                              <span className="text-[10px] text-slate-400 font-semibold">{new Date(act.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="text-xs text-slate-505 leading-normal">{act.details}</p>
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{act.project}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Summaries & Metric cards */}
          <div className="space-y-6">
            
            {/* Quick Metrics grid */}
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-slate-50">Quick Summary</h3>
                <p className="text-xs text-slate-400">Overview of key testing components and progress rate.</p>
              </div>

              <div className="grid gap-3 grid-cols-2">
                <div
                  onClick={() => router.push("/projects")}
                  className="p-3 border dark:border-slate-800 rounded-xl space-y-1 bg-slate-50/20 hover:border-indigo-150 transition-all cursor-pointer"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Projects</span>
                  <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">{data?.summary.projects}</h2>
                </div>
                <div
                  onClick={() => router.push("/test-cases")}
                  className="p-3 border dark:border-slate-800 rounded-xl space-y-1 bg-slate-50/20 hover:border-indigo-150 transition-all cursor-pointer"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Test Cases</span>
                  <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">{data?.summary.testCases}</h2>
                </div>
                <div
                  onClick={() => router.push("/test-cases")} // Redirect to runs list
                  className="p-3 border dark:border-slate-800 rounded-xl space-y-1 bg-slate-50/20 hover:border-indigo-150 transition-all cursor-pointer"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Test Runs</span>
                  <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">{data?.summary.testRuns}</h2>
                </div>
                <div
                  onClick={() => router.push("/test-cases")} // Redirect to passed cases
                  className="p-3 border dark:border-slate-800 rounded-xl space-y-1 bg-slate-50/20 hover:border-indigo-150 transition-all cursor-pointer"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pass Rate</span>
                  <h2 className="text-xl font-black text-emerald-500">{data?.summary.passRate}%</h2>
                </div>
                <div
                  onClick={() => router.push("/bug-reports")}
                  className="p-3 border dark:border-slate-800 rounded-xl space-y-1 bg-slate-50/20 hover:border-indigo-150 transition-all cursor-pointer"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open Bugs</span>
                  <h2 className="text-xl font-black text-rose-600">{data?.summary.openBugs}</h2>
                </div>
                <div
                  onClick={() => router.push("/test-cases")} // Link to requirement matrix
                  className="p-3 border dark:border-slate-800 rounded-xl space-y-1 bg-slate-50/20 hover:border-indigo-150 transition-all cursor-pointer"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-semibold">Coverage</span>
                  <h2 className="text-xl font-black text-indigo-650">{data?.summary.requirementsCoverage}%</h2>
                </div>
              </div>
            </div>

            {/* Requirement Coverage Summary panel */}
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-slate-50 flex items-center gap-1.5">
                  <ShieldCheck className="h-5 w-5 text-indigo-650" /> Requirement Coverage
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Verification status of mapped system requirements.</p>
              </div>

              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-605">Progress coverage</span>
                  <span className="text-slate-850 dark:text-slate-100">{data?.coverage.percent}%</span>
                </div>
                
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${data?.coverage.percent}%` }}
                  />
                </div>

                <div className="grid gap-2 grid-cols-2 text-xs pt-1.5">
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded-lg flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Total</span>
                    <span className="font-black text-slate-800 dark:text-slate-150 text-sm mt-0.5">{data?.coverage.total}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded-lg flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Covered</span>
                    <span className="font-black text-emerald-500 text-sm mt-0.5">{data?.coverage.covered}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded-lg flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Uncovered</span>
                    <span className="font-black text-rose-500 text-sm mt-0.5">{data?.coverage.uncovered}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded-lg flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Failed</span>
                    <span className="font-black text-amber-500 text-sm mt-0.5">{data?.coverage.failed}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk overview */}
            <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 bg-white dark:bg-slate-900 space-y-4">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-slate-50 flex items-center gap-1.5">
                  <AlertTriangle className="h-5 w-5 text-amber-500" /> Hot-Spot Risk Areas
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Modules with high failure rates or multiple unresolved bug reports.</p>
              </div>

              <div className="space-y-3">
                {data?.riskAreas.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6 font-semibold">No high risk modules detected.</p>
                ) : (
                  data?.riskAreas.map((area) => (
                    <div key={area.id} className="p-3 border dark:border-slate-800 rounded-xl space-y-2 hover:border-indigo-150 transition-colors">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-black text-slate-800 dark:text-slate-200">{area.name}</span>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded font-black border ${
                          area.risk === "Critical" ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse" :
                          area.risk === "High" ? "bg-orange-50 text-orange-700 border-orange-200" :
                          "bg-amber-50 text-amber-700 border-amber-200"
                        }`}>
                          {area.risk} Risk
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-slate-450">
                        <span>Failed Runs: <strong>{area.failedRuns}</strong></span>
                        <span>Open Bugs: <strong className="text-rose-500">{area.openBugs}</strong></span>
                        <span>Coverage: <strong>{area.coverage}%</strong></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* 4. Explain Health Score Modal */}
      {showHealthScoreModal && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setShowHealthScoreModal(false)} />
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 z-10 animate-in zoom-in-95 duration-200 space-y-5">
            <div className="flex justify-between items-center border-b dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-650" /> Score Breakdown: {data.healthScore}/100
              </h3>
              <button
                onClick={() => setShowHealthScoreModal(false)}
                className="text-slate-450 hover:text-slate-700 p-1 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-lg transition-colors"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-slate-500 leading-relaxed">
                The Health Score evaluates the quality and completeness of project test coverage. It starts at a base score of <strong>100</strong> and applies the following deductions:
              </p>

              <div className="space-y-2">
                <div className="flex justify-between items-center py-2.5 border-b dark:border-slate-850">
                  <span className="text-slate-600 dark:text-slate-350">Failed Test Runs (1.5 pts/run, max 25)</span>
                  <span className="font-bold text-rose-500">-{Math.min(25, data.actionRequired.failedTests * 1.5)} points</span>
                </div>
                <div className="flex justify-between items-center py-2.5 border-b dark:border-slate-850">
                  <span className="text-slate-600 dark:text-slate-350">Critical Bugs (5 pts/bug, max 25)</span>
                  <span className="font-bold text-rose-500">-{Math.min(25, data.actionRequired.criticalBugs * 5)} points</span>
                </div>
                <div className="flex justify-between items-center py-2.5 border-b dark:border-slate-850">
                  <span className="text-slate-600 dark:text-slate-350">Uncovered Requirements (3 pts/req, max 20)</span>
                  <span className="font-bold text-rose-500">-{Math.min(20, data.actionRequired.uncoveredRequirements * 3)} points</span>
                </div>
                <div className="flex justify-between items-center py-2.5 border-b dark:border-slate-850">
                  <span className="text-slate-600 dark:text-slate-350">Blocked Test Runs (2 pts/run, max 15)</span>
                  <span className="font-bold text-rose-500">-{Math.min(15, data.actionRequired.blockedTests * 2)} points</span>
                </div>
                <div className="flex justify-between items-center py-2.5 border-b dark:border-slate-850">
                  <span className="text-slate-600 dark:text-slate-350">Never-run Test Cases (2 pts/case, max 15)</span>
                  <span className="font-bold text-rose-500">-{Math.min(15, data.actionRequired.neverRunTestCases * 2)} points</span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3.5 bg-slate-50 dark:bg-slate-850 rounded-xl border dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-100">Status Recommendation:</span>
                <span className={`font-black ${getHealthStatus(data.healthScore).color.split(" ")[0]}`}>
                  {getHealthStatus(data.healthScore).label}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={() => setShowHealthScoreModal(false)}
                className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
