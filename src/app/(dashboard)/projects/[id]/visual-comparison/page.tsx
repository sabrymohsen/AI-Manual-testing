"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FigmaConfig } from "@/components/figma/figma-config"
import { ComparisonResult } from "@/components/figma/comparison-result"

export default function VisualComparisonPage() {
  const params = useParams()
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncData, setSyncData] = useState<any>(null)
  const [targetUrl, setTargetUrl] = useState("")
  const [comparing, setComparing] = useState(false)
  const [comparisonResult, setComparisonResult] = useState<any>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data.project)
        if (data.project?.figmaConfig) {
          setSyncData({
            fileKey: data.project.figmaConfig.fileKey,
            nodeId: data.project.figmaConfig.nodeId,
          })
        }
        setTargetUrl(data.project?.webAppUrl || "")
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [params.id])

  async function handleCompare() {
    setComparing(true)
    setError("")
    setComparisonResult(null)

    try {
      const res = await fetch(`/api/projects/${params.id}/figma/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl }),
      })

      if (res.ok) {
        const data = await res.json()
        setComparisonResult(data.visualResult)
      } else {
        const data = await res.json()
        setError(data.error || "Visual comparison failed")
      }
    } catch {
      setError("Failed to run visual comparison")
    } finally {
      setComparing(false)
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading visual comparison dashboard...</p>
  if (!project) return <p className="text-destructive">Project not found</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.push(`/projects/${params.id}`)}
            className="mb-2"
          >
            &larr; Back to Project
          </Button>
          <h1 className="text-3xl font-bold">Visual Comparison</h1>
          <p className="text-sm text-muted-foreground">
            Compare live web pages against Figma design mocks
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-1">
          {/* Figma Configuration */}
          <FigmaConfig
            projectId={project.id}
            onSyncComplete={(data) => {
              setSyncData(data)
              // Refresh page context
              fetch(`/api/projects/${params.id}`)
                .then((res) => res.json())
                .then((d) => setProject(d.project))
            }}
          />

          {/* Execution Control */}
          {syncData && (
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-semibold">Compare Mocks</h3>
              <div className="space-y-2">
                <Label htmlFor="targetUrl">Target Web URL</Label>
                <Input
                  id="targetUrl"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                onClick={handleCompare}
                disabled={comparing}
                className="w-full"
              >
                {comparing ? "Comparing..." : "Run Visual Diff"}
              </Button>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="md:col-span-2 border rounded-lg p-6 min-h-[300px]">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Comparison Results</h2>
          {comparing && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Running browser automation to capture screenshot...</p>
              <p className="text-xs text-muted-foreground mt-2">This may take a few seconds.</p>
            </div>
          )}
          {!comparing && !comparisonResult && (
            <div className="text-center py-12 text-muted-foreground">
              {syncData ? (
                <p>Ready to compare. Enter target URL and click &quot;Run Visual Diff&quot;.</p>
              ) : (
                <p>Please configure and sync a Figma Frame to begin visual testing.</p>
              )}
            </div>
          )}
          {!comparing && comparisonResult && (
            <ComparisonResult
              figmaImagePath={comparisonResult.figmaImagePath}
              actualImagePath={comparisonResult.actualImagePath}
              diffImagePath={comparisonResult.diffImagePath}
              mismatchPercent={comparisonResult.mismatchPercent}
              tolerancePercent={comparisonResult.tolerancePercent}
              viewportWidth={comparisonResult.viewportWidth}
              viewportHeight={comparisonResult.viewportHeight}
            />
          )}
        </div>
      </div>
    </div>
  )
}
