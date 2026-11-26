"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Plus } from "@/components/ui/icons"

interface Assertion {
  type: string
  value: string
  targetType?: string
  targetValue?: string
}

interface AssertionBuilderProps {
  assertions: Assertion[]
  onChange: (assertions: Assertion[]) => void
}

import {
  ASSERTION_TYPES,
  ASSERTION_TYPE_LABELS,
} from "@/lib/test-constants"

export function AssertionBuilder({ assertions, onChange }: AssertionBuilderProps) {
  const safeAssertions = assertions || []

  function addAssertion() {
    onChange([
      ...safeAssertions,
      { type: "element_visible", value: "", targetType: "css", targetValue: "" },
    ])
  }

  function removeAssertion(index: number) {
    onChange(safeAssertions.filter((_, i) => i !== index))
  }

  function updateAssertion(index: number, field: keyof Assertion, value: string) {
    const updated = [...safeAssertions]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Assertions</Label>
        <Button type="button" variant="ghost" size="sm" onClick={addAssertion}>
          <Plus className="h-3 w-3 mr-1" /> Add Assertion
        </Button>
      </div>

      {safeAssertions.length === 0 && (
        <p className="text-xs text-muted-foreground">No assertions defined</p>
      )}

      <div className="space-y-2">
        {safeAssertions.map((assertion, index) => (
          <div key={index} className="flex items-start gap-2 border rounded p-2">
            <select
              value={assertion.type}
              onChange={(e) => updateAssertion(index, "type", e.target.value)}
              className="flex h-8 w-32 rounded-md border border-input bg-background px-2 text-xs"
            >
              {ASSERTION_TYPES.map((t) => (
                <option key={t} value={t}>{ASSERTION_TYPE_LABELS[t] || t}</option>
              ))}
            </select>
            <Input
              value={assertion.value}
              onChange={(e) => updateAssertion(index, "value", e.target.value)}
              placeholder="Expected value"
              className="h-8 text-xs"
            />
            <Input
              value={assertion.targetValue || ""}
              onChange={(e) => updateAssertion(index, "targetValue", e.target.value)}
              placeholder="Element selector"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeAssertion(index)}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
