"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { ActiveProjectContextBar } from "@/components/ui/active-project-context-bar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { CredentialsList } from "@/components/credentials/credentials-list"
import { IntegrationConfig } from "@/components/integrations/integration-config"
import { IntegrationConnectPanel } from "@/components/integrations/integration-connect-panel"
import { useProjectIntegration } from "@/hooks/use-project-integration"
import {
  Layers,
  Key,
  Globe,
  Settings,
  ShieldAlert,
  Trash2,
  Users,
  Bot
} from "lucide-react"
import { TeamPanel } from "@/components/team/team-panel"
import { ProjectAiPanel } from "@/components/ai/project-ai-panel"
import { ModulesPanel } from "@/components/modules/modules-panel"

type ProjectTab = "scope" | "credentials" | "integrations" | "ai" | "team" | "settings"

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  // Connected tracker (Jira / Azure DevOps / ClickUp / OpenProject) for labels + gating.
  const { provider: integrationProvider, name: integrationName, connected: integrationConnected } =
    useProjectIntegration(projectId)
  const integrationTabLabel = integrationConnected ? `${integrationName} Connection` : "Integrations"

  // Deep-link support: ?tab=scope|credentials|integrations|general (general → settings tab).
  const tabParam = searchParams.get("tab")
  const initialTab: ProjectTab =
    tabParam === "credentials" || tabParam === "integrations" || tabParam === "scope" || tabParam === "team"
      ? tabParam
      : tabParam === "general" || tabParam === "settings"
        ? "settings"
        : "scope"

  const [project, setProject] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<ProjectTab>(initialTab)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const loadData = async () => {
    try {
      // `/hierarchy` used to be fetched here for the old read-only scope tree.
      // That endpoint never existed, so it 404'd on every load and the tab
      // always read "No modules defined"; the Modules tab now reads the
      // project's real test suites instead.
      const projRes = await fetch(`/api/projects/${projectId}`)
      const projData = projRes.ok ? await projRes.json() : {}

      setProject(projData.project)
    } catch (err) {
      console.error("Error loading project dynamic details:", err)
    }
  }

  useEffect(() => {
    loadData()
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
        loadData()
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
        Loading project workspace scope details...
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 text-xs font-semibold select-none">
      <AppPageHeader 
        title={project.name}
        subtitle="Manage testing folders scope, view health summaries, configure authentication vault, and target integration settings."
        breadcrumb={`Projects > ${project.name}`}
      />

      <ActiveProjectContextBar projectId={projectId} />

      {/* Tabs navigation */}
      <div className="flex border-b pb-px overflow-x-auto gap-4">
        {[
          { id: "scope", label: "Modules", icon: Layers },
          { id: "credentials", label: "Credentials Vault", icon: Key },
          { id: "integrations", label: integrationTabLabel, icon: Globe },
          { id: "ai", label: "AI Provider", icon: Bot },
          { id: "team", label: "Team", icon: Users },
          { id: "settings", label: "General Settings", icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ProjectTab)}
              className={`flex items-center gap-1.5 pb-2.5 px-1.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="mt-6">
        {/* MODULES TAB — the project's test suites, which are also what bugs
            are filed under and what the QA report groups by. */}
        {activeTab === "scope" && (
          <div className="p-6 border border-border shadow-sm rounded-xl bg-card">
            <ModulesPanel projectId={projectId} />
          </div>
        )}

        {/* CREDENTIALS TAB */}
        {activeTab === "credentials" && (
          <div className="p-6 border border-border shadow-sm rounded-xl bg-card">
            <CredentialsList 
              projectId={projectId}
              credentials={project.credentials || []}
              onUpdate={loadData}
            />
          </div>
        )}

        {/* INTEGRATIONS TAB */}
        {activeTab === "integrations" && (
          <div className="space-y-6">
            <div className="p-6 border border-border shadow-sm rounded-xl bg-card">
              <span className="text-[11px] font-medium text-muted-foreground/60 block border-b pb-2 mb-4">Project-Management Integration</span>
              <IntegrationConnectPanel projectId={projectId} />
            </div>
            {/* Advanced OpenProject controls (parent strategy, group/board sync,
                custom fields) — only relevant when this project uses OpenProject. */}
            {integrationProvider === "OpenProject" && (
              <div className="p-6 border border-border shadow-sm rounded-xl bg-card">
                <span className="text-[11px] font-medium text-muted-foreground/60 block border-b pb-2 mb-4">OpenProject advanced settings</span>
                <IntegrationConfig projectId={projectId} />
              </div>
            )}
          </div>
        )}

        {/* AI PROVIDER TAB */}
        {activeTab === "ai" && <ProjectAiPanel projectId={projectId} />}

        {/* TEAM TAB */}
        {activeTab === "team" && (
          <TeamPanel
            projectId={projectId}
            providerName={integrationName || integrationProvider}
            connected={integrationConnected}
          />
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="p-6 border border-border shadow-sm col-span-2 space-y-6 rounded-xl bg-card">
              <span className="text-[11px] font-medium text-muted-foreground/60 block border-b pb-2">Target Scope Details</span>
              {error && <p className="text-red-655 font-semibold">{error}</p>}
              <form onSubmit={handleGeneralSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-muted-foreground">Project Name *</Label>
                    <Input id="name" name="name" required defaultValue={project.name} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="webAppUrl" className="text-muted-foreground">Web App URL *</Label>
                    <Input id="webAppUrl" name="webAppUrl" type="url" required defaultValue={project.webAppUrl} className="h-9" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-muted-foreground">Description</Label>
                  <Input id="description" name="description" defaultValue={project.description || ""} className="h-9" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="environment" className="text-muted-foreground">Environment</Label>
                    <select id="environment" name="environment" defaultValue={project.environment} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                      <option value="Dev">Dev</option>
                      <option value="Staging">Staging</option>
                      <option value="UAT">UAT</option>
                      <option value="Production">Production</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="browserType" className="text-muted-foreground">Browser Type</Label>
                    <select id="browserType" name="browserType" defaultValue={project.browserType} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                      <option value="Chromium">Chromium</option>
                      <option value="Firefox">Firefox</option>
                      <option value="WebKit">WebKit</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="viewport" className="text-muted-foreground">Viewport Size</Label>
                    <select id="viewport" name="viewport" defaultValue={project.viewport} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                      <option value="Desktop">Desktop (1280x800)</option>
                      <option value="Tablet">Tablet (768x1024)</option>
                      <option value="Mobile">Mobile (375x667)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="testType" className="text-muted-foreground">Test Execution Type</Label>
                    <select id="testType" name="testType" defaultValue={project.testType} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                      <option value="E2E">E2E Automated</option>
                      <option value="API">API Backend</option>
                      <option value="Manual">Manual QA</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="figmaUrl" className="text-muted-foreground">Figma Prototype Link</Label>
                    <Input id="figmaUrl" name="figmaUrl" defaultValue={project.figmaUrl || ""} className="h-9" />
                  </div>
                </div>

                <Button type="submit" disabled={saving} size="sm" className="h-9 px-4">
                  {saving ? "Saving Configurations..." : "Save Settings"}
                </Button>
              </form>
            </div>

            <div className="p-6 border border-red-100 bg-red-500/[0.01] shadow-sm space-y-4 rounded-xl">
              <span className="text-[11px] font-medium text-red-600 flex items-center gap-1.5 border-b pb-2">
                <ShieldAlert className="h-4 w-4" /> Danger Zone
              </span>
              <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                Permanently deletes the active workspace project database model. All stored test steps, execution logs, screenshot evidence, and sync maps will be destroyed.
              </p>
              <Button 
                onClick={handleDeleteProject}
                variant="destructive" 
                size="sm"
                className="w-full h-9 font-semibold flex items-center justify-center gap-1 bg-red-650 hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" /> Delete Project Scope
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
