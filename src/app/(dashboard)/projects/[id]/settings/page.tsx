"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { ActiveProjectContextBar } from "@/components/ui/active-project-context-bar"
import { CredentialsList } from "@/components/credentials/credentials-list"
import { IntegrationConfig } from "@/components/integrations/integration-config"
import { Settings, Shield, Globe, Trash2, Key } from "lucide-react"

type SettingsTab = "general" | "credentials" | "integrations"

export default function ScopedProjectSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const fetchProjectData = () => {
    fetch(`/api/projects/${projectId}`)
      .then(res => res.json())
      .then(data => setProject(data.project))
      .catch(err => console.error("Error loading project details:", err))
  }

  useEffect(() => {
    fetchProjectData()
  }, [projectId])

  async function handleGeneralSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
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

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        alert("Project settings updated successfully!")
        fetchProjectData()
      } else {
        const data = await res.json()
        setError(data.error || "Failed to update project settings")
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteProject() {
    if (!confirm("Are you absolutely sure you want to permanently delete this project? This will delete all test cases, runs, and bugs. This action is irreversible.")) {
      return
    }
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE"
      })
      if (res.ok) {
        localStorage.removeItem("activeProjectId")
        window.dispatchEvent(new Event("projectChanged"))
        router.push("/projects")
      } else {
        alert("Failed to delete project.")
      }
    } catch (err) {
      console.error(err)
    }
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse font-semibold">
        Loading settings configurations...
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none">
      <AppPageHeader 
        title="Project Configurations & Setup"
        subtitle="Manage credentials keys, target web environments, base endpoints, and tracking tool credentials."
        breadcrumb="Configuration > Settings"
      />

      <ActiveProjectContextBar projectId={projectId} />

      {/* Tabs list */}
      <div className="flex gap-2 border-b pb-px">
        {[
          { id: "general", label: "General Config", icon: Settings },
          { id: "credentials", label: "Credentials Vault", icon: Key },
          { id: "integrations", label: "OpenProject Connection", icon: Globe }
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`flex items-center gap-1.5 pb-2.5 px-1.5 text-xs font-bold border-b-2 transition-all ${
                isActive ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="mt-6">
        {activeTab === "general" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="p-6 border border-slate-100 shadow-sm col-span-2 space-y-6 rounded-2xl bg-card">
              <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block border-b pb-2">Target Scope Details</span>
              {error && <p className="text-red-600 font-bold">{error}</p>}
              <form onSubmit={handleGeneralSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-slate-600">Project Name *</Label>
                    <Input id="name" name="name" required defaultValue={project.name} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="webAppUrl" className="text-slate-600">Web App URL *</Label>
                    <Input id="webAppUrl" name="webAppUrl" type="url" required defaultValue={project.webAppUrl} className="h-9" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-slate-600">Description</Label>
                  <Input id="description" name="description" defaultValue={project.description || ""} className="h-9" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="environment" className="text-slate-600">Environment</Label>
                    <select id="environment" name="environment" defaultValue={project.environment} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                      <option value="Dev">Dev</option>
                      <option value="Staging">Staging</option>
                      <option value="UAT">UAT</option>
                      <option value="Production">Production</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="browserType" className="text-slate-600">Browser Type</Label>
                    <select id="browserType" name="browserType" defaultValue={project.browserType} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                      <option value="Chromium">Chromium</option>
                      <option value="Firefox">Firefox</option>
                      <option value="WebKit">WebKit</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="viewport" className="text-slate-600">Viewport Size</Label>
                    <select id="viewport" name="viewport" defaultValue={project.viewport} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                      <option value="Desktop">Desktop (1280x800)</option>
                      <option value="Tablet">Tablet (768x1024)</option>
                      <option value="Mobile">Mobile (375x667)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="testType" className="text-slate-600">Test Execution Type</Label>
                    <select id="testType" name="testType" defaultValue={project.testType} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                      <option value="E2E">E2E Automated</option>
                      <option value="API">API Backend</option>
                      <option value="Manual">Manual QA</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="figmaUrl" className="text-slate-600">Figma Prototype Link</Label>
                    <Input id="figmaUrl" name="figmaUrl" defaultValue={project.figmaUrl || ""} className="h-9" />
                  </div>
                </div>

                <Button type="submit" disabled={saving} size="sm" className="h-9 px-4">
                  {saving ? "Saving Configurations..." : "Save Settings"}
                </Button>
              </form>
            </div>

            <div className="p-6 border border-red-100 bg-red-500/[0.01] shadow-sm space-y-4 rounded-2xl bg-card">
              <span className="text-[9px] uppercase font-extrabold text-red-600 tracking-wider flex items-center gap-1.5 border-b pb-2">
                <Shield className="h-4 w-4" /> Danger Zone
              </span>
              <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                Permanently deletes the active workspace project database model. All stored test steps, execution logs, screenshot evidence, and sync maps will be destroyed.
              </p>
              <Button 
                onClick={handleDeleteProject}
                variant="destructive" 
                size="sm"
                className="w-full h-9 font-bold flex items-center justify-center gap-1 bg-red-650 hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" /> Delete Project Scope
              </Button>
            </div>
          </div>
        )}

        {activeTab === "credentials" && (
          <div className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-card">
            <CredentialsList 
              projectId={projectId}
              credentials={project.credentials || []}
              onUpdate={fetchProjectData}
            />
          </div>
        )}

        {activeTab === "integrations" && (
          <div className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-card">
            <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block border-b pb-2 mb-4">Host Target API Config</span>
            <IntegrationConfig projectId={projectId} />
          </div>
        )}
      </div>
    </div>
  )
}
