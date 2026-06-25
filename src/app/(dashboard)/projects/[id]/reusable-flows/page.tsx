"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Plus, Trash2, Edit, Save, MoveUp, MoveDown, Layers, Folder, Play } from "lucide-react"
import { BackButton } from "@/components/ui/back-button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface ReusableStep {
  id?: string
  stepNumber: number
  actionDescription: string
  expectedResult: string | null
  actionType: string
  targetType: string
  targetValue: string | null
  inputValue: string | null
}

interface ReusableStepFlow {
  id: string
  name: string
  description: string | null
  category: string | null
  steps: ReusableStep[]
}

const ACTION_TYPES = [
  { value: "open_url", label: "Open URL" },
  { value: "click", label: "Click" },
  { value: "fill", label: "Fill Input" },
  { value: "select", label: "Select Option" },
  { value: "upload_file", label: "Upload File" },
  { value: "wait_for_text", label: "Wait for Text" },
  { value: "wait_for_url", label: "Wait for URL" },
  { value: "assert_visible", label: "Assert Visible" },
  { value: "assert_hidden", label: "Assert Hidden" },
  { value: "assert_text", label: "Assert Text" },
  { value: "assert_url", label: "Assert URL" },
  { value: "assert_api_status", label: "Assert API Status" },
  { value: "screenshot", label: "Screenshot" },
  { value: "custom_instruction", label: "Custom Instruction" }
]

const TARGET_TYPES = [
  { value: "none", label: "None" },
  { value: "test_id", label: "Test ID" },
  { value: "role", label: "Role" },
  { value: "text", label: "Text Content" },
  { value: "label", label: "Label" },
  { value: "placeholder", label: "Placeholder" },
  { value: "css", label: "CSS Selector" },
  { value: "xpath", label: "XPath" },
  { value: "url", label: "URL" }
]

