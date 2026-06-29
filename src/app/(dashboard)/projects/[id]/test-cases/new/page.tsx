"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StepBuilder } from "@/components/test-cases/step-builder"
import { HierarchySelector } from "@/components/hierarchy/hierarchy-selector"
import { LinkedRequirementsSelector } from "@/components/test-cases/linked-requirements-selector"

interface Step {
  actionDescription: string
  expectedResult: string
  actionType: string
  targetType: string
  targetValue: string
  inputValue: string
  timeoutMs: number
  assertions: any[]
}

export default function NewTestCasePage() {
  const params = useParams()
  const router = useRouter()
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [executionType, setExecutionType] = useState<"Manual" | "Automated">("Manual")

  const [moduleId, setModuleId] = useState("")
  const [featureId, setFeatureId] = useState("")
  const [componentId, setComponentId] = useState("")

  const [requirementIds, setRequirementIds] = useState<string[]>([])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const form = new FormData(e.currentTarget)
    const body = {
      title: form.get("title"),
      moduleId: moduleId || null,
      featureId: featureId || null,
      componentId: componentId || null,
      priority: form.get("priority"),
      preconditions: form.get("preconditions") || null,
      source: "Manual",
      executionType,
      testData: null,
      tags: [],
      steps: steps.map((s) => ({
        ...s,
        timeoutMs: s.timeoutMs || 10000,
      })),
      requirementIds
    }

    const res = await fetch(`/api/projects/${params.id}/test-cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      router.push(`/projects/${params.id}/test-cases`)
    } else {
      const data = await res.json()
      setError(data.error || "Failed to create test case")
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">New Test Case</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" required placeholder="e.g. Login flow validation" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <select id="priority" name="priority" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div className="space-y-2 col-span-2">
            <Label htmlFor="preconditions">Preconditions</Label>
            <Input id="preconditions" name="preconditions" placeholder="e.g. User must be logged out" />
          </div>
        </div>

        {/* Execution Type Picker */}
        <div className="border rounded-2xl p-5 bg-accent/5 space-y-3 shadow-sm border-accent/20">
          <h3 className="font-semibold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Execution Type</h3>
          <p className="text-xs text-muted-foreground">How will this test case be executed?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setExecutionType("Manual")}
              className={`rounded-xl border p-4 text-left transition-all ${
                executionType === "Manual"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-md"
                  : "border-input hover:border-muted-foreground/40 hover:bg-accent/30"
              }`}
            >
              <div className="font-semibold text-sm flex items-center gap-2">
                <span className={`text-base ${executionType === "Manual" ? "text-blue-600" : "text-muted-foreground"}`}>👤</span>
                Manual
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">A human tester executes steps one by one in a manual session.</p>
            </button>
            <button
              type="button"
              onClick={() => setExecutionType("Automated")}
              className={`rounded-xl border p-4 text-left transition-all ${
                executionType === "Automated"
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-950/20 shadow-md"
                  : "border-input hover:border-muted-foreground/40 hover:bg-accent/30"
              }`}
            >
              <div className="font-semibold text-sm flex items-center gap-2">
                <span className={`text-base ${executionType === "Automated" ? "text-violet-600" : "text-muted-foreground"}`}>⚡</span>
                Automated
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Steps are executed by Playwright. Requires selectors and actionable step types.</p>
            </button>
          </div>
        </div>

        <div className="border p-5 rounded-2xl bg-accent/5 space-y-3 shadow-sm border-accent/20">
          <h3 className="font-semibold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Test Suite Hierarchy</h3>
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

        <LinkedRequirementsSelector
          projectId={params.id as string}
          selectedIds={requirementIds}
          onChange={setRequirementIds}
        />

        <StepBuilder steps={steps} onChange={setSteps} projectId={params.id as string} />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Test Case"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
