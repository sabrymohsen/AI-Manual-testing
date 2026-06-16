"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sparkles } from "lucide-react"

interface BugReportFormProps {
  testRunId: string
  projectId: string
  defaultValues?: {
    actionDescription?: string
    stepsToReproduce?: string
    expectedResult?: string
    actualResult?: string
    screenshotPath?: string
  }
  onClose: () => void
  onSaved: () => void
}

export function BugReportForm({
  testRunId,
  projectId,
  defaultValues,
  onClose,
  onSaved,
}: BugReportFormProps) {
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState("")

  const [title, setTitle] = useState("")
  const [severity, setSeverity] = useState("Medium")
  const [priority, setPriority] = useState("Medium")
  const [stepsToReproduce, setStepsToReproduce] = useState(defaultValues?.stepsToReproduce || "")
  const [expectedResult, setExpectedResult] = useState(defaultValues?.expectedResult || "")
  const [actualResult, setActualResult] = useState(defaultValues?.actualResult || "")

  async function handleAiDraft() {
    setAiLoading(true)
    setError("")

    try {
      const res = await fetch("/api/ai/draft-bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "Failed Test Step",
          actionDescription: defaultValues?.actionDescription || stepsToReproduce || "Execute test step",
          expectedResult: expectedResult || defaultValues?.expectedResult || "",
          actualResult: actualResult || defaultValues?.actualResult || "",
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.draft) {
          setTitle(data.draft.title)
          setSeverity(data.draft.severity)
          setPriority(data.draft.priority)
          setStepsToReproduce(data.draft.stepsToReproduce)
          setExpectedResult(data.draft.expectedResult)
          setActualResult(data.draft.actualResult)
        }
      } else {
        const data = await res.json()
        setError(data.error || "AI drafting failed")
      }
    } catch {
      setError("Failed to connect to AI service")
    } finally {
      setAiLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const body = {
      title,
      severity,
      priority,
      stepsToReproduce,
      expectedResult,
      actualResult,
      screenshotPath: defaultValues?.screenshotPath || null,
      testRunId,
    }

    const res = await fetch(`/api/projects/${projectId}/bug-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      onSaved()
    } else {
      const data = await res.json()
      setError(data.error || "Failed to create bug report")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-lg p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Create Bug Report</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAiDraft}
            disabled={aiLoading}
            className="flex items-center gap-1 border-primary text-primary hover:bg-primary/10"
          >
            <Sparkles className="h-4 w-4" />
            {aiLoading ? "Drafting..." : "Draft with AI"}
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <select
                id="severity"
                name="severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stepsToReproduce">Steps to Reproduce</Label>
            <textarea
              id="stepsToReproduce"
              name="stepsToReproduce"
              value={stepsToReproduce}
              onChange={(e) => setStepsToReproduce(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expectedResult">Expected Result</Label>
            <textarea
              id="expectedResult"
              name="expectedResult"
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="actualResult">Actual Result</Label>
            <textarea
              id="actualResult"
              name="actualResult"
              value={actualResult}
              onChange={(e) => setActualResult(e.target.value)}
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || aiLoading}>
              {loading ? "Saving..." : "Create Bug Report"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
