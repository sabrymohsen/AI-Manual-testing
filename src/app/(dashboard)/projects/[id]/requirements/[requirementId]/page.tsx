"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BackButton } from "@/components/ui/back-button"
import {
  Compass,
  Sparkles,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Trash2,
  Plus,
  Layers,
  ChevronRight,
  ShieldAlert,
  Bug,
  Save,
  Check,
  ChevronLeft
} from "lucide-react"
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
  featureId: string | null
  feature: { id: string; name: string } | null
  component: { id: string; name: string } | null
  figmaUrl: string | null
  externalUrl: string | null
  externalSystem: string | null
  breadcrumbPath: string
  computedCoverage: "Uncovered" | "PartiallyCovered" | "Covered" | "Failed" | "Blocked" | "NotExecuted"
  openBugsCount: number
  testCases: Array<{
    id: string
    testCaseId: string
    testCase: {
      id: string
      title: string
      priority: string
      testRuns: Array<{ completedAt: string; status: string }>
      manualSessionCases: Array<{ completedAt: string; status: string }>
      bugReports: Array<{ id: string; title: string; severity: string }>
    }
  }>
  bugReports: Array<{
    id: string
    bugReport: {
      id: string
      title: string
      severity: string
      priority: string
      createdAt: string
    }
  }>
}

interface GeneratedCase {
  title: string
  preconditions: string
  priority: string
  steps: Array<{
    actionDescription: string
    expectedResult: string
    actionType: string
    targetType: string
    targetValue: string
    inputValue: string
  }>
}

