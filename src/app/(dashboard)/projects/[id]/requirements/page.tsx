"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/ui/back-button"
import {
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  Eye,
  Trash2,
  Sparkles,
  Link as LinkIcon,
  Video,
  Play,
  Layers,
  HelpCircle,
  AlertTriangle,
  CheckCircle,
  FileText,
  VideoOff,
  Clock,
  Compass,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Loader2
} from "lucide-react"
import { ImportRequirementsModal } from "@/components/requirements/import-modal"
import { HierarchySelector } from "@/components/hierarchy/hierarchy-selector"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface Requirement {
  id: string
  requirementKey: string
  title: string
  description: string | null
  acceptanceCriteria: string | null
  priority: string
  status: string
  source: string
  moduleId: string | null
  featureId: string | null
  componentId: string | null
  module: { id: string; name: string } | null
  feature: { id: string; name: string } | null
  component: { id: string; name: string } | null
  figmaUrl: string | null
  externalUrl: string | null
  externalSystem: string | null
  testCases: Array<{ testCaseId: string; testCase: { id: string; title: string } }>
  bugReports: Array<{ bugReport: { id: string; title: string; severity: string } }>
  computedCoverage: "Uncovered" | "PartiallyCovered" | "Covered" | "Failed" | "Blocked" | "NotExecuted"
  openBugsCount: number
}

interface CoverageStats {
  total: number
  covered: number
  partiallyCovered: number
  uncovered: number
  failed: number
  blocked: number
  notExecuted: number
  coveragePercentage: number
  requirementsWithBugs: number
}

