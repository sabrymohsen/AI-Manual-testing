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
  Trash2
} from "lucide-react"

type ProjectTab = "scope" | "credentials" | "integrations" | "settings"

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
    tabParam === "credentials" || tabParam === "integrations" || tabParam === "scope"
      ? tabParam
      : tabParam === "general" || tabParam === "settings"
        ? "settings"
        : "scope"

  const [project, setProject] = useState<any>(null)
  const [hierarchyModules, setHierarchyModules] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<ProjectTab>(initialTab)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const loadData = async () => {
    try {
      const [projRes, hierRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/hierarchy`)
      ])

      const projData = projRes.ok ? await projRes.json() : {}
      const hierData = hierRes.ok ? await hierRes.json() : {}

      setProject(projData.project)
      setHierarchyModules(hierData.modules || [])
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
          { id: "scope", label: "Scope / Modules", icon: Layers },
          { id: "credentials", label: "Credentials Vault", icon: Key },
          { id: "integrations", label: integrationTabLabel, icon: Globe },
          { id: "settings", label: "General Settings", icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ProjectTab)}
              className={`flex items-center gap-1.5 pb-2.5 px-1.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                isActive ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-slate-700"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="mt-6">
        {/* SCOPE TAB */}
        {activeTab === "scope" && (
          <div className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-card space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">Workspace Scope Folders Hierarchy</h2>
              <p className="text-[10px] text-slate-400 font-medium">Read-only overview of modules, features, and components structure.</p>
            </div>
            
            {hierarchyModules.length === 0 ? (
              <div className="text-center p-12 text-slate-450 italic">No modules defined in active project scope folder tree.</div>
            ) : (
              <div className="space-y-4">
                {hierarchyModules.map((mod) => (
                  <div key={mod.id} className="border border-slate-100 rounded-xl p-4 bg-slate-500/[0.01] space-y-3">
                    <h3 className="font-extrabold text-sm text-slate-800 border-b pb-2 flex justify-between items-center">
                      <span>📦 Module: {mod.name}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{mod.features?.length || 0} features</span>
                    </h3>

                    {mod.features?.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No features defined.</p>
                    ) : (
                      <div className="space-y-3">
                        {mod.features.map((feat: any) => (
                          <div key={feat.id} className="pl-3.5 border-l-2 border-slate-200 space-y-2">
                            <h4 className="text-xs font-bold text-slate-700">⚡ Feature: {feat.name}</h4>

                            {feat.components?.length === 0 ? (
                              <p className="text-[10px] text-slate-400 italic pl-2">No components defined.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2 pl-2">
                                {feat.components.map((comp: any) => (
                                  <div
                                    key={comp.id}
                                    className="text-[11px] px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 bg-slate-50 text-slate-600 border-slate-200"
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-450"></span>
                                    {comp.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CREDENTIALS TAB */}
        {activeTab === "credentials" && (
          <div className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-card">
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
            <div className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-card">
              <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block border-b pb-2 mb-4">Project-Management Integration</span>
              <IntegrationConnectPanel projectId={projectId} />
            </div>
            {/* Advanced OpenProject controls (parent strategy, group/board sync,
                custom fields) — only relevant when this project uses OpenProject. */}
            {integrationProvider === "OpenProject" && (
              <div className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-card">
                <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block border-b pb-2 mb-4">OpenProject advanced settings</span>
                <IntegrationConfig projectId={projectId} />
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="p-6 border border-slate-100 shadow-sm col-span-2 space-y-6 rounded-2xl bg-card">
              <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block border-b pb-2">Target Scope Details</span>
              {error && <p className="text-red-655 font-bold">{error}</p>}
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

            <div className="p-6 border border-red-100 bg-red-500/[0.01] shadow-sm space-y-4 rounded-2xl">
              <span className="text-[9px] uppercase font-extrabold text-red-600 tracking-wider flex items-center gap-1.5 border-b pb-2">
                <ShieldAlert className="h-4 w-4" /> Danger Zone
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
      </div>
    </div>
  )
}
