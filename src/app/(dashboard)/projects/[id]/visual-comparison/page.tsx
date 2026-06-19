"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Layers,
  Settings,
  Play,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  Search,
  Trash2,
  Edit2,
  Copy,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  FileText,
  SlidersHorizontal,
  RefreshCw,
  Sliders,
  Check,
  AlertTriangle,
  Download,
  Info,
  User,
  Monitor,
  Maximize2
} from "lucide-react"

interface FigmaFrame {
  id: string
  nodeId: string
  name: string
  pageName: string | null
  width: number | null
  height: number | null
  referenceImagePath: string | null
  lastSyncedAt: string | null
}

interface VisualMapping {
  id: string
  figmaFrameId: string
  appUrl: string
  routeName: string | null
  moduleId: string | null
  featureId: string | null
  componentId: string | null
  viewportName: string
  viewportWidth: number
  viewportHeight: number
  browserType: string
  credentialId: string | null
  waitStrategy: string
  waitSelector: string | null
  fixedDelayMs: number | null
  toleranceProfileId: string | null
  isActive: boolean
  figmaFrame: FigmaFrame
  ignoredRegions: Array<{
    id: string
    x: number
    y: number
    width: number
    height: number
    reason: string
  }>
}

interface VisualIssue {
  id: string
  x: number
  y: number
  width: number
  height: number
  mismatchPercent: number
  regionArea: number
  category: string
  severity: string
  status: string
  notes: string | null
  expectedCropPath: string | null
  actualCropPath: string | null
  diffCropPath: string | null
  bugReportId: string | null
}

interface VisualRun {
  id: string
  mappingId: string
  status: string
  figmaImagePath: string
  actualImagePath: string
  diffImagePath: string | null
  mismatchPercent: number
  totalRegions: number
  browserType: string
  viewportName: string
  viewportWidth: number
  viewportHeight: number
  roleUsed: string | null
  startedAt: string
  completedAt: string | null
  durationMs: number
  mapping: {
    figmaFrame: FigmaFrame
  }
}

