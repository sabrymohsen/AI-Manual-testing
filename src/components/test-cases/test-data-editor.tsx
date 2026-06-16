"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface TestDataEditorProps {
  data: Record<string, any> | null
  onChange: (data: Record<string, any> | null) => void
}

export function TestDataEditor({ data, onChange }: TestDataEditorProps) {
  const [jsonText, setJsonText] = useState(
    data ? JSON.stringify(data, null, 2) : "{}"
  )
  const [error, setError] = useState("")

  function handleSave() {
    try {
      const parsed = JSON.parse(jsonText)
      onChange(parsed)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON")
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Test Data (JSON)</label>
        <Button type="button" variant="ghost" size="sm" onClick={handleSave}>
          Validate & Save
        </Button>
      </div>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        rows={6}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
        placeholder='{"key": "value"}'
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
