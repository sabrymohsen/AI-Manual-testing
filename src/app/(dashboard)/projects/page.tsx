"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Folder,
  Layers,
  Bug,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Search,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  LayoutGrid,
  List,
  MoreVertical,
  Edit2,
  Copy,
  Archive,
  Trash2,
  ArrowRight,
  Play,
  CheckCircle2,
  Calendar,
  Settings,
  AlertCircle,
  X,
  FileSpreadsheet,
  BarChart2,
  HelpCircle,
  ArchiveRestore,
  RefreshCw
} from "lucide-react"

interface ProjectMetrics {
  testCases: number
  testRuns: number
  passRate: number
  failedTests: number
  openBugs: number
  requirementsCoverage: number
  healthScore: number
  healthStatus: string
  setupCompleted: number
  setupTotal: number
}

interface ProjectActivity {
  lastTestRunAt: string | null
  lastBugAt: string | null
  lastUpdatedAt: string
}

interface Project {
  id: string
  name: string
  webAppUrl: string
  environment: string
  testType: string
  browserType: string
  status: string
  metrics: ProjectMetrics
  lastActivity: ProjectActivity
}

interface ProjectsSummary {
  totalProjects: number
  activeProjects: number
  projectsWithFailures: number
  projectsWithOpenBugs: number
  averagePassRate: number
  averageCoverage: number
}

