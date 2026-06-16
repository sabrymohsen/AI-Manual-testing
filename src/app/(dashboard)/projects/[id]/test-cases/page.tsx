"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Trash2, FileSpreadsheet, Plus, CheckSquare, Square } from "lucide-react"
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

export default function TestCasesPage() {
  const params = useParams()
  const router = useRouter()
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  
  // Selection and action states
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    fetchTestCases()
  }, [params.id])

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
      setSelectedIds([]) // Reset selections
    }
  }

  // Toggle selection for an individual test case
  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  // Toggle select all test cases
  function toggleSelectAll() {
    if (selectedIds.length === testCases.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(testCases.map((tc) => tc.id))
    }
  }

  // Handle deletion of a single test case
  async function handleDeleteTestCase(id: string) {
    if (!confirm("Are you sure you want to delete this test case?")) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/test-cases/${id}`, {
        method: "DELETE",
      })

      if (res.ok) {
        fetchTestCases()
      } else {
        alert("Failed to delete test case.")
      }
    } catch {
      alert("Network error deleting test case.")
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle bulk deletion of selected test cases
  async function handleBulkDelete() {
    if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected test cases?`)) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/test-cases`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      })

      if (res.ok) {
        fetchTestCases()
      } else {
        alert("Failed to delete selected test cases.")
      }
    } catch {
      alert("Network error executing bulk delete.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      
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
                <CheckSquare className="h-4 w-4" /> {selectedIds.length} test cases selected for bulk deletion
              </span>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 h-8 text-xs font-bold"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Selected ({selectedIds.length})
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
            {testCases.map((tc) => (
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
                
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
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
                    onClick={() => handleDeleteTestCase(tc.id)}
                    disabled={isDeleting}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                    title="Delete Test Case"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
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
