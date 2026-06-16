"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

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

interface PromptInputProps {
  projectId: string
  onGenerated: (testCase: GeneratedTestCase) => void
}

export function PromptInput({ projectId, onGenerated }: PromptInputProps) {
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleGenerate() {
    if (!prompt.trim()) return
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/ai/generate-test-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, projectId }),
      })

      if (res.ok) {
        const data = await res.json()
        onGenerated(data.generated)
        setPrompt("")
      } else {
        const data = await res.json()
        setError(data.error || "Generation failed")
      }
    } catch {
      setError("Failed to connect to AI service")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        Describe what you want to test
      </label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. Test the admin login flow and verify that invalid password shows validation error"
        rows={3}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="button"
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
      >
        {loading ? "Generating..." : "Generate with AI"}
      </Button>
    </div>
  )
}