export default function ReusableFlowsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [flows, setFlows] = useState<ReusableStepFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editor states
  const [selectedFlow, setSelectedFlow] = useState<ReusableStepFlow | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Form states
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("General")
  const [steps, setSteps] = useState<ReusableStep[]>([])
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null)

  useEffect(() => {
    fetchFlows()
  }, [projectId])

  const fetchFlows = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/reusable-flows`)
      if (!res.ok) throw new Error("Failed to fetch reusable flows")
      const data = await res.json()
      setFlows(data)
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCreate = () => {
    setIsCreating(true)
    setIsEditing(false)
    setName("")
    setDescription("")
    setCategory("General")
    setSteps([
      {
        stepNumber: 1,
        actionDescription: "",
        expectedResult: "",
        actionType: "click",
        targetType: "none",
        targetValue: "",
        inputValue: ""
      }
    ])
  }

  const handleOpenEdit = (flow: ReusableStepFlow) => {
    setSelectedFlow(flow)
    setIsEditing(true)
    setIsCreating(false)
    setName(flow.name)
    setDescription(flow.description || "")
    setCategory(flow.category || "General")
    setSteps(flow.steps.length > 0 ? [...flow.steps] : [
      {
        stepNumber: 1,
        actionDescription: "",
        expectedResult: "",
        actionType: "click",
        targetType: "none",
        targetValue: "",
        inputValue: ""
      }
    ])
  }

  const handleAddStep = () => {
    const nextNum = steps.length + 1
    setSteps([
      ...steps,
      {
        stepNumber: nextNum,
        actionDescription: "",
        expectedResult: "",
        actionType: "click",
        targetType: "none",
        targetValue: "",
        inputValue: ""
      }
    ])
  }

  const handleRemoveStep = (index: number) => {
    const filtered = steps.filter((_, idx) => idx !== index)
    // Reindex step numbers
    const updated = filtered.map((step, idx) => ({
      ...step,
      stepNumber: idx + 1
    }))
    setSteps(updated)
  }

  const handleStepChange = (index: number, field: keyof ReusableStep, val: any) => {
    const updated = [...steps]
    updated[index] = {
      ...updated[index],
      [field]: val
    }
    setSteps(updated)
  }

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return
    if (direction === "down" && index === steps.length - 1) return

    const updated = [...steps]
    const swapTarget = direction === "up" ? index - 1 : index + 1
    const temp = updated[index]
    updated[index] = updated[swapTarget]
    updated[swapTarget] = temp

    // Re-index step numbers
    const reindexed = updated.map((step, idx) => ({
      ...step,
      stepNumber: idx + 1
    }))
    setSteps(reindexed)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return

    setError(null)
    const payload = {
      name,
      description,
      category,
      steps
    }

    try {
      let url = `/api/projects/${projectId}/reusable-flows`
      let method = "POST"

      if (isEditing && selectedFlow) {
        url = `/api/reusable-flows/${selectedFlow.id}`
        method = "PUT"
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error("Failed to save flow")

      setIsEditing(false)
      setIsCreating(false)
      setSelectedFlow(null)
      fetchFlows()
    } catch (err: any) {
      setError(err.message || "Failed to save flow")
    }
  }

  const handleDelete = (flowId: string) => {
    setFlowToDelete(flowId)
  }

  const confirmDeleteFlow = async () => {
    if (!flowToDelete) return
    setError(null)
    const res = await fetch(`/api/reusable-flows/${flowToDelete}`, {
      method: "DELETE"
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || "Failed to delete flow")
    }
    setFlowToDelete(null)
    fetchFlows()
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Reusable Step Library
            </h1>
            <p className="text-slate-500">
              Create and manage step workflows that can be reused across test cases.
            </p>
          </div>
        </div>

        {!(isCreating || isEditing) && (
          <Button onClick={handleOpenCreate} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium flex items-center gap-2 shadow-md hover:shadow-lg transition-all duration-200">
            <Plus size={18} /> New Reusable Flow
          </Button>
        )}
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {isCreating || isEditing ? (
        <form onSubmit={handleSave} className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6 max-w-5xl mx-auto transition-all duration-200">
          <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2 border-b pb-4">
            <Layers className="text-blue-500" />
            {isCreating ? "Create New Reusable Flow" : "Edit Reusable Flow"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Flow Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Login as Administrator"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Authentication"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
              />
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide context for when to use this reusable flow..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 h-20 resize-none"
            />
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                Steps Sequence ({steps.length})
              </h3>
              <Button type="button" variant="outline" onClick={handleAddStep} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 border-blue-200 flex items-center gap-1.5 rounded-lg py-1.5 px-3">
                <Plus size={16} /> Add Step
              </Button>
            </div>

            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={idx} className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl relative flex flex-col gap-4 group hover:border-slate-300 transition-all duration-150">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm bg-slate-200 text-slate-700 rounded-full px-2.5 py-0.5">
                      Step {step.stepNumber}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleMoveStep(idx, "up")} disabled={idx === 0} className="text-slate-400 hover:text-slate-700 p-1">
                        <MoveUp size={16} />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleMoveStep(idx, "down")} disabled={idx === steps.length - 1} className="text-slate-400 hover:text-slate-700 p-1">
                        <MoveDown size={16} />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveStep(idx)} disabled={steps.length <= 1} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-md">
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Action Description</label>
                      <input
                        type="text"
                        required
                        value={step.actionDescription}
                        onChange={(e) => handleStepChange(idx, "actionDescription", e.target.value)}
                        placeholder="Click login, fill credentials, etc."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Expected Result (Optional)</label>
                      <input
                        type="text"
                        value={step.expectedResult || ""}
                        onChange={(e) => handleStepChange(idx, "expectedResult", e.target.value)}
                        placeholder="Expected outcome"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Action Type</label>
                      <select
                        value={step.actionType}
                        onChange={(e) => handleStepChange(idx, "actionType", e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-800"
                      >
                        {ACTION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Target Type</label>
                      <select
                        value={step.targetType}
                        onChange={(e) => handleStepChange(idx, "targetType", e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-800"
                      >
                        {TARGET_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Target Value (Optional)</label>
                      <input
                        type="text"
                        value={step.targetValue || ""}
                        onChange={(e) => handleStepChange(idx, "targetValue", e.target.value)}
                        placeholder="Selector, role name, etc."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Input Value (Optional)</label>
                      <input
                        type="text"
                        value={step.inputValue || ""}
                        onChange={(e) => handleStepChange(idx, "inputValue", e.target.value)}
                        placeholder="Text to type / select value"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 border-t pt-6 justify-end">
            <Button type="button" variant="outline" onClick={() => { setIsEditing(false); setIsCreating(false); }} className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50">
              Cancel
            </Button>
            <Button type="submit" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium px-6 rounded-xl flex items-center gap-1.5">
              <Save size={18} /> Save Flow
            </Button>
          </div>
        </form>
      ) : (
        <div>
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 bg-slate-50/50 border border-slate-200/50 rounded-2xl">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-slate-500 text-sm">Loading Reusable Steps Library...</p>
            </div>
          ) : flows.length === 0 ? (
            <div className="text-center p-16 bg-slate-50/50 border border-slate-200/60 rounded-2xl shadow-sm max-w-xl mx-auto">
              <Layers size={48} className="mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-bold text-slate-800 mb-1">No Reusable Flows Yet</h3>
              <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
                Save common navigation steps, API login routines, or dashboard processes and use them inside test cases with one click.
              </p>
              <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center gap-2 mx-auto">
                <Plus size={18} /> Create Your First Flow
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {flows.map((flow) => (
                <div key={flow.id} className="bg-white border border-slate-200/70 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 flex items-center gap-1">
                        <Folder size={12} /> {flow.category || "General"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {flow.steps.length} {flow.steps.length === 1 ? "step" : "steps"}
                      </span>
                    </div>

                    <h3 className="font-bold text-lg text-slate-800 mb-1.5 group-hover:text-blue-600 transition-colors">
                      {flow.name}
                    </h3>
                    <p className="text-sm text-slate-500 line-clamp-2 mb-4">
                      {flow.description || "No description provided for this reusable step flow."}
                    </p>

                    <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-3 mb-6 max-h-32 overflow-y-auto space-y-2">
                      {flow.steps.map((step) => (
                        <div key={step.id || step.stepNumber} className="flex gap-2 text-xs text-slate-600">
                          <span className="font-semibold text-slate-400 min-w-4 text-right">{step.stepNumber}.</span>
                          <span className="truncate flex-1 font-medium">{step.actionDescription}</span>
                          <span className="text-[10px] text-slate-400 italic bg-slate-200/50 rounded px-1">{step.actionType}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t pt-4">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(flow)} className="text-slate-600 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg py-1 px-3.5 flex items-center gap-1">
                      <Edit size={14} /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(flow.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg py-1 px-3.5 flex items-center gap-1">
                      <Trash2 size={14} /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={flowToDelete !== null}
        title="Delete Reusable Flow"
        description="Are you sure you want to delete this reusable flow? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDeleteFlow}
        onCancel={() => setFlowToDelete(null)}
      />
    </div>
  )
}