export default function RequirementsDashboard() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [stats, setStats] = useState<CoverageStats | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Modals & triggers
  const [showImportModal, setShowImportModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [selectedReq, setSelectedReq] = useState<Requirement | null>(null)
  const [requirementToDelete, setRequirementToDelete] = useState<string | null>(null)

  // Create Form states
  const [newReqKey, setNewReqKey] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [newCriteria, setNewCriteria] = useState("")
  const [newPriority, setNewPriority] = useState("Medium")
  const [newStatus, setNewStatus] = useState("Draft")
  const [newFigmaUrl, setNewFigmaUrl] = useState("")
  const [newExternalUrl, setNewExternalUrl] = useState("")
  const [newExternalSystem, setNewExternalSystem] = useState("Jira")
  const [newModuleId, setNewModuleId] = useState("")
  const [newFeatureId, setNewFeatureId] = useState("")
  const [newComponentId, setNewComponentId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Link cases states
  const [availableTestCases, setAvailableTestCases] = useState<any[]>([])
  const [selectedCaseIdsToLink, setSelectedCaseIdsToLink] = useState<string[]>([])
  const [linking, setLinking] = useState(false)

  // Filters
  const [search, setSearch] = useState("")
  const [modFilter, setModFilter] = useState("ALL")
  const [priorityFilter, setPriorityFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [coverageFilter, setCoverageFilter] = useState("ALL")
  const [sourceFilter, setSourceFilter] = useState("ALL")
  const [casesFilter, setCasesFilter] = useState("ALL") // ALL, WITH_CASES, NO_CASES
  const [bugsFilter, setBugsFilter] = useState("ALL") // ALL, WITH_BUGS, NO_BUGS

  // Hierarchy for filters
  const [projectModules, setProjectModules] = useState<any[]>([])

  useEffect(() => {
    fetchRequirementsData()
    fetchStatsData()
    fetchModules()
  }, [projectId])

  const fetchRequirementsData = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/requirements`)
      if (res.ok) {
        const data = await res.json()
        setRequirements(data.requirements || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  const fetchStatsData = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/coverage-summary`)
      if (res.ok) {
        const data = await res.json()
        setStats(data.summary)
      }
    } catch {}
  }

  const fetchModules = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/modules`)
      if (res.ok) {
        const data = await res.json()
        setProjectModules(data.modules || [])
      }
    } catch {}
  }

  const handleCreateRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReqKey.trim() || !newTitle.trim()) return
    setSubmitting(true)

    try {
      const res = await fetch(`/api/projects/${projectId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirementKey: newReqKey.trim(),
          title: newTitle.trim(),
          description: newDesc,
          acceptanceCriteria: newCriteria,
          priority: newPriority,
          status: newStatus,
          moduleId: newModuleId || null,
          featureId: newFeatureId || null,
          componentId: newComponentId || null,
          figmaUrl: newFigmaUrl,
          externalUrl: newExternalUrl,
          externalSystem: newExternalSystem
        })
      })

      if (res.ok) {
        setShowCreateModal(false)
        setNewReqKey("")
        setNewTitle("")
        setNewDesc("")
        setNewCriteria("")
        setNewFigmaUrl("")
        setNewExternalUrl("")
        setNewModuleId("")
        setNewFeatureId("")
        setNewComponentId("")
        fetchRequirementsData()
        fetchStatsData()
      } else {
        const err = await res.json()
        alert(err.error || "Failed to create requirement")
      }
    } catch {
      alert("Network error creating requirement")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRequirement = (id: string) => {
    setRequirementToDelete(id)
  }

  const confirmDeleteRequirement = async () => {
    if (!requirementToDelete) return
    const res = await fetch(`/api/requirements/${requirementToDelete}`, { method: "DELETE" })
    if (!res.ok) {
      throw new Error("Failed to delete requirement")
    }
    setRequirementToDelete(null)
    fetchRequirementsData()
    fetchStatsData()
  }

  const openLinkTestCasesModal = async (req: Requirement) => {
    setSelectedReq(req)
    setSelectedCaseIdsToLink(req.testCases.map(tc => tc.testCaseId))
    setShowLinkModal(true)

    try {
      const res = await fetch(`/api/projects/${projectId}/test-cases`)
      if (res.ok) {
        const data = await res.json()
        setAvailableTestCases(data.testCases || [])
      }
    } catch {}
  }

  const handleLinkTestCases = async () => {
    if (!selectedReq) return
    setLinking(true)

    try {
      // Unlink removed ones
      const originalIds = selectedReq.testCases.map(tc => tc.testCaseId)
      const toUnlink = originalIds.filter(id => !selectedCaseIdsToLink.includes(id))
      const toLink = selectedCaseIdsToLink.filter(id => !originalIds.includes(id))

      if (toUnlink.length > 0) {
        await fetch(`/api/requirements/${selectedReq.id}/unlink-test-cases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testCaseIds: toUnlink })
        })
      }

      if (toLink.length > 0) {
        await fetch(`/api/requirements/${selectedReq.id}/link-test-cases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testCaseIds: toLink })
        })
      }

      setShowLinkModal(false)
      fetchRequirementsData()
      fetchStatsData()
    } catch {
      alert("Failed to update linked test cases")
    } finally {
      setLinking(false)
    }
  }

  // Filter logic
  const filteredRequirements = requirements.filter((req) => {
    const searchLower = search.toLowerCase()
    const matchSearch =
      req.requirementKey.toLowerCase().includes(searchLower) ||
      req.title.toLowerCase().includes(searchLower) ||
      (req.description && req.description.toLowerCase().includes(searchLower))

    if (!matchSearch) return false
    if (modFilter !== "ALL" && req.moduleId !== modFilter) return false
    if (priorityFilter !== "ALL" && req.priority !== priorityFilter) return false
    if (statusFilter !== "ALL" && req.status !== statusFilter) return false
    if (coverageFilter !== "ALL" && req.computedCoverage !== coverageFilter) return false
    if (sourceFilter !== "ALL" && req.source !== sourceFilter) return false

    if (casesFilter === "WITH_CASES" && req.testCases.length === 0) return false
    if (casesFilter === "NO_CASES" && req.testCases.length > 0) return false

    if (bugsFilter === "WITH_BUGS" && req.openBugsCount === 0) return false
    if (bugsFilter === "NO_BUGS" && req.openBugsCount > 0) return false

    return true
  })

  // Format Status badge colors
  const getCoverageBadge = (cov: string) => {
    switch (cov) {
      case "Covered":
        return <span className="text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 px-2.5 py-0.5 rounded-full uppercase">Covered</span>
      case "PartiallyCovered":
        return <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 px-2.5 py-0.5 rounded-full uppercase">Partial</span>
      case "Uncovered":
        return <span className="text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400 px-2.5 py-0.5 rounded-full uppercase">Uncovered</span>
      case "Failed":
        return <span className="text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 px-2.5 py-0.5 rounded-full uppercase">Failed</span>
      case "Blocked":
        return <span className="text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 px-2.5 py-0.5 rounded-full uppercase">Blocked</span>
      case "NotExecuted":
        return <span className="text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 px-2.5 py-0.5 rounded-full uppercase">Not Executed</span>
      default:
        return <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full uppercase">{cov}</span>
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl text-slate-800">
      
      {/* Header breadcrumb & actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-5 gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Requirements Traceability
            </h1>
            <p className="text-sm text-slate-500 mt-1">Directly trace requirement user stories, test cases, and active bugs.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs shadow-md">
            <Plus size={16} /> Create Requirement
          </Button>
          <Button onClick={() => setShowImportModal(true)} variant="outline" className="border-blue-200 hover:bg-blue-50/50 text-blue-700 font-medium flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs">
            <FileSpreadsheet size={16} /> Import Excel
          </Button>
          <Link href={`/projects/${projectId}/generate-from-file`}>
            <Button variant="outline" className="border-violet-200 hover:bg-violet-50/50 text-violet-700 font-medium flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs">
              <Sparkles size={16} /> Generate Test Cases
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/coverage-matrix`}>
            <Button variant="outline" className="border-indigo-200 hover:bg-indigo-50/50 text-indigo-700 font-medium flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs">
              <Layers size={16} /> Traceability Matrix
            </Button>
          </Link>
        </div>
      </div>

      {/* Coverage Widget Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center">
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Requirements</span>
            <span className="text-2xl font-bold text-slate-800 mt-1 block">{stats.total}</span>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center">
            <span className="text-[10px] font-bold text-green-600 block uppercase">Covered</span>
            <span className="text-2xl font-bold text-green-700 mt-1 block">{stats.covered}</span>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center">
            <span className="text-[10px] font-bold text-red-600 block uppercase">Failed</span>
            <span className="text-2xl font-bold text-red-700 mt-1 block">{stats.failed}</span>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center">
            <span className="text-[10px] font-bold text-orange-600 block uppercase">Blocked</span>
            <span className="text-2xl font-bold text-orange-700 mt-1 block">{stats.blocked}</span>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center">
            <span className="text-[10px] font-bold text-slate-500 block uppercase">Uncovered</span>
            <span className="text-2xl font-bold text-slate-600 mt-1 block">{stats.uncovered}</span>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm text-center col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-indigo-600 block uppercase">Coverage Percentage</span>
            <span className="text-2xl font-bold text-indigo-700 mt-1 block">{stats.coveragePercentage}%</span>
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by key, title, description..."
              className="w-full bg-slate-50 border border-slate-200 pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
            />
          </div>
          
          <select
            value={modFilter}
            onChange={(e) => setModFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none text-slate-700"
          >
            <option value="ALL">All Modules</option>
            {projectModules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none text-slate-700"
          >
            <option value="ALL">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="ReadyForTesting">Ready For Testing</option>
            <option value="InTesting">In Testing</option>
            <option value="Deprecated">Deprecated</option>
          </select>

          <select
            value={coverageFilter}
            onChange={(e) => setCoverageFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none text-slate-700"
          >
            <option value="ALL">All Coverage</option>
            <option value="Covered">Covered</option>
            <option value="PartiallyCovered">Partially Covered</option>
            <option value="Uncovered">Uncovered</option>
            <option value="Failed">Failed</option>
            <option value="Blocked">Blocked</option>
            <option value="NotExecuted">Not Executed</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500 pt-2 border-t border-slate-100">
          <span className="mr-2 self-center">Quick Toggles:</span>
          
          <button 
            type="button" 
            onClick={() => setCasesFilter(casesFilter === "NO_CASES" ? "ALL" : "NO_CASES")}
            className={`px-3 py-1 rounded-lg border transition-colors ${casesFilter === "NO_CASES" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}
          >
            No Test Cases
          </button>

          <button 
            type="button" 
            onClick={() => setBugsFilter(bugsFilter === "WITH_BUGS" ? "ALL" : "WITH_BUGS")}
            className={`px-3 py-1 rounded-lg border transition-colors ${bugsFilter === "WITH_BUGS" ? "bg-red-100 text-red-800 border-red-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}
          >
            Has Active Bugs
          </button>
        </div>
      </div>

      {/* Main Grid Table */}
      <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20">
            <Loader2 className="animate-spin text-blue-600 h-10 w-10 mb-4" />
            <p className="text-slate-500 text-sm">Fetching project requirements matrix...</p>
          </div>
        ) : filteredRequirements.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-4">
            <Layers className="mx-auto text-slate-300 h-12 w-12" />
            <p className="text-sm font-semibold">No requirements found matching filters.</p>
            <p className="text-xs text-slate-400">Click &quot;Create Requirement&quot; or &quot;Import Excel&quot; to register manual stories.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-4">Key</th>
                  <th className="p-4">Title</th>
                  <th className="p-4">Module path</th>
                  <th className="p-4">Priority</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Linked Cases</th>
                  <th className="p-4">Coverage Status</th>
                  <th className="p-4">Bugs</th>
                  <th className="p-4">Source</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredRequirements.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-900">{req.requirementKey}</td>
                    <td className="p-4 max-w-xs truncate" title={req.title}>{req.title}</td>
                    <td className="p-4 text-slate-400 text-[11px]">
                      {req.module ? (
                        <span>
                          {req.module.name} 
                          {req.feature && ` / ${req.feature.name}`} 
                          {req.component && ` / ${req.component.name}`}
                        </span>
                      ) : (
                        "Unassigned"
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        req.priority === "Critical" ? "bg-red-50 text-red-700 border border-red-100" :
                        req.priority === "High" ? "bg-orange-50 text-orange-700 border border-orange-100" :
                        "bg-slate-50 text-slate-500 border border-slate-100"
                      }`}>
                        {req.priority}
                      </span>
                    </td>
                    <td className="p-4">{req.status}</td>
                    <td className="p-4">
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-blue-100">
                        {req.testCases.length} case{req.testCases.length !== 1 && "s"}
                      </span>
                    </td>
                    <td className="p-4">{getCoverageBadge(req.computedCoverage)}</td>
                    <td className="p-4">
                      {req.openBugsCount > 0 ? (
                        <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-red-100">
                          {req.openBugsCount} active
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-400">{req.source}</td>
                    <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                      <Link href={`/projects/${projectId}/requirements/${req.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-slate-100 text-slate-500 rounded-lg">
                          <Eye size={14} />
                        </Button>
                      </Link>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => openLinkTestCasesModal(req)} 
                        className="h-7 w-7 p-0 hover:bg-slate-100 text-blue-600 rounded-lg"
                        title="Link Test Cases"
                      >
                        <LinkIcon size={14} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDeleteRequirement(req.id)} 
                        className="h-7 w-7 p-0 hover:bg-slate-100 text-red-600 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal Dialog */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateRequirement} className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Create Requirement</h2>
              <p className="text-xs text-slate-500 mt-1">Register a new manual traceability target.</p>
            </div>
            
            <div className="flex-grow p-6 overflow-y-auto space-y-4 text-slate-700">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Req Key *</label>
                  <input
                    type="text"
                    required
                    value={newReqKey}
                    onChange={(e) => setNewReqKey(e.target.value)}
                    placeholder="REQ-AUTH-001"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Title *</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="User login validation with token credentials"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Description (Optional)</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Requirement details..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 h-16 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Acceptance Criteria (Optional)</label>
                <textarea
                  value={newCriteria}
                  onChange={(e) => setNewCriteria(e.target.value)}
                  placeholder="GIVEN a user... WHEN credentials are valid... THEN login succeeds"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 h-16 resize-none"
                />
              </div>

              {/* Hierarchy coordinates linking */}
              <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <span className="text-xs font-bold text-slate-600 block">Link Hierarchy path (Optional)</span>
                <HierarchySelector
                  projectId={projectId}
                  moduleId={newModuleId}
                  onChangeModuleId={setNewModuleId}
                  featureId={newFeatureId}
                  onChangeFeatureId={setNewFeatureId}
                  componentId={newComponentId}
                  onChangeComponentId={setNewComponentId}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Draft">Draft</option>
                    <option value="ReadyForTesting">Ready For Testing</option>
                    <option value="InTesting">In Testing</option>
                    <option value="Deprecated">Deprecated</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">External System</label>
                  <select
                    value={newExternalSystem}
                    onChange={(e) => setNewExternalSystem(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Jira">Jira</option>
                    <option value="AzureDevOps">Azure DevOps</option>
                    <option value="GitHub">GitHub</option>
                    <option value="Manual">Manual</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">External URL</label>
                  <input
                    type="url"
                    value={newExternalUrl}
                    onChange={(e) => setNewExternalUrl(e.target.value)}
                    placeholder="https://jira-domain.atlassian.net/browse/REQ-1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Figma URL (Optional)</label>
                <input
                  type="url"
                  value={newFigmaUrl}
                  onChange={(e) => setNewFigmaUrl(e.target.value)}
                  placeholder="https://figma.com/file/..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none text-slate-800"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2 shrink-0">
              <Button variant="outline" type="button" onClick={() => setShowCreateModal(false)} className="text-xs h-9 rounded-lg">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow">
                {submitting ? <Loader2 className="animate-spin h-3 w-3" /> : null}
                Save Requirement
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Link Test Cases Modal Dialog */}
      {showLinkModal && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Link Test Cases</h2>
              <p className="text-xs text-slate-500 mt-1">
                Select test cases to associate with <span className="font-bold">{selectedReq.requirementKey}</span>.
              </p>
            </div>

            <div className="flex-grow p-6 overflow-y-auto space-y-3">
              {availableTestCases.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-12">No test cases found in this project.</p>
              ) : (
                availableTestCases.map((tc) => {
                  const isChecked = selectedCaseIdsToLink.includes(tc.id)
                  return (
                    <div
                      key={tc.id}
                      onClick={() => {
                        setSelectedCaseIdsToLink(prev =>
                          prev.includes(tc.id) ? prev.filter(id => id !== tc.id) : [...prev, tc.id]
                        )
                      }}
                      className={`p-3 rounded-xl border cursor-pointer hover:bg-slate-50 transition-colors flex items-center gap-3 ${
                        isChecked ? "bg-blue-50/20 border-blue-200" : "bg-white border-slate-200"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${
                        isChecked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-350 bg-white"
                      }`}>
                        {isChecked && <span className="text-[9px] font-bold">✓</span>}
                      </div>
                      <div className="flex-grow">
                        <span className="text-xs font-semibold text-slate-800 block">{tc.title}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Module: {tc.module || "General"}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2 shrink-0">
              <Button variant="outline" type="button" onClick={() => setShowLinkModal(false)} className="text-xs h-9 rounded-lg">
                Cancel
              </Button>
              <Button 
                onClick={handleLinkTestCases} 
                disabled={linking}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow"
              >
                {linking ? <Loader2 className="animate-spin h-3 w-3" /> : null}
                Save Links
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Spreadsheet Importer trigger */}
      <ImportRequirementsModal
        projectId={projectId}
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportSuccess={() => {
          fetchRequirementsData()
          fetchStatsData()
        }}
      />

      <ConfirmDialog
        open={requirementToDelete !== null}
        title="Delete Requirement"
        description="Are you sure you want to delete this requirement? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDeleteRequirement}
        onCancel={() => setRequirementToDelete(null)}
      />
    </div>
  )
}