export default function VisualComparisonPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  // State Management
  const [activeTab, setActiveTab] = useState<"mappings" | "sync" | "history">("mappings")
  const [project, setProject] = useState<any>(null)
  const [credentials, setCredentials] = useState<any[]>([])
  const [hierarchy, setHierarchy] = useState<any[]>([])
  const [mappings, setMappings] = useState<VisualMapping[]>([])
  const [runs, setRuns] = useState<VisualRun[]>([])
  const [figmaFrames, setFigmaFrames] = useState<FigmaFrame[]>([])
  const [loading, setLoading] = useState(true)

  // Figma Syncer States
  const [figmaToken, setFigmaToken] = useState("")
  const [figmaUrlInput, setFigmaUrlInput] = useState("")
  const [fetchingFrames, setFetchingFrames] = useState(false)
  const [fetchedFrames, setFetchedFrames] = useState<any[]>([])
  const [frameSearch, setFrameSearch] = useState("")
  const [selectedFrameNodeIds, setSelectedFrameNodeIds] = useState<string[]>([])
  const [syncingFrames, setSyncingFrames] = useState(false)

  // Mapping Creation Form States
  const [showMappingModal, setShowMappingModal] = useState(false)
  const [mappingForm, setMappingForm] = useState({
    figmaFrameId: "",
    appUrl: "",
    routeName: "",
    moduleId: "",
    featureId: "",
    componentId: "",
    viewportName: "Desktop 1440x900",
    browserType: "Chromium",
    credentialId: "",
    waitStrategy: "network_idle",
    waitSelector: "",
    fixedDelayMs: 2000,
  })

  // Comparison Workspace Mode States
  const [showWorkspace, setShowWorkspace] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<VisualRun | null>(null)
  const [selectedRunIssues, setSelectedRunIssues] = useState<VisualIssue[]>([])
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [viewMode, setViewMode] = useState<"side-by-side" | "slider" | "overlay" | "diff-heatmap">("side-by-side")
  const [sliderPosition, setSliderPosition] = useState(50)
  const [overlayOpacity, setOverlayOpacity] = useState(50)

  // Drawing Ignored Regions
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 })
  const [drawCurrent, setDrawCurrent] = useState({ x: 0, y: 0 })
  const [showIgnoreReasonModal, setShowIgnoreReasonModal] = useState(false)
  const [pendingRegion, setPendingRegion] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [ignoreReason, setIgnoreReason] = useState("")

  // Bug Report Dialog State
  const [showBugModal, setShowBugModal] = useState(false)
  const [selectedIssueForBug, setSelectedIssueForBug] = useState<VisualIssue | null>(null)
  const [bugTitle, setBugTitle] = useState("")
  const [bugSeverity, setBugSeverity] = useState("Medium")
  const [bugPriority, setBugPriority] = useState("Medium")
  const [bugNotes, setBugNotes] = useState("")
  const [creatingBug, setCreatingBug] = useState(false)

  const imageContainerRef = useRef<HTMLDivElement>(null)
  const workspaceImageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Fetch base project data
  useEffect(() => {
    fetchProjectData()
  }, [projectId])

  const fetchProjectData = async () => {
    try {
      setLoading(true)
      const projectRes = await fetch(`/api/projects/${projectId}`).then(res => res.json())
      setProject(projectRes.project)

      if (projectRes.project?.webAppUrl) {
        setMappingForm(prev => ({ ...prev, appUrl: projectRes.project.webAppUrl }))
      }

      if (projectRes.project?.figmaUrl) {
        setFigmaUrlInput(projectRes.project.figmaUrl)
      }

      // Fetch credentials
      const credsRes = await fetch(`/api/projects/${projectId}/credentials`).then(res => res.json())
      setCredentials(credsRes.credentials || [])

      // Fetch hierarchy
      const hierarchyRes = await fetch(`/api/projects/${projectId}/hierarchy`).then(res => res.json())
      setHierarchy(hierarchyRes.modules || [])

      // Fetch mappings
      const mappingsRes = await fetch(`/api/projects/${projectId}/visual-mappings`).then(res => res.json())
      setMappings(mappingsRes.mappings || [])

      // Fetch synced frames
      const framesRes = await fetch(`/api/projects/${projectId}/figma/sync`).then(res => {
        if (res.ok) return res.json()
        return { frames: [] }
      }).catch(() => ({ frames: [] }))
      setFigmaFrames(framesRes.frames || [])

      // Fetch runs
      const runsRes = await fetch(`/api/projects/${projectId}/visual-runs`).then(res => res.json())
      setRuns(runsRes.runs || [])

      setLoading(false)
    } catch (err) {
      console.error("Failed to load visual QA data:", err)
      setLoading(false)
    }
  }

  // Fetch Figma frames list using personal access token
  const handleFetchFigmaFrames = async () => {
    if (!figmaUrlInput) return
    try {
      setFetchingFrames(true)
      const url = `/api/projects/${projectId}/figma/frames${figmaToken ? `?apiToken=${encodeURIComponent(figmaToken)}` : ""}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setFetchedFrames(data.frames || [])
      } else {
        const data = await res.json()
        const errMsg = data.error || ""
        if (errMsg.includes("403") || errMsg.includes("404") || errMsg.includes("401") || errMsg.toLowerCase().includes("access") || errMsg.toLowerCase().includes("token") || errMsg.toLowerCase().includes("permission")) {
          alert("Please make sure your Figma token has access to this file.")
        } else {
          alert(errMsg || "Failed to fetch Figma file details")
        }
      }
      setFetchingFrames(false)
    } catch (err) {
      console.error(err)
      setFetchingFrames(false)
    }
  }

  // Sync selected frames in bulk
  const handleSyncSelectedFrames = async () => {
    if (selectedFrameNodeIds.length === 0) return
    try {
      setSyncingFrames(true)
      const framesToSync = fetchedFrames
        .filter(f => selectedFrameNodeIds.includes(f.nodeId))
        .map(f => ({
          nodeId: f.nodeId,
          name: f.name,
          pageName: f.pageName,
          width: f.width,
          height: f.height
        }))

      const res = await fetch(`/api/projects/${projectId}/figma/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames: framesToSync,
          apiToken: figmaToken || undefined
        })
      })

      if (res.ok) {
        // Refresh frames and project context
        await fetchProjectData()
        setSelectedFrameNodeIds([])
        setActiveTab("mappings")
      } else {
        const data = await res.json()
        const errMsg = data.error || ""
        if (errMsg.includes("403") || errMsg.includes("404") || errMsg.includes("401") || errMsg.toLowerCase().includes("access") || errMsg.toLowerCase().includes("token") || errMsg.toLowerCase().includes("permission")) {
          alert("Please make sure your Figma token has access to this file.")
        } else {
          alert(errMsg || "Failed to sync frames")
        }
      }
      setSyncingFrames(false)
    } catch (err) {
      console.error(err)
      setSyncingFrames(false)
    }
  }

  // Toggle node selection for sync
  const toggleFrameSelection = (nodeId: string) => {
    setSelectedFrameNodeIds(prev =>
      prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]
    )
  }

  // Create visual check mapping
  const handleCreateMapping = async () => {
    try {
      let width = 1440
      let height = 900
      if (mappingForm.viewportName.includes("1280x800")) { width = 1280; height = 800 }
      else if (mappingForm.viewportName.includes("768x1024")) { width = 768; height = 1024 }
      else if (mappingForm.viewportName.includes("390x844")) { width = 390; height = 844 }
      else if (mappingForm.viewportName.includes("375x667")) { width = 375; height = 667 }

      const res = await fetch(`/api/projects/${projectId}/visual-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaFrameId: mappingForm.figmaFrameId,
          appUrl: mappingForm.appUrl,
          routeName: mappingForm.routeName,
          moduleId: mappingForm.moduleId || null,
          featureId: mappingForm.featureId || null,
          componentId: mappingForm.componentId || null,
          viewportName: mappingForm.viewportName.split(" ")[0],
          viewportWidth: width,
          viewportHeight: height,
          browserType: mappingForm.browserType,
          credentialId: mappingForm.credentialId || null,
          waitStrategy: mappingForm.waitStrategy,
          waitSelector: mappingForm.waitSelector || null,
          fixedDelayMs: mappingForm.fixedDelayMs || null
        })
      })

      if (res.ok) {
        setShowMappingModal(false)
        await fetchProjectData()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to create mapping")
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Delete mapping
  const handleDeleteMapping = async (id: string) => {
    if (!confirm("Are you sure you want to delete this visual check mapping?")) return
    try {
      const res = await fetch(`/api/visual-mappings/${id}`, { method: "DELETE" })
      if (res.ok) {
        await fetchProjectData()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Trigger bulk visual checks
  const handleRunBulkChecks = async () => {
    try {
      const activeMappings = mappings.filter(m => m.isActive)
      if (activeMappings.length === 0) {
        alert("No active visual mappings to run.")
        return
      }

      const res = await fetch(`/api/projects/${projectId}/visual-checks/run-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappingIds: activeMappings.map(m => m.id)
        })
      })

      if (res.ok) {
        alert(`Queued ${activeMappings.length} visual comparisons! Check runs tab or history for outcomes.`)
        fetchProjectData()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to trigger bulk visual checks")
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Trigger visual check for a mapping
  const handleRunVisualCheck = async (mappingId: string) => {
    try {
      const res = await fetch(`/api/visual-mappings/${mappingId}/run`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        // Wait and poll status or refresh history after trigger
        alert("Visual comparison queued! Checking runs tab for outcome.")
        fetchProjectData()
      } else {
        const data = await res.json()
        alert(data.error || "Failed to trigger visual check")
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Open the comparison workspace modal
  const handleOpenWorkspace = async (runId: string) => {
    try {
      setWorkspaceLoading(true)
      setSelectedRunId(runId)
      setShowWorkspace(true)

      const res = await fetch(`/api/visual-runs/${runId}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedRun(data.run)
        setSelectedRunIssues(data.run.issues || [])
      } else {
        alert("Failed to load run details")
        setShowWorkspace(false)
      }
      setWorkspaceLoading(false)
    } catch (err) {
      console.error(err)
      setWorkspaceLoading(false)
      setShowWorkspace(false)
    }
  }

  const handleImageLoad = () => {
    if (imageContainerRef.current && canvasRef.current) {
      canvasRef.current.width = imageContainerRef.current.clientWidth
      canvasRef.current.height = imageContainerRef.current.clientHeight
      drawIgnoredRegions()
    }
  }

  // Redraw ignore regions canvas over expect image
  const drawIgnoredRegions = () => {
    const canvas = canvasRef.current
    if (!canvas || !selectedRun) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Calculate dynamic coordinates scaling factor
    const scaleX = canvas.width / selectedRun.viewportWidth
    const scaleY = canvas.height / selectedRun.viewportHeight

    // Draw saved ignored regions
    const mapping = selectedRun.mapping as any
    if (mapping && mapping.ignoredRegions) {
      for (const region of mapping.ignoredRegions) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.35)" // red mask
        ctx.strokeStyle = "rgb(239, 68, 68)"
        ctx.lineWidth = 1.5
        ctx.fillRect(region.x * scaleX, region.y * scaleY, region.width * scaleX, region.height * scaleY)
        ctx.strokeRect(region.x * scaleX, region.y * scaleY, region.width * scaleX, region.height * scaleY)
      }
    }

    // Draw active drawing box
    if (isDrawing) {
      const x = Math.min(drawStart.x, drawCurrent.x)
      const y = Math.min(drawStart.y, drawCurrent.y)
      const w = Math.abs(drawCurrent.x - drawStart.x)
      const h = Math.abs(drawCurrent.y - drawStart.y)

      ctx.fillStyle = "rgba(59, 130, 246, 0.4)" // blue draw mask
      ctx.strokeStyle = "rgb(59, 130, 246)"
      ctx.lineWidth = 2
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
    }
  }

  // Draw on canvas triggers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setIsDrawing(true)
    setDrawStart({ x, y })
    setDrawCurrent({ x, y })
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setDrawCurrent({ x, y })
    drawIgnoredRegions()
  }

  const handleCanvasMouseUp = () => {
    if (!isDrawing || !canvasRef.current || !selectedRun) return
    setIsDrawing(false)

    const rectW = Math.abs(drawCurrent.x - drawStart.x)
    const rectH = Math.abs(drawCurrent.y - drawStart.y)

    if (rectW < 5 || rectH < 5) return // Too small

    const x = Math.min(drawStart.x, drawCurrent.x)
    const y = Math.min(drawStart.y, drawCurrent.y)

    // Convert to original dimensions
    const scaleX = selectedRun.viewportWidth / canvasRef.current.width
    const scaleY = selectedRun.viewportHeight / canvasRef.current.height

    const origX = Math.round(x * scaleX)
    const origY = Math.round(y * scaleY)
    const origW = Math.round(rectW * scaleX)
    const origH = Math.round(rectH * scaleY)

    setPendingRegion({ x: origX, y: origY, w: origW, h: origH })
    setShowIgnoreReasonModal(true)
  }

  // Save drew ignore region
  const handleSaveIgnoreRegion = async () => {
    if (!pendingRegion || !selectedRun) return
    try {
      const res = await fetch(`/api/visual-mappings/${selectedRun.mappingId}/ignored-regions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: pendingRegion.x,
          y: pendingRegion.y,
          width: pendingRegion.w,
          height: pendingRegion.h,
          reason: ignoreReason || "Ignored dynamic region"
        })
      })

      if (res.ok) {
        // Reload details
        const detailsRes = await fetch(`/api/visual-runs/${selectedRunId}`)
        if (detailsRes.ok) {
          const d = await detailsRes.json()
          setSelectedRun(d.run)
        }
        setShowIgnoreReasonModal(false)
        setIgnoreReason("")
        setPendingRegion(null)
        setTimeout(() => drawIgnoredRegions(), 100)
      } else {
        alert("Failed to save ignored region")
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Delete an ignored region
  const handleDeleteIgnoredRegion = async (regionId: string) => {
    try {
      const res = await fetch(`/api/visual-ignored-regions/${regionId}`, { method: "DELETE" })
      if (res.ok) {
        // Reload details
        const detailsRes = await fetch(`/api/visual-runs/${selectedRunId}`)
        if (detailsRes.ok) {
          const d = await detailsRes.json()
          setSelectedRun(d.run)
        }
        setTimeout(() => drawIgnoredRegions(), 100)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Update discrepancy status (Accepted, Ignored, Bug)
  const handleUpdateIssue = async (issueId: string, updates: Partial<VisualIssue>) => {
    try {
      const res = await fetch(`/api/visual-runs/${selectedRunId}/issues/${issueId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      })

      if (res.ok) {
        // Update local state
        setSelectedRunIssues(prev =>
          prev.map(issue => (issue.id === issueId ? { ...issue, ...updates } : issue))
        )
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Prefill and open Bug creation dialog
  const handleOpenBugDialog = (issue: VisualIssue) => {
    setSelectedIssueForBug(issue)
    setBugTitle(`[Visual Bug] Mismatch detected on Figma Frame "${selectedRun?.mapping.figmaFrame.name}"`)
    setBugNotes(issue.notes || "")
    setBugSeverity("Medium")
    setBugPriority("Medium")
    setShowBugModal(true)
  }

  // Save the filed bug
  const handleFileBug = async () => {
    if (!selectedIssueForBug || !selectedRun) return
    try {
      setCreatingBug(true)
      const res = await fetch(`/api/visual-runs/${selectedRunId}/issues/${selectedIssueForBug.id}/create-bug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bugTitle,
          severity: bugSeverity,
          priority: bugPriority,
          notes: bugNotes
        })
      })

      if (res.ok) {
        const data = await res.json()
        // Update issue status locally
        setSelectedRunIssues(prev =>
          prev.map(issue => (issue.id === selectedIssueForBug.id ? { ...issue, status: "Bug", bugReportId: data.bugReport.id } : issue))
        )
        setShowBugModal(false)
        setSelectedIssueForBug(null)
      } else {
        alert("Failed to submit bug report")
      }
      setCreatingBug(false)
    } catch (err) {
      console.error(err)
      setCreatingBug(false)
    }
  }

  // Export report in markdown format
  const handleExportMarkdown = () => {
    if (!selectedRun) return
    const mdContent = `
# Visual QA Design Validation Report

- **Project:** ${project?.name}
- **Figma Reference:** ${selectedRun.mapping.figmaFrame.name}
- **Web App URL:** ${selectedRun.actualImagePath ? "Captured Live" : "Unavailable"}
- **Status:** ${selectedRun.status}
- **Mismatch Percentage:** ${selectedRun.mismatchPercent.toFixed(2)}%
- **Resolution:** ${selectedRun.viewportWidth}x${selectedRun.viewportHeight}
- **Browser:** ${selectedRun.browserType}
- **Checked At:** ${new Date(selectedRun.startedAt).toLocaleString()}

## Discrepancies Summary
Total Difference Areas: ${selectedRunIssues.length}

${selectedRunIssues.map((issue, idx) => `
### Area ${idx + 1} (Size: ${issue.width}x${issue.height}px at x:${issue.x}, y:${issue.y})
- **Category:** ${issue.category}
- **Severity:** ${issue.severity}
- **Verification Status:** ${issue.status}
- **Notes:** ${issue.notes || "None"}
- **Mismatch Ratio in Region:** ${issue.mismatchPercent.toFixed(1)}%
`).join("\n")}
`

    const blob = new Blob([mdContent], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `visual-qa-report-${selectedRun.mapping.figmaFrame.name.replace(/\s+/g, "-")}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Helper selectors
  const filteredFetchedFrames = fetchedFrames.filter(frame =>
    frame.name.toLowerCase().includes(frameSearch.toLowerCase()) ||
    (frame.pageName && frame.pageName.toLowerCase().includes(frameSearch.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin" />
        <p className="text-muted-foreground animate-pulse">Loading visual validation workspace...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold tracking-wider uppercase text-indigo-600">
            <Layers className="h-4 w-4" /> Design System Validation
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Figma Visual QA</h1>
          <p className="text-sm text-muted-foreground">
            Compare Figma designs against actual web builds across viewports, roles, and device profiles.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="hover:bg-slate-50 transition-all text-xs font-semibold h-9"
            onClick={() => router.push(`/projects/${projectId}`)}
          >
            Project Home
          </Button>
          {mappings.length > 0 && activeTab === "mappings" && (
            <Button
              onClick={handleRunBulkChecks}
              variant="outline"
              className="border-indigo-200 hover:bg-indigo-50/50 text-indigo-700 text-xs font-semibold h-9"
            >
              <Play className="h-3.5 w-3.5 mr-1.5 animate-pulse" /> Run Bulk (Cached Baseline)
            </Button>
          )}
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all duration-200 text-xs font-semibold h-9"
            onClick={() => setShowMappingModal(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> New Visual Mapping
          </Button>
        </div>
      </div>

      {/* Local & Free Runner Cost Warning Notice */}
      <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-700 shadow-sm">
        <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-indigo-950">Local &amp; Free Offline Comparison:</span> This visual check runs 100% locally using free/open-source tools (Playwright, Pixelmatch, pngjs, sharp). No paid visual testing service or paid cloud browser platform is required. Figma access depends on your own Figma account Personal Access Token permissions.
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("mappings")}
          className={`py-3 px-6 text-sm font-semibold tracking-wide border-b-2 transition-all ${
            activeTab === "mappings"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-muted-foreground hover:text-slate-900"
          }`}
        >
          Visual Mappings ({mappings.length})
        </button>
        <button
          onClick={() => setActiveTab("sync")}
          className={`py-3 px-6 text-sm font-semibold tracking-wide border-b-2 transition-all ${
            activeTab === "sync"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-muted-foreground hover:text-slate-900"
          }`}
        >
          Figma Frame Syncer
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`py-3 px-6 text-sm font-semibold tracking-wide border-b-2 transition-all ${
            activeTab === "history"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-muted-foreground hover:text-slate-900"
          }`}
        >
          Run History ({runs.length})
        </button>
      </div>

      {/* TAB A: Mappings Dashboard */}
      {activeTab === "mappings" && (
        <div className="space-y-6">
          {mappings.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-12 text-center bg-slate-50/50">
              <ImageIcon className="h-12 w-12 text-slate-350 mx-auto mb-4" />
              <h3 className="font-bold text-lg text-slate-800">No Visual Mappings Defined</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
                Create a mapping to connect a synced Figma reference frame to your application&apos;s live URL and viewports.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button onClick={() => setActiveTab("sync")} variant="outline">
                  Sync Figma Frames
                </Button>
                <Button onClick={() => setShowMappingModal(true)} className="bg-indigo-600 text-white">
                  Add Mapping
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {mappings.map(mapping => {
                // Find latest run for this mapping
                const latestRun = runs.find(r => r.mappingId === mapping.id)

                return (
                  <div
                    key={mapping.id}
                    className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-200"
                  >
                    {/* Frame Preview Header */}
                    <div className="aspect-[16/9] w-full bg-slate-100 relative group overflow-hidden border-b">
                      {mapping.figmaFrame.referenceImagePath ? (
                        <img
                          src={`/api/files/${mapping.figmaFrame.referenceImagePath}`}
                          alt={mapping.figmaFrame.name}
                          className="object-cover w-full h-full group-hover:scale-105 transition-all duration-300"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-slate-400">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                      {latestRun && (
                        <div className={`absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm ${
                          latestRun.status === "Passed" ? "bg-emerald-500 text-white" :
                          latestRun.status === "Failed" ? "bg-rose-500 text-white" :
                          latestRun.status === "NeedsReview" ? "bg-amber-500 text-slate-900" :
                          "bg-slate-500 text-white"
                        }`}>
                          {latestRun.status}
                        </div>
                      )}
                    </div>

                    {/* Mapping Details */}
                    <div className="p-5 flex-grow space-y-4">
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg line-clamp-1">{mapping.figmaFrame.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{mapping.figmaFrame.pageName || "Main Page"}</p>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-650">
                          <span className="font-medium">Web URL:</span>
                          <span className="font-semibold text-slate-900 truncate max-w-[200px]" title={mapping.appUrl}>
                            {mapping.appUrl}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-650">
                          <span className="font-medium">Viewport:</span>
                          <span className="font-semibold text-slate-900 flex items-center gap-1">
                            <Monitor className="h-3.5 w-3.5 text-slate-400" /> {mapping.viewportName} ({mapping.viewportWidth}x{mapping.viewportHeight})
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-650">
                          <span className="font-medium">Login Role:</span>
                          <span className="font-semibold text-slate-900 flex items-center gap-1">
                            <User className="h-3.5 w-3.5 text-slate-400" /> {credentials.find(c => c.id === mapping.credentialId)?.roleName || "No Auth"}
                          </span>
                        </div>
                      </div>

                      {latestRun && (
                        <div className="border-t pt-3 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Last Run Mismatch:</span>
                          <span className={`font-bold ${latestRun.mismatchPercent > 2 ? "text-rose-600" : "text-emerald-600"}`}>
                            {latestRun.mismatchPercent.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions Panel */}
                    <div className="px-5 py-3.5 border-t bg-slate-50/70 flex gap-2">
                      <Button
                        onClick={() => handleRunVisualCheck(mapping.id)}
                        className="flex-grow bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm h-8 px-2"
                        title="Rerun comparison locally using the cached Figma reference baseline"
                      >
                        <Play className="h-3.5 w-3.5 mr-1" /> Use Cached Figma Baseline
                      </Button>
                      {latestRun ? (
                        <Button
                          onClick={() => handleOpenWorkspace(latestRun.id)}
                          variant="outline"
                          className="flex-shrink border-slate-300 hover:bg-white text-xs h-8 px-2"
                        >
                          <Maximize2 className="h-3.5 w-3.5 mr-1 text-slate-500" /> Inspect
                        </Button>
                      ) : (
                        <Button
                          disabled
                          variant="outline"
                          className="flex-shrink border-slate-200 text-xs h-8 px-2 text-slate-350"
                        >
                          No Results
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDeleteMapping(mapping.id)}
                        variant="ghost"
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 h-8 w-8 p-0 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB B: Figma Sync Setup */}
      {activeTab === "sync" && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Config column */}
          <div className="md:col-span-1 border rounded-xl p-5 bg-white shadow-sm space-y-5">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <Settings className="h-4.5 w-4.5 text-slate-400" /> Connect Figma API
            </h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="figmaTokenInput">Figma Personal Token (Encrypted)</Label>
                <Input
                  id="figmaTokenInput"
                  type="password"
                  placeholder={project?.figmaConfig?.encryptedApiToken ? "••••••••••••••••••••" : "figd_..."}
                  value={figmaToken}
                  onChange={(e) => setFigmaToken(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Saved tokens are encrypted using AES-256 and decrypted strictly on-demand in background workers.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="figmaUrlInput">Figma Design File URL</Label>
                <Input
                  id="figmaUrlInput"
                  type="url"
                  placeholder="https://www.figma.com/design/..."
                  value={figmaUrlInput}
                  onChange={(e) => setFigmaUrlInput(e.target.value)}
                />
              </div>

              <Button
                onClick={handleFetchFigmaFrames}
                disabled={fetchingFrames || !figmaUrlInput}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
              >
                {fetchingFrames ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Fetching File...
                  </>
                ) : (
                  "Fetch Frames & Canvas"
                )}
              </Button>
            </div>
          </div>

          {/* Sync frames selection table */}
          <div className="md:col-span-2 border rounded-xl p-5 bg-white shadow-sm flex flex-col min-h-[400px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 mb-4">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Figma Frame Selection</h3>
                <p className="text-xs text-muted-foreground">Select one or multiple design frames to import as validation assets.</p>
              </div>
              {selectedFrameNodeIds.length > 0 && (
                <Button
                  onClick={handleSyncSelectedFrames}
                  disabled={syncingFrames}
                  className="bg-indigo-600 text-white shadow-md text-xs font-semibold"
                >
                  {syncingFrames ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Downloading...
                    </>
                  ) : (
                    `Download & Sync ${selectedFrameNodeIds.length} Frames`
                  )}
                </Button>
              )}
            </div>

            {fetchedFrames.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center text-center py-12 text-slate-400">
                <Layers className="h-10 w-10 mb-3" />
                <p className="text-sm font-medium">No frames fetched yet</p>
                <p className="text-xs mt-1 max-w-xs">Enter your credentials and click Fetch Design File to load frames.</p>
              </div>
            ) : (
              <div className="space-y-4 flex-grow flex flex-col">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search frames by name or canvas page..."
                    className="pl-9 h-9"
                    value={frameSearch}
                    onChange={(e) => setFrameSearch(e.target.value)}
                  />
                </div>

                <div className="flex-grow overflow-auto max-h-[350px] border rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-650 text-xs font-semibold uppercase border-b">
                      <tr>
                        <th className="p-3 w-10">Select</th>
                        <th className="p-3">Frame Name</th>
                        <th className="p-3">Canvas Page</th>
                        <th className="p-3">Dimensions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredFetchedFrames.map(frame => (
                        <tr
                          key={frame.nodeId}
                          onClick={() => toggleFrameSelection(frame.nodeId)}
                          className="hover:bg-slate-50 cursor-pointer transition-all"
                        >
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedFrameNodeIds.includes(frame.nodeId)}
                              onChange={() => toggleFrameSelection(frame.nodeId)}
                              className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                            />
                          </td>
                          <td className="p-3 font-semibold text-slate-800">{frame.name}</td>
                          <td className="p-3 text-muted-foreground">{frame.pageName || "Default Page"}</td>
                          <td className="p-3 text-xs text-slate-600">
                            {frame.width ? `${Math.round(frame.width)}x${Math.round(frame.height)}` : "Vector"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB C: Run History */}
      {activeTab === "history" && (
        <div className="border rounded-xl p-5 bg-white shadow-sm overflow-hidden">
          <h3 className="font-bold text-lg text-slate-800 mb-4">Visual Check History</h3>
          {runs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-10 w-10 mx-auto mb-3" />
              <p className="text-sm font-medium">No visual check runs registered</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold border-b">
                  <tr>
                    <th className="p-3">Reference Frame</th>
                    <th className="p-3">Resolution</th>
                    <th className="p-3">Browser</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Mismatch</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Checked At</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {runs.map(run => (
                    <tr key={run.id} className="hover:bg-slate-50 transition-all">
                      <td className="p-3 font-semibold text-slate-800">{run.mapping.figmaFrame.name}</td>
                      <td className="p-3 text-xs text-slate-600">{run.viewportWidth}x{run.viewportHeight}</td>
                      <td className="p-3 text-xs text-slate-600">{run.browserType}</td>
                      <td className="p-3 text-xs text-slate-600">{run.roleUsed || "Anonymous"}</td>
                      <td className="p-3 font-semibold text-slate-900">{run.mismatchPercent.toFixed(2)}%</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                          run.status === "Passed" ? "bg-emerald-100 text-emerald-800" :
                          run.status === "Failed" ? "bg-rose-100 text-rose-800" :
                          run.status === "NeedsReview" ? "bg-amber-100 text-amber-800" :
                          "bg-slate-100 text-slate-800"
                        }`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(run.startedAt).toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <Button
                          onClick={() => handleOpenWorkspace(run.id)}
                          variant="ghost"
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold h-8 py-1 px-3"
                        >
                          Open Workspace
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Create Visual Mapping */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border">
            <div className="flex items-center justify-between p-5 border-b bg-slate-50">
              <h3 className="font-bold text-lg text-slate-900">New Visual Check Mapping</h3>
              <button onClick={() => setShowMappingModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto max-h-[500px]">
              {/* Target Figma Frame */}
              <div className="space-y-1.5">
                <Label htmlFor="mappingFigmaFrame">Select Synced Figma Frame</Label>
                <select
                  id="mappingFigmaFrame"
                  value={mappingForm.figmaFrameId}
                  onChange={(e) => setMappingForm({ ...mappingForm, figmaFrameId: e.target.value })}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                >
                  <option value="">-- Choose Frame --</option>
                  {figmaFrames.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.pageName || "Main Canvas"})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Frames must be synced using the &quot;Figma Frame Syncer&quot; tab first before they appear here.
                </p>
              </div>

              {/* URL */}
              <div className="space-y-1.5">
                <Label htmlFor="mappingAppUrl">Target Application URL</Label>
                <Input
                  id="mappingAppUrl"
                  type="text"
                  placeholder="/login or https://example.com/login"
                  value={mappingForm.appUrl}
                  onChange={(e) => setMappingForm({ ...mappingForm, appUrl: e.target.value })}
                />
              </div>

              {/* Viewport Preset */}
              <div className="space-y-1.5">
                <Label htmlFor="mappingViewport">Viewport Size Preset</Label>
                <select
                  id="mappingViewport"
                  value={mappingForm.viewportName}
                  onChange={(e) => setMappingForm({ ...mappingForm, viewportName: e.target.value })}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                >
                  <option value="Desktop 1440x900">Desktop 1440x900</option>
                  <option value="Desktop 1280x800">Desktop 1280x800</option>
                  <option value="Tablet 768x1024">Tablet 768x1024</option>
                  <option value="Mobile 390x844">Mobile 390x844</option>
                  <option value="Mobile 375x667">Mobile 375x667</option>
                </select>
              </div>

              {/* Login role selector */}
              <div className="space-y-1.5">
                <Label htmlFor="mappingCredential">Auto-login Credentials (Optional)</Label>
                <select
                  id="mappingCredential"
                  value={mappingForm.credentialId}
                  onChange={(e) => setMappingForm({ ...mappingForm, credentialId: e.target.value })}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                >
                  <option value="">Anonymous (No Login)</option>
                  {credentials.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.roleName} ({c.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Wait Strategy */}
                <div className="space-y-1.5">
                  <Label htmlFor="mappingWait">Stabilization Wait Strategy</Label>
                  <select
                    id="mappingWait"
                    value={mappingForm.waitStrategy}
                    onChange={(e) => setMappingForm({ ...mappingForm, waitStrategy: e.target.value })}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  >
                    <option value="load">On Load Event</option>
                    <option value="network_idle">On Network Idle</option>
                    <option value="custom_selector">On Selector Visible</option>
                    <option value="delay">Fixed Millisecond Delay</option>
                  </select>
                </div>

                {/* Browser Type */}
                <div className="space-y-1.5">
                  <Label htmlFor="mappingBrowser">Browser Engine</Label>
                  <select
                    id="mappingBrowser"
                    value={mappingForm.browserType}
                    onChange={(e) => setMappingForm({ ...mappingForm, browserType: e.target.value })}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  >
                    <option value="Chromium">Google Chrome (Chromium)</option>
                    <option value="Firefox">Mozilla Firefox</option>
                    <option value="Webkit">Apple Safari (Webkit)</option>
                  </select>
                </div>
              </div>

              {mappingForm.waitStrategy === "custom_selector" && (
                <div className="space-y-1.5">
                  <Label htmlFor="mappingSelector">Custom Selector to Wait For</Label>
                  <Input
                    id="mappingSelector"
                    placeholder="e.g. div#dashboard-main"
                    value={mappingForm.waitSelector}
                    onChange={(e) => setMappingForm({ ...mappingForm, waitSelector: e.target.value })}
                  />
                </div>
              )}

              {mappingForm.waitStrategy === "delay" && (
                <div className="space-y-1.5">
                  <Label htmlFor="mappingDelay">Wait Delay (ms)</Label>
                  <Input
                    id="mappingDelay"
                    type="number"
                    value={mappingForm.fixedDelayMs}
                    onChange={(e) => setMappingForm({ ...mappingForm, fixedDelayMs: Number(e.target.value) })}
                  />
                </div>
              )}
            </div>

            <div className="p-5 border-t bg-slate-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowMappingModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={!mappingForm.figmaFrameId || !mappingForm.appUrl}
                onClick={handleCreateMapping}
                className="bg-indigo-600 text-white font-medium px-5"
              >
                Create Mapping
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* WORKSPACE VIEW MODAL: Interactive Comparison Workspace */}
      {showWorkspace && selectedRun && (
        <div className="fixed inset-0 bg-slate-900/90 z-50 flex flex-col">
          {/* Header bar */}
          <div className="bg-slate-900 border-b border-slate-800 text-white px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                selectedRun.status === "Passed" ? "bg-emerald-500/20 text-emerald-400" :
                selectedRun.status === "Failed" ? "bg-rose-500/20 text-rose-400" :
                "bg-amber-500/20 text-amber-400"
              }`}>
                {selectedRun.status}
              </span>
              <h3 className="font-bold text-lg">{selectedRun.mapping.figmaFrame.name}</h3>
              <span className="text-slate-500 text-xs">({selectedRun.viewportWidth}x{selectedRun.viewportHeight})</span>
            </div>

            {/* Layout view controls */}
            <div className="flex items-center gap-2 border border-slate-700 rounded-lg p-0.5 bg-slate-800 text-xs">
              <button
                onClick={() => setViewMode("side-by-side")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  viewMode === "side-by-side" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Side-by-Side
              </button>
              <button
                onClick={() => setViewMode("slider")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  viewMode === "slider" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Slider
              </button>
              <button
                onClick={() => setViewMode("overlay")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  viewMode === "overlay" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Overlay
              </button>
              <button
                onClick={() => setViewMode("diff-heatmap")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  viewMode === "diff-heatmap" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Diff Heatmap
              </button>
            </div>

            {/* General Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsDrawingMode(!isDrawingMode)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                  isDrawingMode
                    ? "bg-amber-600 border-amber-600 text-white shadow-sm"
                    : "border-slate-700 hover:bg-slate-800 text-slate-300"
                }`}
              >
                {isDrawingMode ? "Drawing Ignored Area..." : "Draw Ignored Zone"}
              </button>
              <Button variant="ghost" className="text-slate-300 hover:text-white" onClick={handleExportMarkdown}>
                <Download className="h-4 w-4 mr-1.5" /> Export MD
              </Button>
              <button onClick={() => setShowWorkspace(false)} className="text-slate-400 hover:text-white">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {workspaceLoading ? (
            <div className="flex-grow flex flex-col items-center justify-center text-white space-y-4">
              <RefreshCw className="h-10 w-10 text-indigo-400 animate-spin" />
              <p className="text-slate-350">Loading pixel matrix diff crops...</p>
            </div>
          ) : (
            <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
              {/* Interactive workspace canvas viewport */}
              <div className="flex-grow overflow-auto p-6 bg-slate-950 flex items-start justify-center relative">
                {/* Sliders/Opacities panels */}
                {viewMode === "overlay" && (
                  <div className="absolute top-4 left-4 bg-slate-900 border border-slate-800 rounded-xl p-3 z-10 w-60 text-white shadow-lg space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                      <span>Opacity Overlay:</span>
                      <span>{overlayOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={overlayOpacity}
                      onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                      className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                )}

                {/* Layout Container */}
                <div
                  ref={imageContainerRef}
                  className="relative select-none max-w-full rounded-md border border-slate-800 overflow-hidden shadow-2xl bg-slate-900"
                  style={{ width: `${selectedRun.viewportWidth}px` }}
                >
                  {/* SIDE-BY-SIDE VIEW */}
                  {viewMode === "side-by-side" && (
                    <div className="grid grid-cols-2 divide-x divide-slate-800">
                      <div className="relative">
                        <div className="absolute top-2 left-2 bg-slate-900/80 text-[10px] font-bold text-white px-2 py-0.5 rounded uppercase">Figma Expected</div>
                        <img
                          src={`/api/files/${selectedRun.figmaImagePath}`}
                          alt="Figma Expected"
                          className="w-full object-contain"
                        />
                      </div>
                      <div className="relative">
                        <div className="absolute top-2 left-2 bg-slate-900/80 text-[10px] font-bold text-white px-2 py-0.5 rounded uppercase">Web Actual</div>
                        <img
                          src={`/api/files/${selectedRun.actualImagePath}`}
                          alt="Web Actual"
                          className="w-full object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* SLIDER VIEW */}
                  {viewMode === "slider" && (
                    <div className="relative w-full overflow-hidden">
                      {/* Actual image background */}
                      <img
                        src={`/api/files/${selectedRun.actualImagePath}`}
                        alt="Web Actual"
                        className="w-full object-contain block"
                      />
                      {/* Figma expected overlaid with width control */}
                      <div
                        className="absolute inset-0 overflow-hidden pointer-events-none"
                        style={{ width: `${sliderPosition}%` }}
                      >
                        <img
                          src={`/api/files/${selectedRun.figmaImagePath}`}
                          alt="Figma Expected"
                          className="max-w-none h-full object-cover"
                          style={{ width: `${selectedRun.viewportWidth}px` }}
                        />
                      </div>
                      {/* Interactive Drag Handle */}
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sliderPosition}
                        onChange={(e) => setSliderPosition(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
                      />
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-indigo-500 z-10 pointer-events-none"
                        style={{ left: `${sliderPosition}%` }}
                      >
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-indigo-600 border-2 border-white shadow flex items-center justify-center text-white text-xs font-black">
                          ↔
                        </div>
                      </div>
                    </div>
                  )}

                  {/* OVERLAY OPACITY VIEW */}
                  {viewMode === "overlay" && (
                    <div className="relative w-full">
                      <img
                        src={`/api/files/${selectedRun.actualImagePath}`}
                        alt="Web Actual"
                        className="w-full object-contain block"
                      />
                      <img
                        src={`/api/files/${selectedRun.figmaImagePath}`}
                        alt="Figma Expected"
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        style={{ opacity: overlayOpacity / 100 }}
                      />
                    </div>
                  )}

                  {/* DIFF HEATMAP VIEW */}
                  {viewMode === "diff-heatmap" && (
                    <div className="relative w-full">
                      {selectedRun.diffImagePath ? (
                        <img
                          src={`/api/files/${selectedRun.diffImagePath}`}
                          alt="Difference Diff"
                          className="w-full object-contain block"
                        />
                      ) : (
                        <div className="flex items-center justify-center py-24 text-slate-500">
                          <CheckCircle2 className="h-10 w-10 text-emerald-500 mr-2" /> No differences detected in this run.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interaction Canvas Overlay */}
                  {isDrawingMode && (
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      className="absolute inset-0 w-full h-full cursor-crosshair z-30"
                      onMouseEnter={handleImageLoad}
                    />
                  )}
                </div>
              </div>

              {/* Right Panel: Issues & Ignored coordinates reviewer */}
              <div className="w-full md:w-[420px] bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 text-white flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                  <h4 className="font-bold text-sm">Discrepancy Details</h4>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    {selectedRunIssues.length} issues found
                  </span>
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-4">
                  {/* Ignored areas review */}
                  {(selectedRun.mapping as any).ignoredRegions?.length > 0 && (
                    <div className="border border-slate-800 rounded-lg p-3 space-y-2 bg-slate-950/40">
                      <span className="text-xs font-semibold text-slate-400">Ignored Regions ({ (selectedRun.mapping as any).ignoredRegions.length })</span>
                      <div className="space-y-1.5 max-h-28 overflow-auto">
                        {(selectedRun.mapping as any).ignoredRegions.map((region: any) => (
                          <div key={region.id} className="flex justify-between items-center text-xs p-1.5 border border-slate-800 rounded bg-slate-900">
                            <div className="flex items-center gap-1.5 truncate">
                              <Info className="h-3.5 w-3.5 text-amber-500" />
                              <span className="font-semibold text-slate-300">[{region.x},{region.y}]</span>
                              <span className="text-muted-foreground truncate max-w-[120px]">{region.reason}</span>
                            </div>
                            <button
                              onClick={() => handleDeleteIgnoredRegion(region.id)}
                              className="text-slate-500 hover:text-rose-500"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Discrepancies listing */}
                  {selectedRunIssues.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 animate-bounce" />
                      <p className="text-sm font-semibold">Perfect Alignment!</p>
                      <p className="text-xs mt-1 text-slate-500">No discrepancies detected above the tolerance settings.</p>
                    </div>
                  ) : (
                    selectedRunIssues.map((issue, idx) => (
                      <div
                        key={issue.id}
                        className="border border-slate-800 bg-slate-950/40 rounded-xl p-4 space-y-4 hover:border-slate-700 transition-all duration-200"
                      >
                        {/* Issue Header */}
                        <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                          <div>
                            <span className="text-xs font-bold text-indigo-400">Discrepancy #{idx + 1}</span>
                            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                              Size: {issue.width}x{issue.height}px at x:{issue.x}, y:{issue.y}
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            issue.status === "Bug" ? "bg-rose-500/20 text-rose-400" :
                            issue.status === "Accepted" ? "bg-emerald-500/20 text-emerald-400" :
                            issue.status === "Ignored" ? "bg-slate-500/20 text-slate-400" :
                            "bg-amber-500/20 text-amber-400"
                          }`}>
                            {issue.status}
                          </span>
                        </div>

                        {/* Crops Side-by-Side Review */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Figma</span>
                            <div className="aspect-square bg-slate-900 rounded border border-slate-800 overflow-hidden">
                              {issue.expectedCropPath && (
                                <img src={`/api/files/${issue.expectedCropPath}`} alt="Figma expected crop" className="w-full h-full object-contain" />
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Web Actual</span>
                            <div className="aspect-square bg-slate-900 rounded border border-slate-800 overflow-hidden">
                              {issue.actualCropPath && (
                                <img src={`/api/files/${issue.actualCropPath}`} alt="Web actual crop" className="w-full h-full object-contain" />
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[8px] uppercase tracking-wider text-slate-500 font-bold">Diff Heatmap</span>
                            <div className="aspect-square bg-slate-900 rounded border border-slate-800 overflow-hidden">
                              {issue.diffCropPath && (
                                <img src={`/api/files/${issue.diffCropPath}`} alt="Pixel diff crop" className="w-full h-full object-contain" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Selectors config */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Category</label>
                            <select
                              value={issue.category}
                              onChange={(e) => handleUpdateIssue(issue.id, { category: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-300 text-xs focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="Unknown">Unknown</option>
                              <option value="LayoutMismatch">Layout</option>
                              <option value="SpacingMismatch">Spacing</option>
                              <option value="ColorMismatch">Color</option>
                              <option value="TextMismatch">Text</option>
                              <option value="FontSizeMismatch">Font Size</option>
                              <option value="MissingElement">Missing Element</option>
                              <option value="ExtraElement">Extra Element</option>
                              <option value="AlignmentIssue">Alignment</option>
                              <option value="ResponsiveIssue">Responsive</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase">Severity</label>
                            <select
                              value={issue.severity}
                              onChange={(e) => handleUpdateIssue(issue.id, { severity: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-300 text-xs focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="Critical">Critical</option>
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
                              <option value="Trivial">Trivial</option>
                            </select>
                          </div>
                        </div>

                        {/* Notes input */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-500 font-bold uppercase">Discrepancy Notes</label>
                          <input
                            type="text"
                            placeholder="Add spacing discrepancy detail..."
                            value={issue.notes || ""}
                            onChange={(e) => handleUpdateIssue(issue.id, { notes: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-slate-700"
                          />
                        </div>

                        {/* Action Triggers */}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleUpdateIssue(issue.id, { status: "Accepted" })}
                            className="flex-1 py-1.5 border border-slate-850 hover:bg-slate-800 text-[11px] font-bold rounded flex items-center justify-center gap-1.5 text-slate-300 transition-all"
                          >
                            <Check className="h-3.5 w-3.5 text-emerald-500" /> Accept
                          </button>
                          {issue.bugReportId ? (
                            <button
                              disabled
                              className="flex-1 py-1.5 bg-rose-950/20 text-rose-450 border border-rose-900/30 text-[11px] font-bold rounded flex items-center justify-center gap-1.5"
                            >
                              Filed as Bug
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenBugDialog(issue)}
                              className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-[11px] font-bold text-white rounded flex items-center justify-center gap-1.5 shadow-sm transition-all"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" /> File Bug
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DRAW IGNORE REGION DIALOG: Add Ignore Reason */}
      {showIgnoreReasonModal && pendingRegion && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-800">
            <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
              <h3 className="font-bold text-sm">Add Ignored Zone</h3>
              <button onClick={() => { setShowIgnoreReasonModal(false); setPendingRegion(null); }} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400">
                You drew a coordinates box of size {pendingRegion.w}x{pendingRegion.h}px at [{pendingRegion.x},{pendingRegion.y}].
                This zone will be excluded from mismatch calculation in future visual checks.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="ignoreReasonInput" className="text-slate-300">Exclude Reason (e.g. Dynamic User Name)</Label>
                <Input
                  id="ignoreReasonInput"
                  value={ignoreReason}
                  onChange={(e) => setIgnoreReason(e.target.value)}
                  placeholder="Live CDN image, random ads"
                  className="bg-slate-950 border-slate-800 text-white placeholder-slate-600 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end gap-2.5">
              <Button variant="ghost" className="text-slate-400 hover:text-white" onClick={() => { setShowIgnoreReasonModal(false); setPendingRegion(null); }}>
                Cancel
              </Button>
              <Button onClick={handleSaveIgnoreRegion} className="bg-indigo-600 text-white font-medium text-xs px-4">
                Save Exclude
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create visual Bug Report from workspace issue */}
      {showBugModal && selectedIssueForBug && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-xl shadow-xl w-full max-w-md overflow-hidden border">
            <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">File Design Defect</h3>
              <button onClick={() => setShowBugModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[400px]">
              <div className="space-y-1.5">
                <Label htmlFor="bugTitleInput">Defect Title</Label>
                <Input
                  id="bugTitleInput"
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bugSeverityInput">Severity</Label>
                  <select
                    id="bugSeverityInput"
                    value={bugSeverity}
                    onChange={(e) => setBugSeverity(e.target.value)}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-xs shadow-sm"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                    <option value="Trivial">Trivial</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bugPriorityInput">Priority</Label>
                  <select
                    id="bugPriorityInput"
                    value={bugPriority}
                    onChange={(e) => setBugPriority(e.target.value)}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-xs shadow-sm"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bugNotesInput">Additional Description Notes</Label>
                <textarea
                  id="bugNotesInput"
                  rows={3}
                  value={bugNotes}
                  onChange={(e) => setBugNotes(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none"
                  placeholder="Provide details for frontend developers (e.g. submit button shifted 18px right and font size is 12px instead of 14px)..."
                />
              </div>
            </div>

            <div className="p-5 border-t bg-slate-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowBugModal(false)}>
                Cancel
              </Button>
              <Button
                disabled={creatingBug}
                onClick={handleFileBug}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs px-4"
              >
                {creatingBug ? "Filing Defect..." : "File Visual Bug"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