export default function RequirementDetails() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const requirementId = params.requirementId as string

  const [requirement, setRequirement] = useState<Requirement | null>(null)
  // Bulk bug linking (dormant link-bugs/unlink-bugs endpoints)
  const [showLinkBugsModal, setShowLinkBugsModal] = useState(false)
  const [projectBugs, setProjectBugs] = useState<any[]>([])
  const [selectedBugIdsToLink, setSelectedBugIdsToLink] = useState<string[]>([])
  const [bugLinkSaving, setBugLinkSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  // Edit fields
  const [editTitle, setEditTitle] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [editCriteria, setEditCriteria] = useState("")
  const [editStatus, setEditStatus] = useState("Draft")
  const [editPriority, setEditPriority] = useState("Medium")
  const [editFigmaUrl, setEditFigmaUrl] = useState("")
  const [editExternalUrl, setEditExternalUrl] = useState("")
  const [editExternalSystem, setEditExternalSystem] = useState("Jira")
  const [saving, setSaving] = useState(false)

  // AI Generation panel
  const [showAiDraftPanel, setShowAiDraftPanel] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [draftCases, setDraftCases] = useState<GeneratedCase[]>([])
  const [selectedDraftIndices, setSelectedDraftIndices] = useState<number[]>([])
  const [savingDrafts, setSavingDrafts] = useState(false)
  const [caseToUnlink, setCaseToUnlink] = useState<string | null>(null)

  useEffect(() => {
    fetchRequirementDetails()
  }, [requirementId])

  const fetchRequirementDetails = async () => {
    try {
      const res = await fetch(`/api/requirements/${requirementId}`)
      if (res.ok) {
        const data = await res.json()
        setRequirement(data.requirement)
        
        // Populate edit forms
        setEditTitle(data.requirement.title)
        setEditDesc(data.requirement.description || "")
        setEditCriteria(data.requirement.acceptanceCriteria || "")
        setEditStatus(data.requirement.status)
        setEditPriority(data.requirement.priority)
        setEditFigmaUrl(data.requirement.figmaUrl || "")
        setEditExternalUrl(data.requirement.externalUrl || "")
        setEditExternalSystem(data.requirement.externalSystem || "Jira")
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  const handleUpdateRequirement = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const res = await fetch(`/api/requirements/${requirementId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDesc,
          acceptanceCriteria: editCriteria,
          status: editStatus,
          priority: editPriority,
          figmaUrl: editFigmaUrl,
          externalUrl: editExternalUrl,
          externalSystem: editExternalSystem
        })
      })

      if (res.ok) {
        setEditing(false)
        fetchRequirementDetails()
      } else {
        alert("Failed to update requirement details")
      }
    } catch {
      alert("Error updating requirement")
    } finally {
      setSaving(false)
    }
  }

  const handleUnlinkTestCase = (caseId: string) => {
    setCaseToUnlink(caseId)
  }

  const confirmUnlinkTestCase = async () => {
    if (!caseToUnlink) return
    const res = await fetch(`/api/requirements/${requirementId}/unlink-test-cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCaseIds: [caseToUnlink] })
    })

    if (!res.ok) {
      throw new Error("Failed to unlink test case")
    }
    setCaseToUnlink(null)
    fetchRequirementDetails()
  }

  // AI Test Case draft compiler
  const handleAiGenerateTestCases = async () => {
    setGenerating(true)
    setShowAiDraftPanel(true)
    setDraftCases([])
    setSelectedDraftIndices([])

    try {
      const res = await fetch(`/api/requirements/${requirementId}/generate-test-cases`, {
        method: "POST"
      })

      if (!res.ok) throw new Error("AI request failed")
      const data = await res.json()
      setDraftCases(data.testCases || [])
      setSelectedDraftIndices((data.testCases || []).map((_: any, idx: number) => idx))
    } catch (err: any) {
      alert("AI Generation failed: " + err.message)
      setShowAiDraftPanel(false)
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveDraftCases = async () => {
    if (selectedDraftIndices.length === 0) return
    setSavingDrafts(true)

    try {
      let createdCount = 0
      for (const idx of selectedDraftIndices) {
        const dCase = draftCases[idx]
        if (!dCase) continue

        // 1. Create the Test Case
        const tcRes = await fetch(`/api/projects/${projectId}/test-cases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: dCase.title,
            priority: dCase.priority || "Medium",
            preconditions: dCase.preconditions || "",
            featureId: requirement?.featureId || null,
            steps: dCase.steps.map((st, sIdx) => ({
              stepNumber: sIdx + 1,
              actionDescription: st.actionDescription,
              expectedResult: st.expectedResult,
              actionType: st.actionType || "custom_instruction",
              targetType: st.targetType || "none",
              targetValue: st.targetValue || "",
              inputValue: st.inputValue || ""
            }))
          })
        })

        if (tcRes.ok) {
          const tcData = await tcRes.json()
          
          // 2. Link to this Requirement
          await fetch(`/api/requirements/${requirementId}/link-test-cases`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ testCaseIds: [tcData.testCase.id] })
          })
          createdCount++
        }
      }

      alert(`Successfully saved and linked ${createdCount} test cases!`)
      setShowAiDraftPanel(false)
      fetchRequirementDetails()
    } catch {
      alert("Failed to save draft cases")
    } finally {
      setSavingDrafts(false)
    }
  }

  // Get coverage badge
  const getCoverageBadge = (cov: string) => {
    switch (cov) {
      case "Covered":
        return <span className="text-xs font-bold bg-green-150 text-green-800 px-3 py-1 rounded-full uppercase">Covered</span>
      case "PartiallyCovered":
        return <span className="text-xs font-bold bg-yellow-150 text-yellow-800 px-3 py-1 rounded-full uppercase">Partial Coverage</span>
      case "Uncovered":
        return <span className="text-xs font-bold bg-slate-100 text-slate-600 px-3 py-1 rounded-full uppercase">Uncovered</span>
      case "Failed":
        return <span className="text-xs font-bold bg-red-150 text-red-800 px-3 py-1 rounded-full uppercase animate-pulse">Failed</span>
      case "Blocked":
        return <span className="text-xs font-bold bg-orange-150 text-orange-800 px-3 py-1 rounded-full uppercase">Blocked</span>
      case "NotExecuted":
        return <span className="text-xs font-bold bg-blue-150 text-blue-800 px-3 py-1 rounded-full uppercase">Not Executed</span>
      default:
        return <span className="text-xs font-bold bg-slate-100 text-slate-500 px-3 py-1 rounded-full uppercase">{cov}</span>
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 bg-slate-50/50 min-h-screen text-slate-400">
        <Loader2 className="animate-spin text-blue-600 h-10 w-10 mb-4" />
        <p className="text-slate-500 font-medium">Fetching requirement traceability coordinates...</p>
      </div>
    )
  }

  if (!requirement) {
    return (
      <div className="p-8 text-center text-red-600 min-h-screen bg-slate-50">
        ⚠️ Requirement not found.
      </div>
    )
  }

  const openLinkBugsModal = async () => {
    if (!requirement) return
    setSelectedBugIdsToLink(requirement.bugReports.map((l: any) => l.bugReport.id))
    setShowLinkBugsModal(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/bug-reports`)
      if (res.ok) {
        const data = await res.json()
        setProjectBugs(data.bugReports || data.items || [])
      }
    } catch {}
  }

  const handleSaveBugLinks = async () => {
    if (!requirement) return
    setBugLinkSaving(true)
    try {
      const originalIds = requirement.bugReports.map((l: any) => l.bugReport.id)
      const toUnlink = originalIds.filter((id: string) => !selectedBugIdsToLink.includes(id))
      const toLink = selectedBugIdsToLink.filter((id: string) => !originalIds.includes(id))
      if (toUnlink.length > 0) {
        await fetch(`/api/requirements/${requirementId}/unlink-bugs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bugReportIds: toUnlink })
        })
      }
      if (toLink.length > 0) {
        await fetch(`/api/requirements/${requirementId}/link-bugs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bugReportIds: toLink })
        })
      }
      setShowLinkBugsModal(false)
      fetchRequirementDetails()
    } catch {
      alert("Failed to update linked bugs")
    } finally {
      setBugLinkSaving(false)
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl text-slate-800">
      
      {/* Header Path Breadcrumb */}
      <div className="flex items-center gap-3 border-b pb-5">
        <BackButton />
        <div>
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Project</span>
            <ChevronRight size={10} />
            <span>Requirements</span>
            <ChevronRight size={10} />
            <span>{requirement.requirementKey}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            {requirement.requirementKey} — {requirement.title}
          </h1>
          {requirement.breadcrumbPath && (
            <p className="text-xs text-slate-500 font-medium mt-1">Hierarchy: {requirement.breadcrumbPath}</p>
          )}
        </div>
      </div>

      {/* Grid Layout: Config panel + Details card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Requirement Information & Acceptance criteria */}
        <div className="lg:col-span-2 space-y-6">
          {editing ? (
            <form onSubmit={handleUpdateRequirement} className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm border-b pb-2">Edit Requirement Details</h3>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 h-20 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Acceptance Criteria</label>
                <textarea
                  value={editCriteria}
                  onChange={(e) => setEditCriteria(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 h-20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Draft">Draft</option>
                    <option value="ReadyForTesting">Ready For Testing</option>
                    <option value="InTesting">In Testing</option>
                    <option value="Deprecated">Deprecated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">External System</label>
                  <select
                    value={editExternalSystem}
                    onChange={(e) => setEditExternalSystem(e.target.value)}
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
                  <label className="block text-xs font-semibold text-slate-500 mb-1">External URL</label>
                  <input
                    type="url"
                    value={editExternalUrl}
                    onChange={(e) => setEditExternalUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Figma URL</label>
                <input
                  type="url"
                  value={editFigmaUrl}
                  onChange={(e) => setEditFigmaUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none text-slate-800"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <Button variant="outline" type="button" onClick={() => setEditing(false)} className="text-xs h-9 rounded-lg">
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow">
                  {saving ? <Loader2 className="animate-spin h-3 w-3" /> : null}
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-start border-b pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Requirement Overview</h3>
                  <p className="text-xs text-slate-400 mt-1">Source type: {requirement.source}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="text-xs h-8 px-3 rounded-lg border-slate-200">
                  Edit Details
                </Button>
              </div>

              {requirement.description && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Description</span>
                  <p className="text-xs text-slate-650 whitespace-pre-wrap leading-relaxed">{requirement.description}</p>
                </div>
              )}

              {requirement.acceptanceCriteria && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2.5">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Acceptance Criteria</span>
                  <p className="text-xs font-mono text-slate-700 leading-relaxed whitespace-pre-wrap">{requirement.acceptanceCriteria}</p>
                </div>
              )}

              {requirement.figmaUrl && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Figma Design frame</span>
                    <a href={requirement.figmaUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1">
                      Open in Figma <ExternalLink size={12} />
                    </a>
                  </div>
                  {/* Embedded Figma frame */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm h-64 bg-slate-50">
                    <iframe
                      className="w-full h-full border-0"
                      src={`https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(requirement.figmaUrl)}`}
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Linked Test Cases table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">Linked Test Cases ({requirement.testCases.length})</h3>
                <p className="text-xs text-slate-400 mt-1">Cases validating this requirement</p>
              </div>
              <Button onClick={handleAiGenerateTestCases} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs shadow-md">
                <Sparkles size={14} /> AI Generate Cases
              </Button>
            </div>

            {requirement.testCases.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-12">No test cases linked to this requirement yet. Use &quot;AI Generate Cases&quot; to start.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="p-3">Test Case</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Latest Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {requirement.testCases.map((link) => {
                      const tc = link.testCase
                      const latestRun = tc.testRuns?.[0] || null
                      const latestManualCase = tc.manualSessionCases?.[0] || null

                      let latestStatus = "NotExecuted"
                      let latestTime: string | null = null

                      if (latestRun && latestRun.completedAt) {
                        latestTime = new Date(latestRun.completedAt).toLocaleString()
                        latestStatus = latestRun.status
                      }

                      if (latestManualCase && latestManualCase.completedAt) {
                        const mTime = new Date(latestManualCase.completedAt).getTime()
                        const rTime = latestRun && latestRun.completedAt ? new Date(latestRun.completedAt).getTime() : 0
                        if (mTime > rTime) {
                          latestTime = new Date(latestManualCase.completedAt).toLocaleString()
                          latestStatus = latestManualCase.status
                        }
                      }

                      return (
                        <tr key={link.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3">
                            <Link href={`/projects/${projectId}/test-cases/${tc.id}/edit`} className="font-bold text-blue-600 hover:underline">
                              {tc.title}
                            </Link>
                          </td>
                          <td className="p-3">
                            <span className="text-[10px] font-semibold">{tc.priority}</span>
                          </td>
                          <td className="p-3">
                            {latestStatus === "Passed" ? <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase">Passed</span> :
                             latestStatus === "Failed" ? <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full uppercase">Failed</span> :
                             latestStatus === "Blocked" ? <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full uppercase">Blocked</span> :
                             <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase">Not Executed</span>}
                            {latestTime && <span className="text-[10px] text-slate-400 block mt-1">{latestTime}</span>}
                          </td>
                          <td className="p-3 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleUnlinkTestCase(tc.id)} 
                              className="h-7 w-7 p-0 hover:bg-slate-100 text-red-650 rounded-lg"
                              title="Unlink test case"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Status metrics & external systems */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2.5">Coverage Status</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Calculated Metrics:</span>
              {getCoverageBadge(requirement.computedCoverage)}
            </div>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-500">Linked Bugs count:</span>
              <span className={`font-bold ${requirement.openBugsCount > 0 ? "text-red-600" : "text-slate-500"}`}>
                {requirement.openBugsCount} active
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2.5">Priority / Status</h3>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Priority:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                requirement.priority === "Critical" ? "bg-red-50 text-red-700" :
                requirement.priority === "High" ? "bg-orange-50 text-orange-700" :
                "bg-slate-50 text-slate-500"
              }`}>{requirement.priority}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Workflow Status:</span>
              <span className="font-semibold text-slate-800">{requirement.status}</span>
            </div>
          </div>

          {requirement.externalUrl && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2.5">External Integration</h3>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Link target:</span>
                <span className="font-bold text-slate-850">{requirement.externalSystem}</span>
              </div>
              <a href={requirement.externalUrl} target="_blank" rel="noreferrer" className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors mt-2">
                Open in {requirement.externalSystem} <ExternalLink size={12} />
              </a>
            </div>
          )}

          {/* Related Bugs list */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-2.5 flex items-center justify-between gap-1">
              <span className="flex items-center gap-1"><Bug size={14} className="text-red-500" /> Related Bugs ({requirement.bugReports.length})</span>
              <button onClick={openLinkBugsModal} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 normal-case">
                Link Bugs
              </button>
            </h3>

            {requirement.bugReports.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No open bugs linked to this requirement.</p>
            ) : (
              <div className="space-y-2">
                {requirement.bugReports.map((link) => (
                  <div key={link.id} className="p-3 bg-red-50/15 border border-red-100 rounded-xl flex items-center justify-between text-xs hover:bg-red-50/30 transition-colors">
                    <div className="max-w-[180px]">
                      <span className="font-semibold text-slate-800 block truncate">{link.bugReport.title}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Severity: {link.bugReport.severity}</span>
                    </div>
                    <Link href={`/projects/${projectId}/bug-reports/${link.bugReport.id}`} className="text-blue-600 hover:underline">
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Link Bugs modal — bulk link/unlink via BugReportRequirement */}
      {showLinkBugsModal && requirement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Link Bugs</h2>
              <p className="text-xs text-slate-500 mt-1">
                Select bugs to associate with <span className="font-bold">{requirement.requirementKey}</span> — {selectedBugIdsToLink.length} selected.
              </p>
            </div>
            <div className="flex-grow p-6 overflow-y-auto space-y-2">
              {projectBugs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-12">No bugs found in this project.</p>
              ) : (
                projectBugs.map((bug: any) => {
                  const isChecked = selectedBugIdsToLink.includes(bug.id)
                  return (
                    <div
                      key={bug.id}
                      onClick={() =>
                        setSelectedBugIdsToLink(prev =>
                          prev.includes(bug.id) ? prev.filter(id => id !== bug.id) : [...prev, bug.id]
                        )
                      }
                      className={`p-3 rounded-xl border cursor-pointer hover:bg-slate-50 transition-colors flex items-center gap-3 ${
                        isChecked ? "bg-red-50/20 border-red-200" : "bg-white border-slate-200"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                        isChecked ? "border-red-600 bg-red-600 text-white" : "border-slate-300 bg-white"
                      }`}>
                        {isChecked && <span className="text-[9px] font-bold">✓</span>}
                      </div>
                      <div className="flex-grow min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate">{bug.bugKey ? `${bug.bugKey} — ` : ""}{bug.title}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">{bug.severity} · {bug.status}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2 shrink-0">
              <button onClick={() => setShowLinkBugsModal(false)} className="text-xs h-9 px-4 rounded-lg border border-slate-200 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={handleSaveBugLinks}
                disabled={bugLinkSaving}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow disabled:opacity-50"
              >
                {bugLinkSaving ? "Saving…" : "Save Links"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Generate draft review drawer panel */}
      {showAiDraftPanel && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-250">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="text-blue-600" size={16} fill="blue" /> AI Draft Test Cases
              </h2>
              <p className="text-xs text-slate-500 mt-1">Suggested draft verification coordinates for this story.</p>
            </div>
            <button onClick={() => setShowAiDraftPanel(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1">&times;</button>
          </div>

          <div className="flex-grow p-6 overflow-y-auto space-y-6">
            {generating ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="animate-spin text-blue-600 h-10 w-10 mb-4" />
                <p className="text-sm font-semibold">LLM is generating draft cases...</p>
                <p className="text-xs text-slate-400 mt-1">Analyzing criteria variables, constraints, and steps...</p>
              </div>
            ) : draftCases.length === 0 ? (
              <div className="text-center py-12 text-slate-400 italic">No cases generated. Click retry or check OpenAI credentials.</div>
            ) : (
              <div className="space-y-4">
                {draftCases.map((dCase, index) => {
                  const isChecked = selectedDraftIndices.includes(index)
                  return (
                    <div
                      key={index}
                      className={`border rounded-xl p-4 bg-slate-50/30 space-y-3 ${
                        isChecked ? "border-blue-500 bg-blue-50/5" : "border-slate-200"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedDraftIndices(prev =>
                                prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
                              )
                            }}
                            className="mt-1 h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          <div>
                            <span className="font-bold text-xs text-slate-800 block">{dCase.title}</span>
                            {dCase.preconditions && (
                              <span className="text-[10px] text-slate-400 block mt-1">Preconditions: {dCase.preconditions}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded">
                          {dCase.priority}
                        </span>
                      </div>

                      {/* Steps checklist */}
                      <div className="border-t border-slate-100 pt-2.5 space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Generated Steps</span>
                        {dCase.steps.map((st, sIdx) => (
                          <div key={sIdx} className="text-xs bg-white border border-slate-150 p-2.5 rounded-lg flex items-start gap-2">
                            <span className="font-bold text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">Step {sIdx + 1}</span>
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-700">{st.actionDescription}</p>
                              <p className="text-[10px] text-slate-400">Expected: {st.expectedResult}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2 shrink-0 px-6">
            <Button variant="outline" type="button" onClick={() => setShowAiDraftPanel(false)} className="text-xs h-9 rounded-lg">
              Cancel
            </Button>
            <Button
              type="button"
              disabled={generating || savingDrafts || selectedDraftIndices.length === 0}
              onClick={handleSaveDraftCases}
              className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold h-9 px-5 rounded-lg flex items-center gap-1.5 shadow"
            >
              {savingDrafts ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Save size={14} />}
              Save & Link Selected Cases
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={caseToUnlink !== null}
        title="Unlink Test Case"
        description="Are you sure you want to remove the connection between this requirement and the test case?"
        variant="warning"
        confirmLabel="Unlink"
        onConfirm={confirmUnlinkTestCase}
        onCancel={() => setCaseToUnlink(null)}
      />
    </div>
  )
}
