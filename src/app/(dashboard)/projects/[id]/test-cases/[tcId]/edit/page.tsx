"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StepBuilder } from "@/components/test-cases/step-builder"
import { LinkedRequirementsSelector } from "@/components/test-cases/linked-requirements-selector"
import { AssigneeSelect } from "@/components/team/assignee-select"

export default function EditTestCasePage() {
  const params = useParams()
  const router = useRouter()
  const [testCase, setTestCase] = useState<any>(null)
  const [steps, setSteps] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [assignee, setAssignee] = useState("")

  const [requirementIds, setRequirementIds] = useState<string[]>([])

  useEffect(() => {
    fetch(`/api/projects/${params.id}/test-cases/${params.tcId}`)
      .then((res) => res.json())
      .then((data) => {
        setTestCase(data.testCase)
        setAssignee(data.testCase.assignee || "")
        setRequirementIds((data.testCase.requirements || []).map((r: any) => r.requirementId))
        setSteps(
          data.testCase.steps.map((s: any) => ({
            actionDescription: s.actionDescription,
            expectedResult: s.expectedResult,
            actionType: s.actionType,
            targetType: s.targetType,
            targetValue: s.targetValue || "",
            inputValue: s.inputValue || "",
            timeoutMs: s.timeoutMs,
            assertions: s.assertions || [],
          }))
        )
      })
  }, [params.id, params.tcId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const form = new FormData(e.currentTarget)
    const body = {
      title: form.get("title"),
      priority: form.get("priority"),
      preconditions: form.get("preconditions") || null,
      assignee: assignee || null,
      steps,
      requirementIds
    }

    const res = await fetch(`/api/projects/${params.id}/test-cases/${params.tcId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      router.push(`/projects/${params.id}/test-cases`)
    } else {
      const data = await res.json()
      setError(data.error || "Failed to update test case")
      setLoading(false)
    }
  }

  if (!testCase) return <p className="text-muted-foreground">Loading...</p>

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">Edit Test Case</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" required defaultValue={testCase.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <select id="priority" name="priority" defaultValue={testCase.priority} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignee">Assignee</Label>
            <AssigneeSelect
              id="assignee"
              projectId={params.id as string}
              value={assignee}
              onChange={setAssignee}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2 col-span-2">
            <Label htmlFor="preconditions">Preconditions</Label>
            <Input id="preconditions" name="preconditions" defaultValue={testCase.preconditions || ""} />
          </div>
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
            {loading ? "Saving..." : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
