"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface FigmaConfigProps {
  projectId: string
  onSyncComplete: (result: any) => void
}

export function FigmaConfig({ projectId, onSyncComplete }: FigmaConfigProps) {
  const [figmaUrl, setFigmaUrl] = useState("")
  const [apiToken, setApiToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSync() {
    if (!figmaUrl) return
    setLoading(true)
    setError("")

    try {
      const res = await fetch(`/api/projects/${projectId}/figma/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaUrl, apiToken: apiToken || undefined }),
      })

      if (res.ok) {
        const data = await res.json()
        onSyncComplete(data)
      } else {
        const data = await res.json()
        setError(data.error || "Sync failed")
      }
    } catch {
      setError("Failed to sync Figma")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <h3 className="font-semibold">Figma Configuration</h3>

      <div className="space-y-2">
        <Label htmlFor="figmaUrl">Figma Frame URL</Label>
        <Input
          id="figmaUrl"
          value={figmaUrl}
          onChange={(e) => setFigmaUrl(e.target.value)}
          placeholder="https://www.figma.com/file/..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiToken">Figma API Token (optional)</Label>
        <Input
          id="apiToken"
          type="password"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          placeholder="figd_..."
        />
        <p className="text-xs text-muted-foreground">
          Only needed if not set in global settings
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSync} disabled={loading || !figmaUrl}>
        {loading ? "Syncing..." : "Sync Figma Frame"}
      </Button>
    </div>
  )
}
