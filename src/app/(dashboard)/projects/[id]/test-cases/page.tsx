"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, FileSpreadsheet, Plus, CheckSquare, Square, Play, Loader2, ExternalLink, AlertTriangle, X } from "lucide-react"
import { ImportModal } from "@/components/test-cases/import-modal"

interface TestStep {
  id: string
  stepNumber: number
  actionDescription: string
  actionType: string
}

interface TestCase {
  id: string
  title: string
  module: string
  priority: string
  source: string
  steps: TestStep[]
}

interface ActiveRun {
  testRunId: string
  projectId: string
  status: string
  currentStep: number | null
  totalSteps: number
}

export default function TestCasesPage() {
  const params = useParams()
  const router = useRouter()
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  
  // Selection and action states
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Permanent delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null)
  const [deleteTypedTitle, setDeleteTypedTitle] = useState("")
  const [deleteRunCount, setDeleteRunCount] = useState(0)
  const [deleteBugCount, setDeleteBugCount] = useState(0)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  // Run status tracking
  const [activeRuns, setActiveRuns] = useState<Map<string, ActiveRun>>(new Map())

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  useEffect(() => {
    fetchTestCases()
  }, [params.id])

  // Poll active runs
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
              fetchTestCases() // refresh after completion
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
        } catch { /* ignore polling errors */ }
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

  async function fetchTestCases() {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/test-cases`)
      const data = await res.json()
      setTestCases(data.testCases || [])
    } catch (err) {
      console.error("Error fetching test cases:", err)
    } finally {
      setLoading(false)
      setSelectedIds([])
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  function toggleSelectAll() {
    if (selectedIds.length === testCases.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(testCases.map((tc) => tc.id))
    }
  }

  // Open permanent delete modal for a single test case
  async function openDeleteModal(tc: TestCase) {
    setDeleteTarget(tc)
    setDeleteTypedTitle("")
    setDeleteError("")
    setDeleteLoading(false)
    // Fetch run and bug counts
    try {
      const [runsRes] = await Promise.all([
        fetch(`/api/projects/${params.id}/test-runs`)
      ])
      if (runsRes.ok) {
        const runsData = await runsRes.json()
        const runs = (runsData.testRuns || []).filter((r: any) => r.testCaseId === tc.id)
        setDeleteRunCount(runs.length)
        // Count bugs from runs
        const bugCount = runs.reduce((acc: number, r: any) => acc + (r.bugReports?.length || 0), 0)
        setDeleteBugCount(bugCount)
      } else {
        setDeleteRunCount(0)
        setDeleteBugCount(0)
      }
    } catch {
      setDeleteRunCount(0)
      setDeleteBugCount(0)
    }
    setDeleteModalOpen(true)
  }

  // Execute permanent delete
  async function executePermanentDelete() {
    if (!deleteTarget) return
    if (deleteTypedTitle !== deleteTarget.title) return

    setDeleteLoading(true)
    setDeleteError("")

    try {
      const res = await fetch(`/api/test-cases/${deleteTarget.id}/permanent-delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmTitle: deleteTypedTitle })
      })

      if (res.ok) {
        const data = await res.json()
        setDeleteModalOpen(false)
        setDeleteTarget(null)
        setToast({ 
          message: `Test case and all related history were permanently deleted. (${data.deleted?.testRuns || 0} runs, ${data.deleted?.steps || 0} steps, ${data.deleted?.bugReports || 0} bugs removed)`,
          type: "success"
        })
        fetchTestCases()
      } else {
        const errData = await res.json()
        setDeleteError(errData.error || "Failed to delete test case")
      }
    } catch {
      setDeleteError("Network error deleting test case")
    } finally {
      setDeleteLoading(false)
    }
  }

  // Handle bulk permanent delete
  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure you want to PERMANENTLY delete ${selectedIds.length} test cases and ALL related data? This cannot be undone.`)) return

    setIsDeleting(true)
    let deletedCount = 0
    let failedCount = 0

    for (const id of selectedIds) {
      const tc = testCases.find(t => t.id === id)
      if (!tc) continue
      try {
        const res = await fetch(`/api/projects/${params.id}/test-cases/${id}`, {
          method: "DELETE",
        })
        if (res.ok) {
          deletedCount++
        } else {
          failedCount++
        }
      } catch {
        failedCount++
      }
    }

    setIsDeleting(false)
    setToast({
      message: `${deletedCount} test case(s) permanently deleted.${failedCount > 0 ? ` ${failedCount} failed.` : ""}`,
      type: failedCount > 0 ? "error" : "success"
    })
    fetchTestCases()
  }

  // Run a test case
  async function handleRunTest(tc: TestCase) {
    if (activeRuns.has(tc.id)) return // prevent duplicate

    try {
      const res = await fetch(`/api/projects/${params.id}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: tc.id })
      })

      if (res.ok) {
        const data = await res.json()
        const newRuns = new Map(activeRuns)
        newRuns.set(tc.id, {
          testRunId: data.testRun.id,
          projectId: params.id as string,
          status: "Queued",
          currentStep: null,
          totalSteps: tc.steps.length
        })
        setActiveRuns(newRuns)
        setToast({ message: `Test run queued for "${tc.title}"`, type: "success" })
      } else {
        const err = await res.json()
        setToast({ message: err.error || "Failed to start test run", type: "error" })
      }
    } catch {
      setToast({ message: "Network error starting test run", type: "error" })
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      Queued: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400",
      Running: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
      Passed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
      Failed: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
      Blocked: "bg-slate-100 text-slate-700 dark:bg-slate-800/30 dark:text-slate-400",
      Warning: "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
      Cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
    }
    return colors[status] || "bg-secondary text-secondary-foreground"
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl shadow-xl border flex items-center gap-3 animate-in slide-in-from-top duration-300 max-w-md ${
          toast.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-800 dark:text-emerald-200" 
            : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/80 dark:border-red-800 dark:text-red-200"
        }`}>
          <span className="text-sm font-medium flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Test Cases</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage, import, and execute test cases for your project
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 border-green-500/30 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/20"
          >
            <FileSpreadsheet className="h-4 w-4" /> Import from Excel
          </Button>
          <Button 
            onClick={() => router.push(`/projects/${params.id}/test-cases/new`)}
            className="bg-primary hover:bg-primary/95 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Create Test Case
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <p className="text-muted-foreground p-6">Loading test cases...</p>
      ) : testCases.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl bg-card/20">
          <p className="text-muted-foreground">No test cases created or imported for this project yet.</p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-500" /> Import from Excel
            </Button>
            <Button
              onClick={() => router.push(`/projects/${params.id}/test-cases/new`)}
            >
              Create your first test case
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* Bulk Action Bar */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl animate-in slide-in-from-top duration-200">
              <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                <CheckSquare className="h-4 w-4" /> {selectedIds.length} test cases selected
              </span>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 h-8 text-xs font-bold"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Permanently ({selectedIds.length})
              </Button>
            </div>
          )}

          {/* Test Case Container Table/List */}
          <div className="border rounded-xl divide-y overflow-hidden bg-card/45 shadow-sm">
            {/* Table Header / Select All */}
            <div className="flex items-center gap-3 p-3 bg-accent/20 border-b select-none">
              <input 
                type="checkbox"
                checked={selectedIds.length === testCases.length && testCases.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus:ring-primary cursor-pointer ml-1"
              />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Select All ({testCases.length})
              </span>
            </div>

            {/* Test Case Rows */}
            {testCases.map((tc) => {
              const activeRun = activeRuns.get(tc.id)
              const isRunning = !!activeRun
              
              return (
                <div
                  key={tc.id}
                  className="flex items-center justify-between p-4 hover:bg-accent/35 transition-colors gap-3 cursor-pointer"
                  onClick={() => router.push(`/projects/${params.id}/test-cases/${tc.id}/edit`)}
                >
                  <div className="flex items-center gap-3 flex-1" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox"
                      checked={selectedIds.includes(tc.id)}
                      onChange={() => toggleSelect(tc.id)}
                      className="h-4 w-4 rounded border-muted-foreground/30 text-primary focus:ring-primary cursor-pointer ml-1"
                    />
                    <div className="cursor-pointer" onClick={() => router.push(`/projects/${params.id}/test-cases/${tc.id}/edit`)}>
                      <p className="font-semibold text-foreground text-sm hover:underline">{tc.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Module: <span className="font-medium text-foreground">{tc.module}</span> · {tc.steps.length} steps · Source: <span className="font-medium text-foreground">{tc.source}</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {/* Run status badge */}
                    {isRunning && (
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide flex items-center gap-1 ${getStatusBadge(activeRun.status)}`}>
                        {activeRun.status === "Running" && <Loader2 className="h-3 w-3 animate-spin" />}
                        {activeRun.status}
                        {activeRun.status === "Running" && activeRun.currentStep && (
                          <span className="ml-1">({activeRun.currentStep}/{activeRun.totalSteps})</span>
                        )}
                      </span>
                    )}
                    
                    {/* Run test button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRunTest(tc)}
                      disabled={isRunning || tc.steps.length === 0}
                      className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                      title={isRunning ? "Test is running..." : tc.steps.length === 0 ? "No steps to run" : "Run Test"}
                    >
                      {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>

                    {/* Open run link */}
                    {isRunning && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/projects/${params.id}/test-runs/${activeRun.testRunId}`)}
                        className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400"
                        title="Open Run"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide ${
                      tc.priority === "Critical" ? "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400" :
                      tc.priority === "High" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400" :
                      tc.priority === "Medium" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400" :
                      "bg-secondary text-secondary-foreground"
                    }`}>
                      {tc.priority}
                    </span>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDeleteModal(tc)}
                      disabled={isDeleting}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                      title="Delete Permanently"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {deleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { if (!deleteLoading) { setDeleteModalOpen(false); setDeleteTarget(null) } }}>
          <div className="bg-card border border-red-300 dark:border-red-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-950/40 rounded-xl shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Permanently delete this test case?</h3>
                <p className="text-sm text-muted-foreground mt-1">This action will permanently delete:</p>
              </div>
            </div>

            <ul className="text-sm text-muted-foreground space-y-1 pl-4 list-disc">
              <li>The test case</li>
              <li>All test steps</li>
              <li>All execution history</li>
              <li>All test runs</li>
              <li>All step results</li>
              <li>All screenshots</li>
              <li>All logs</li>
              <li>All attachments</li>
              <li>Related bug reports if they belong only to this test case</li>
            </ul>

            {(deleteRunCount > 0 || deleteBugCount > 0) && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Warning: This test case has {deleteRunCount} execution run{deleteRunCount !== 1 ? "s" : ""} and {deleteBugCount} linked bug{deleteBugCount !== 1 ? "s" : ""}. Deleting it will remove all related evidence permanently.
                </p>
              </div>
            )}

            <p className="text-sm font-bold text-red-600 dark:text-red-400">This action cannot be undone.</p>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                To confirm, type the test case title: <span className="font-bold text-red-600 dark:text-red-400">"{deleteTarget.title}"</span>
              </label>
              <Input
                value={deleteTypedTitle}
                onChange={(e) => setDeleteTypedTitle(e.target.value)}
                placeholder="Type the test case title to confirm"
                className="border-red-300 dark:border-red-700 focus-visible:ring-red-500"
                disabled={deleteLoading}
              />
            </div>

            {deleteError && (
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{deleteError}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => { setDeleteModalOpen(false); setDeleteTarget(null) }}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={executePermanentDelete}
                disabled={deleteTypedTitle !== deleteTarget.title || deleteLoading}
                className="flex items-center gap-2"
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete Permanently
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      <ImportModal
        projectId={params.id as string}
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={fetchTestCases}
      />
    </div>
  )
}
