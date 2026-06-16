"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function EditProjectPage() {
  const params = useParams()
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((res) => res.json())
      .then((data) => setProject(data.project))
  }, [params.id])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const form = new FormData(e.currentTarget)
    const body: Record<string, any> = {
      name: form.get("name"),
      webAppUrl: form.get("webAppUrl"),
      description: form.get("description") || null,
      environment: form.get("environment"),
      browserType: form.get("browserType"),
      viewport: form.get("viewport"),
      testType: form.get("testType"),
      figmaUrl: form.get("figmaUrl") || null,
    }

    const res = await fetch(`/api/projects/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      router.push(`/projects/${params.id}`)
    } else {
      const data = await res.json()
      setError(data.error || "Failed to update project")
      setLoading(false)
    }
  }

  if (!project) return <p className="text-muted-foreground">Loading...</p>

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Edit Project</h1>
      <form onSubmit={handleSubmit} className="space-y-4" key={project.id}>
        <div className="space-y-2">
          <Label htmlFor="name">Project Name *</Label>
          <Input id="name" name="name" required defaultValue={project.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="webAppUrl">Web App URL *</Label>
          <Input id="webAppUrl" name="webAppUrl" type="url" required defaultValue={project.webAppUrl} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input id="description" name="description" defaultValue={project.description || ""} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="environment">Environment</Label>
            <select id="environment" name="environment" defaultValue={project.environment} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="Dev">Dev</option>
              <option value="Staging">Staging</option>
              <option value="UAT">UAT</option>
              <option value="Production">Production</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="browserType">Browser</Label>
            <select id="browserType" name="browserType" defaultValue={project.browserType} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="Chromium">Chromium</option>
              <option value="Firefox">Firefox</option>
              <option value="WebKit">WebKit</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="viewport">Viewport</Label>
            <select id="viewport" name="viewport" defaultValue={project.viewport} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="Desktop">Desktop (1280x800)</option>
              <option value="Tablet">Tablet (768x1024)</option>
              <option value="Mobile">Mobile (375x667)</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="testType">Test Type</Label>
            <select id="testType" name="testType" defaultValue={project.testType} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="Functional">Functional</option>
              <option value="VisualDesign">Visual Design</option>
              <option value="E2E">End-to-End</option>
              <option value="Regression">Regression</option>
              <option value="Smoke">Smoke</option>
              <option value="Exploratory">Exploratory</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="figmaUrl">Figma URL (optional)</Label>
          <Input id="figmaUrl" name="figmaUrl" type="url" defaultValue={project.figmaUrl || ""} />
        </div>
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
