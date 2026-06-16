"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ACTION_TYPE_LABELS } from "@/lib/test-constants"

interface GeneratedTestCase {
  title: string
  preconditions: string
  steps: Array<{
    actionDescription: string
    expectedResult: string
    actionType: string
    targetType: string
    targetValue: string
    inputValue: string
  }>
  requiredRole?: string
}

interface GeneratedTestCasePreviewProps {
  testCase: GeneratedTestCase
  onApprove: () => void
  onReject: () => void
  onEdit: (updated: GeneratedTestCase) => void
}

export function GeneratedTestCasePreview({
  testCase,
  onApprove,
  onReject,
  onEdit,
}: GeneratedTestCasePreviewProps) {
  const [editing, setEditing] = useState(false)
  const [edited, setEdited] = useState<GeneratedTestCase>({ ...testCase })

  if (editing) {
    return (
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">Edit Generated Test Case</h3>
        <div className="space-y-2">
          <label className="text-sm font-medium">Title</label>
          <input
            value={edited.title}
            onChange={(e) => setEdited({ ...edited, title: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Preconditions</label>
          <textarea
            value={edited.preconditions}
            onChange={(e) => setEdited({ ...edited, preconditions: e.target.value })}
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {edited.steps.map((step, i) => (
          <div key={i} className="border rounded p-2 space-y-1">
            <p className="text-xs font-medium">Step {i + 1}</p>
            <input
              value={step.actionDescription}
              onChange={(e) => {
                const steps = [...edited.steps]
                steps[i] = { ...steps[i], actionDescription: e.target.value }
                setEdited({ ...edited, steps })
              }}
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { onEdit(edited); setEditing(false) }}>
            Save Changes
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">AI Generated Test Case</h3>
        <span className="text-xs text-muted-foreground">source: AI Generated</span>
      </div>

      <div>
        <p className="text-sm font-medium">Title: {testCase.title}</p>
        {testCase.requiredRole && (
          <p className="text-sm text-muted-foreground">Suggested role: {testCase.requiredRole}</p>
        )}
      </div>

      {testCase.preconditions && (
        <div>
          <p className="text-xs text-muted-foreground">Preconditions:</p>
          <p className="text-sm">{testCase.preconditions}</p>
        </div>
      )}

      <div>
        <p className="text-xs text-muted-foreground mb-1">Steps:</p>
        <ol className="list-decimal list-inside space-y-1">
          {testCase.steps.map((step, i) => (
            <li key={i} className="text-sm">
              {step.actionDescription}
              <span className="text-xs text-muted-foreground ml-2 px-1.5 py-0.5 rounded bg-secondary/80 border text-[10px] font-semibold uppercase tracking-wider">
                {ACTION_TYPE_LABELS[step.actionType] || step.actionType}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={onApprove}>
          Approve & Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={onReject}>
          Discard
        </Button>
      </div>
    </div>
  )
}