export default function ProjectsPage() {
  const router = useRouter()
  
  // List views & loadings
  const [items, setItems] = useState<Project[]>([])
  const [summary, setSummary] = useState<ProjectsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [viewLayout, setViewLayout] = useState<"card" | "table">("card")

  // Filter values
  const [search, setSearch] = useState("")
  const [environment, setEnvironment] = useState("All")
  const [testType, setTestType] = useState("All")
  const [browserType, setBrowserType] = useState("All")
  const [healthStatus, setHealthStatus] = useState("All")
  const [hasFailedTests, setHasFailedTests] = useState(false)
  const [hasOpenBugs, setHasOpenBugs] = useState(false)
  const [hasUncoveredRequirements, setHasUncoveredRequirements] = useState(false)
  const [setupStatus, setSetupStatus] = useState("All") // All, complete, incomplete
  const [archiveStatus, setArchiveStatus] = useState("Active") // Active, Archived, All
  
  // Sorting & pagination
  const [sortBy, setSortBy] = useState("RecentlyUpdated")
  const [sortDirection, setSortDirection] = useState("desc")
  const [page, setPage] = useState(1)
  const [pageSize] = useState(100)

  // Dropdowns & Modals
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  
  // Duplicate modal states
  const [duplicateProject, setDuplicateProject] = useState<Project | null>(null)
  const [cloneName, setCloneName] = useState("")
  const [cloneTestCases, setCloneTestCases] = useState(true)
  const [cloneRequirements, setCloneRequirements] = useState(true)
  const [cloneLocators, setCloneLocators] = useState(true)
  const [isDuplicating, setIsDuplicating] = useState(false)

  // Delete modal states
  const [deleteProject, setDeleteProject] = useState<Project | null>(null)
  const [deleteInputName, setDeleteInputName] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDetails, setDeleteDetails] = useState<any>(null)

  // Project creation is gated to the user's plan limit (mirrors the server
  // guard requireCanCreateProject); button hides when the limit is reached.
  const [canCreateProject, setCanCreateProject] = useState(false)
  useEffect(() => {
    fetch("/api/my-projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCanCreateProject(!!d.canCreateProject)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchProjectsList()
  }, [
    search,
    environment,
    testType,
    browserType,
    healthStatus,
    hasFailedTests,
    hasOpenBugs,
    hasUncoveredRequirements,
    setupStatus,
    archiveStatus,
    sortBy,
    sortDirection,
    page
  ])

  async function fetchProjectsList() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (environment !== "All") params.set("environment", environment)
      if (testType !== "All") params.set("testType", testType)
      if (browserType !== "All") params.set("browserType", browserType)
      if (healthStatus !== "All") params.set("healthStatus", healthStatus)
      if (hasFailedTests) params.set("hasFailedTests", "true")
      if (hasOpenBugs) params.set("hasOpenBugs", "true")
      if (hasUncoveredRequirements) params.set("hasUncoveredRequirements", "true")
      if (setupStatus !== "All") params.set("setupStatus", setupStatus)
      if (archiveStatus !== "All") params.set("status", archiveStatus)
      params.set("sortBy", sortBy)
      params.set("sortDirection", sortDirection)
      params.set("page", String(page))
      params.set("pageSize", String(pageSize))

      const res = await fetch(`/api/projects?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setSummary(data.summary || null)
        setTotalCount(data.totalCount || 0)
      }
    } catch (err) {
      console.error("Error loading projects list", err)
    } finally {
      setLoading(false)
    }
  }

  // Clear all filters
  const handleClearFilters = () => {
    setSearch("")
    setEnvironment("All")
    setTestType("All")
    setBrowserType("All")
    setHealthStatus("All")
    setHasFailedTests(false)
    setHasOpenBugs(false)
    setHasUncoveredRequirements(false)
    setSetupStatus("All")
    setArchiveStatus("Active")
    setSortBy("RecentlyUpdated")
    setSortDirection("desc")
    setPage(1)
  }

  // Handle archive/restore project
  async function handleToggleArchiveProject(project: Project, archive: boolean) {
    setOpenDropdownId(null)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: archive ? "Archived" : "Active" })
      })
      if (res.ok) {
        fetchProjectsList()
      } else {
        alert("Failed to update project status.")
      }
    } catch (err) {
      console.error("Error toggling archive project", err)
    }
  }

  // Trigger delete modal, loading detail counts first
  async function handleTriggerDeleteModal(project: Project) {
    setOpenDropdownId(null)
    setDeleteProject(project)
    setDeleteInputName("")
    
    // Fetch counts from project details endpoint
    try {
      const res = await fetch(`/api/projects/${project.id}`)
      if (res.ok) {
        const data = await res.json()
        setDeleteDetails(data.project._count)
      }
    } catch (err) {
      console.error("Failed to load project counts for delete modal", err)
    }
  }

  // Perform delete operation
  async function handleDeleteConfirm() {
    if (!deleteProject) return
    const res = await fetch(`/api/projects/${deleteProject.id}`, { method: "DELETE" })
    if (res.ok) {
      setDeleteProject(null)
      fetchProjectsList()
    } else {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "Failed to delete project")
    }
  }

  // Handle clone action
  async function handleDuplicateConfirm() {
    if (!duplicateProject) return
    if (!cloneName.trim()) {
      alert("Please specify a project name.")
      return
    }
    setIsDuplicating(true)
    try {
      const res = await fetch(`/api/projects/${duplicateProject.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloneName,
          cloneTestCases,
          cloneRequirements,
          cloneLocators
        })
      })
      if (res.ok) {
        setDuplicateProject(null)
        fetchProjectsList()
      } else {
        const errData = await res.json()
        alert(errData.error || "Failed to duplicate project.")
      }
    } catch (err) {
      console.error("Duplicate project error", err)
    } finally {
      setIsDuplicating(false)
    }
  }

  // Setup dynamic color styling for health badge
  const getHealthStyle = (status: string) => {
    switch (status) {
      case "Excellent":
        return "bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900"
      case "Good":
        return "bg-indigo-50 text-indigo-700 border-indigo-250 dark:bg-indigo-950/20 dark:text-indigo-450 dark:border-indigo-900"
      case "Needs Attention":
        return "bg-amber-50 text-amber-700 border-amber-250 dark:bg-amber-950/20 dark:text-amber-450 dark:border-amber-900"
      case "High Risk":
        return "bg-rose-50 text-rose-700 border-rose-250 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900"
      default:
        return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-350 dark:border-slate-700"
    }
  }

  // Smart next best action CTA calculator for card
  const renderNextActionCTA = (project: Project) => {
    const { setupCompleted, setupTotal, failedTests, openBugs, testCases, testRuns } = project.metrics

    if (setupCompleted <= 2) {
      return (
        <Button
          size="sm"
          onClick={() => router.push(`/projects/${project.id}/edit`)}
          className="flex-1 text-[11px] bg-slate-105 hover:bg-slate-200 text-slate-800 font-extrabold shadow-sm dark:bg-slate-800 dark:text-slate-100"
        >
          Add Credentials
        </Button>
      )
    }
    if (testCases === 0) {
      return (
        <Button
          size="sm"
          onClick={() => router.push(`/projects/${project.id}/test-cases`)}
          className="flex-1 text-[11px] bg-primary hover:bg-primary/90 text-white font-semibold shadow-md shadow-indigo-600/10"
        >
          Create Test Case
        </Button>
      )
    }
    if (testRuns === 0) {
      return (
        <Button
          size="sm"
          onClick={() => router.push(`/projects/${project.id}/manual-sessions/new`)}
          className="flex-1 text-[11px] bg-primary hover:bg-primary/90 text-white font-semibold shadow-md shadow-indigo-600/10"
        >
          Start Testing
        </Button>
      )
    }
    if (failedTests > 0) {
      return (
        <Button
          size="sm"
          onClick={() => router.push(`/projects/${project.id}/test-cases`)} // Redirect to cases list to filter failures
          className="flex-1 text-[11px] bg-rose-600 hover:bg-rose-700 text-white font-semibold"
        >
          Review Failures
        </Button>
      )
    }
    if (openBugs > 0) {
      return (
        <Button
          size="sm"
          onClick={() => router.push(`/projects/${project.id}/bug-reports`)}
          className="flex-1 text-[11px] bg-amber-600 hover:bg-amber-700 text-white font-semibold"
        >
          Review Open Bugs
        </Button>
      )
    }
    
    return (
      <Button
        size="sm"
        onClick={() => router.push(`/projects/${project.id}`)}
        className="flex-1 text-[11px] bg-slate-900 hover:bg-slate-800 text-white font-extrabold dark:bg-slate-950 dark:hover:bg-slate-900"
      >
        Open Workspace
      </Button>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground dark:text-slate-50 flex items-center gap-2">
            <Folder className="h-6 w-6 text-indigo-650" /> Projects Hub
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Manage QA configurations, testing runs, defect reports, and system requirement details.</p>
        </div>

        <div className="flex items-center gap-2.5">
          {canCreateProject && (
            <Button
              onClick={() => router.push("/projects/new")}
              className="bg-primary hover:bg-primary/90 text-white font-semibold text-xs"
            >
              <Plus className="h-4 w-4 mr-1" /> New Project
            </Button>
          )}

          {/* Quick Dashboard shortcut */}
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard")}
            className="border-border dark:border-slate-800 font-semibold text-xs text-foreground hover:bg-muted/50"
          >
            Open Dashboard
          </Button>
        </div>
      </div>

      {/* 2. Unified Summary Metric Cards Row */}
      {summary && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 bg-white dark:bg-slate-900 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground">Total Projects</span>
            <h2 className="text-xl font-semibold text-foreground dark:text-slate-100">{summary.totalProjects}</h2>
          </div>
          <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 bg-white dark:bg-slate-900 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground">Active Workspace</span>
            <h2 className="text-xl font-semibold text-foreground dark:text-slate-100 text-indigo-650">{summary.activeProjects}</h2>
          </div>
          <div
            onClick={() => setHasFailedTests(true)}
            className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 bg-white dark:bg-slate-900 space-y-1 shadow-sm hover:border-rose-200 hover:shadow-md transition-all cursor-pointer group"
          >
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-rose-500">Failed Runs</span>
            <h2 className="text-xl font-semibold text-rose-500">{summary.projectsWithFailures}</h2>
          </div>
          <div
            onClick={() => setHasOpenBugs(true)}
            className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 bg-white dark:bg-slate-900 space-y-1 shadow-sm hover:border-amber-200 hover:shadow-md transition-all cursor-pointer group"
          >
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-amber-500">Open Bugs</span>
            <h2 className="text-xl font-semibold text-amber-500">{summary.projectsWithOpenBugs}</h2>
          </div>
          <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 bg-white dark:bg-slate-900 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground">Avg Pass Rate</span>
            <h2 className="text-xl font-semibold text-emerald-500">{summary.averagePassRate}%</h2>
          </div>
          <div className="border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 bg-white dark:bg-slate-900 space-y-1 shadow-sm">
            <span className="text-[11px] font-medium text-muted-foreground">Avg Coverage</span>
            <h2 className="text-xl font-semibold text-indigo-650">{summary.averageCoverage}%</h2>
          </div>
        </div>
      )}

      {/* 3. Filters and Layout Selector */}
      <div className="flex flex-col gap-4 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-xl p-4 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-650 dark:text-slate-300">
            <SlidersHorizontal className="h-4 w-4 text-indigo-650" /> Filter Workspaces
          </div>
          
          {/* Card / Table view layout toggle */}
          <div className="flex bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg border dark:border-slate-700/60 shadow-inner">
            <button
              onClick={() => setViewLayout("card")}
              className={`p-1 rounded transition-all ${viewLayout === "card" ? "bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-450 hover:text-slate-750"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewLayout("table")}
              className={`p-1 rounded transition-all ${viewLayout === "table" ? "bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-450 hover:text-slate-750"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters Selectors */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name or URL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* Environment filter */}
          <div className="relative">
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 h-9"
            >
              <option value="All">All Environments</option>
              <option value="Dev">Dev</option>
              <option value="Staging">Staging</option>
              <option value="UAT">UAT</option>
              <option value="Production">Production</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-3 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>

          {/* Test Type filter */}
          <div className="relative">
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 h-9"
            >
              <option value="All">All Test Types</option>
              <option value="Functional">Functional</option>
              <option value="VisualDesign">VisualDesign</option>
              <option value="E2E">E2E</option>
              <option value="Regression">Regression</option>
              <option value="Smoke">Smoke</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-3 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>

          {/* Health Status filter */}
          <div className="relative">
            <select
              value={healthStatus}
              onChange={(e) => setHealthStatus(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 h-9"
            >
              <option value="All">All Health Statuses</option>
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Needs Attention">Needs Attention</option>
              <option value="High Risk">High Risk</option>
              <option value="Not Started">Not Started</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-3 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>

          {/* Setup Completeness */}
          <div className="relative">
            <select
              value={setupStatus}
              onChange={(e) => setSetupStatus(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 h-9"
            >
              <option value="All">All setup states</option>
              <option value="complete">Setup Complete</option>
              <option value="incomplete">Setup Incomplete</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-3 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>

          {/* Archive Status */}
          <div className="relative">
            <select
              value={archiveStatus}
              onChange={(e) => setArchiveStatus(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 h-9"
            >
              <option value="Active">Active projects</option>
              <option value="Archived">Archived projects</option>
              <option value="All">Active & Archived</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-3 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>

          {/* Sorting */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 h-9"
            >
              <option value="RecentlyUpdated">Recently Updated</option>
              <option value="ProjectName">Project Name</option>
              <option value="LowestPassRate">Lowest Pass Rate</option>
              <option value="HighestFailedTests">Highest Failed Tests</option>
              <option value="MostOpenBugs">Most Open Bugs</option>
              <option value="LowestCoverage">Lowest Coverage</option>
              <option value="Newest">Newest</option>
              <option value="Oldest">Oldest</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-3 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Toggles bar & Clear filter */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1.5">
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-605">
            {/* Failed runs toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasFailedTests}
                onChange={(e) => setHasFailedTests(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Has Failed Tests
            </label>
            {/* Has bugs toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasOpenBugs}
                onChange={(e) => setHasOpenBugs(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Has Open Bugs
            </label>
            {/* Uncovered requirements toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasUncoveredRequirements}
                onChange={(e) => setHasUncoveredRequirements(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Has Uncovered Requirements
            </label>
          </div>

          {/* Clear button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="text-xs font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50/50 p-0 h-auto"
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* 4. Content Main Display */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <RefreshCw className="h-10 w-10 text-indigo-650 animate-spin" />
          <p className="text-sm text-slate-450 font-semibold">Querying projects dashboard...</p>
        </div>
      ) : items.length === 0 ? (
        /* Empty results state */
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl p-6 max-w-md mx-auto space-y-3 shadow-sm">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-semibold text-foreground dark:text-slate-100">No projects match filters</h3>
          <p className="text-xs text-muted-foreground leading-normal">Try changing search keywords or clearing filter states.</p>
          <div className="pt-2">
            <Button
              size="sm"
              onClick={handleClearFilters}
              className="bg-slate-105 hover:bg-muted text-slate-805 text-xs font-semibold"
            >
              Clear Filters
            </Button>
          </div>
        </div>
      ) : viewLayout === "card" ? (
        /* Card Layout View */
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {items.map((project) => (
            <div
              key={project.id}
              className={`relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 hover:shadow-lg transition-all duration-300 flex flex-col justify-between space-y-5 shadow-sm group ${
                project.status === "Archived" ? "opacity-60" : ""
              }`}
            >
              {/* Header section info */}
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  {/* Name and health score */}
                  <div className="space-y-1 max-w-[200px]">
                    <h3 className="font-semibold text-base text-foreground dark:text-slate-50 group-hover:text-indigo-650 transition-colors truncate" title={project.name}>
                      <Link href={`/projects/${project.id}`}>{project.name}</Link>
                    </h3>
                    <a
                      href={project.webAppUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-indigo-650 hover:underline truncate block max-w-[190px]"
                    >
                      {project.webAppUrl}
                    </a>
                  </div>
                  
                  {/* Health score badge */}
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border ${getHealthStyle(project.metrics.healthStatus)}`}>
                    {project.metrics.healthStatus}
                  </span>
                </div>

                {/* Env / Browser type Badges */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-350 px-2 py-0.5 rounded">
                    {project.environment}
                  </span>
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-350 px-2 py-0.5 rounded">
                    {project.testType}
                  </span>
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-350 px-2 py-0.5 rounded">
                    {project.browserType}
                  </span>
                  {project.status === "Archived" && (
                    <span className="bg-amber-100 dark:bg-amber-950/20 text-amber-700 dark:text-amber-450 px-2 py-0.5 rounded border border-amber-200/50">
                      Archived
                    </span>
                  )}
                </div>
              </div>

              {/* Core metrics overview counts grid */}
              <div className="grid gap-2 grid-cols-5 text-center bg-muted/50 dark:bg-slate-850/20 p-2.5 rounded-xl border border-border dark:border-slate-850">
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-muted-foreground">Cases</span>
                  <span className="font-semibold text-foreground dark:text-slate-100 text-xs mt-0.5">{project.metrics.testCases}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-muted-foreground">Runs</span>
                  <span className="font-semibold text-foreground dark:text-slate-100 text-xs mt-0.5">{project.metrics.testRuns}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-muted-foreground">Pass%</span>
                  <span className="font-semibold text-emerald-500 text-xs mt-0.5">{project.metrics.passRate}%</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-muted-foreground">Bugs</span>
                  <span className="font-semibold text-rose-500 text-xs mt-0.5">{project.metrics.openBugs}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-muted-foreground">Cov%</span>
                  <span className="font-semibold text-indigo-650 text-xs mt-0.5">{project.metrics.requirementsCoverage}%</span>
                </div>
              </div>

              {/* Project Setup progress tracker */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-[11px] font-medium text-slate-450">
                  <span>Setup Completeness</span>
                  <span>{project.metrics.setupCompleted} / {project.metrics.setupTotal}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-300"
                    style={{ width: `${(project.metrics.setupCompleted / project.metrics.setupTotal) * 100}%` }}
                  />
                </div>
              </div>

              {/* Bottom line layout: Smart action trigger + dropdown actions trigger */}
              <div className="flex items-center gap-2 pt-2 border-t dark:border-slate-800">
                {/* Recommend next CTA button */}
                {renderNextActionCTA(project)}
                
                {/* Details / more items action dropdown */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setOpenDropdownId(openDropdownId === project.id ? null : project.id)
                    }}
                    className="h-9 w-9 border-border dark:border-slate-800"
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </Button>

                  {openDropdownId === project.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} />
                      <div className="absolute right-0 bottom-full mb-2 w-48 rounded-xl border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_8px_24px_rgba(0,0,0,0.08)] py-2 z-20 animate-in fade-in duration-100 text-left">
                        <button
                          onClick={() => {
                            setOpenDropdownId(null)
                            router.push(`/projects/${project.id}/edit`)
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/80 w-full font-semibold"
                        >
                          <Edit2 className="h-3.5 w-3.5" /> Edit Details
                        </button>
                        <button
                          onClick={() => {
                            setOpenDropdownId(null)
                            setDuplicateProject(project)
                            setCloneName(`${project.name} (Copy)`)
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/80 w-full font-semibold"
                        >
                          <Copy className="h-3.5 w-3.5" /> Duplicate Project
                        </button>

                        <div className="border-t dark:border-slate-800 my-1"></div>

                        {project.status === "Active" ? (
                          <button
                            onClick={() => handleToggleArchiveProject(project, true)}
                            className="flex items-center gap-2 px-4 py-2 text-xs text-amber-600 dark:text-amber-450 hover:bg-slate-50 dark:hover:bg-slate-800/80 w-full font-semibold"
                          >
                            <Archive className="h-3.5 w-3.5" /> Archive Project
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleArchiveProject(project, false)}
                            className="flex items-center gap-2 px-4 py-2 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/80 w-full font-semibold"
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" /> Restore Project
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleTriggerDeleteModal(project)}
                          className="flex items-center gap-2 px-4 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 w-full font-semibold"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete Project
                        </button>
                      </div>
                    </>
                  )}
                </div>

              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table Layout View */
        <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-4 shadow-sm min-h-[300px]">
          <table className="w-full text-xs text-left text-muted-foreground dark:text-slate-300">
            <thead>
              <tr className="border-b dark:border-slate-850 text-muted-foreground text-[11px] font-medium">
                <th className="py-2.5">Project</th>
                <th className="py-2.5">Environment</th>
                <th className="py-2.5">Test Type</th>
                <th className="py-2.5">Browser</th>
                <th className="py-2.5">Cases</th>
                <th className="py-2.5">Runs</th>
                <th className="py-2.5">Pass Rate</th>
                <th className="py-2.5">Open Bugs</th>
                <th className="py-2.5">Coverage</th>
                <th className="py-2.5">Health</th>
                <th className="py-2.5">Last updated</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((project) => (
                <tr
                  key={project.id}
                  className={`border-b dark:border-slate-850 hover:bg-muted/50 dark:hover:bg-slate-850/30 ${
                    project.status === "Archived" ? "opacity-60" : ""
                  }`}
                >
                  <td className="py-3 font-semibold text-foreground dark:text-slate-200">
                    <Link href={`/projects/${project.id}`}>{project.name}</Link>
                  </td>
                  <td className="py-3">{project.environment}</td>
                  <td className="py-3">{project.testType}</td>
                  <td className="py-3">{project.browserType}</td>
                  <td className="py-3 font-semibold">{project.metrics.testCases}</td>
                  <td className="py-3 font-semibold">{project.metrics.testRuns}</td>
                  <td className="py-3">
                    <span className={`font-semibold ${project.metrics.passRate >= 75 ? "text-emerald-500" : "text-amber-500"}`}>{project.metrics.passRate}%</span>
                  </td>
                  <td className="py-3 font-semibold text-rose-500">{project.metrics.openBugs}</td>
                  <td className="py-3 font-semibold">{project.metrics.requirementsCoverage}%</td>
                  <td className="py-3">
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border ${getHealthStyle(project.metrics.healthStatus)}`}>
                      {project.metrics.healthStatus}
                    </span>
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {new Date(project.lastActivity.lastUpdatedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/projects/${project.id}`)}
                        className="text-xs font-semibold text-indigo-650 hover:underline"
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDuplicateProject(project)
                          setCloneName(`${project.name} (Copy)`)
                        }}
                        className="text-xs font-semibold text-muted-foreground"
                      >
                        Clone
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Duplicate Project Configuration Modal */}
      {duplicateProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="fixed inset-0" onClick={() => setDuplicateProject(null)} />
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 z-10 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex justify-between items-center border-b dark:border-slate-800 pb-2.5">
              <h3 className="text-base font-semibold text-foreground dark:text-slate-50 flex items-center gap-2">
                <Copy className="h-5 w-5 text-indigo-650" /> Duplicate: {duplicateProject.name}
              </h3>
              <button
                onClick={() => setDuplicateProject(null)}
                className="text-muted-foreground hover:text-slate-650 p-1 hover:bg-muted dark:hover:bg-slate-850 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-550 block">Duplicate Project Name *</label>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  placeholder="e.g. Albawaba Dev Clone"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg px-3 py-2 text-slate-750 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Duplicate options */}
              <div className="space-y-3.5 border border-border dark:border-slate-850 p-4 rounded-xl bg-muted/30">
                <span className="font-medium text-[11px] text-muted-foreground">Cloning settings</span>
                
                <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={cloneTestCases}
                    onChange={(e) => setCloneTestCases(e.target.checked)}
                    className="rounded border-slate-350 text-primary focus:ring-primary mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-foreground dark:text-slate-200 block">Copy Test Cases & Steps</span>
                    <span className="text-[10px] text-muted-foreground leading-normal">Copies all manual/automated test definitions and step logs.</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneRequirements}
                    onChange={(e) => setCloneRequirements(e.target.checked)}
                    className="rounded border-slate-350 text-primary focus:ring-primary mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-foreground dark:text-slate-200 block">Copy Requirements</span>
                    <span className="text-[10px] text-muted-foreground leading-normal">Copies the functional backlog requirements and links them to cases.</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneLocators}
                    onChange={(e) => setCloneLocators(e.target.checked)}
                    className="rounded border-slate-350 text-primary focus:ring-primary mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-foreground dark:text-slate-200 block">Copy Element Locators</span>
                    <span className="text-[10px] text-muted-foreground leading-normal">Copies target XPath/CSS selector paths stored for locator picking.</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t dark:border-slate-800 pt-3 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDuplicateProject(null)}
                className="text-xs font-semibold text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDuplicateConfirm}
                disabled={isDuplicating || !cloneName.trim()}
                className="bg-primary hover:bg-primary/90 text-white text-xs font-semibold"
              >
                {isDuplicating ? "Duplicating..." : "Duplicate"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Safe Delete Confirmation Modal */}
      {deleteProject && (
        <ConfirmDialog
          open={!!deleteProject}
          title={`Delete Project "${deleteProject.name}" Permanently?`}
          description={`Critical Warning: Deleting this project will permanently remove the project configuration and all related testing data. This action is irreversible.\n\n${
            deleteDetails 
              ? `Associated data to be lost:\n— Test cases: ${deleteDetails.testCases || 0}\n— Test runs: ${deleteDetails.testRuns || 0}\n— Bug reports: ${deleteDetails.bugReports || 0}\n— Backlog requirements: ${deleteDetails.requirements || 0}`
              : "Fetching associated records counts..."
          }`}
          confirmLabel="Delete Permanently"
          cancelLabel="Cancel"
          variant="danger"
          requireTextConfirmation={deleteProject.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteProject(null)}
        />
      )}
    </div>
  )
}
