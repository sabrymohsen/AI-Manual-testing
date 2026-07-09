"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { ActiveProjectContextBar } from "@/components/ui/active-project-context-bar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { CredentialsList } from "@/components/credentials/credentials-list"
import { IntegrationConfig } from "@/components/integrations/integration-config"
import { 
  LayoutGrid, 
  Layers, 
  Key, 
  Globe, 
  Settings, 
  FileText, 
  Bug, 
  Video, 
  FlaskConical,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Activity,
  CheckCircle2,
  Trash2,
  History
} from "lucide-react"

type ProjectTab = "overview" | "scope" | "credentials" | "integrations" | "settings"

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<any>(null)
  const [hierarchyModules, setHierarchyModules] = useState<any[]>([])
  const [testCasesCount, setTestCasesCount] = useState(0)
  const [openBugsCount, setOpenBugsCount] = useState(0)
  const [runsCount, setRunsCount] = useState(0)
  const [activeTab, setActiveTab] = useState<ProjectTab>("overview")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const loadData = async () => {
    try {
      const [projRes, casesRes, bugsRes, runsRes, hierRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/test-cases`),
        fetch(`/api/projects/${projectId}/bug-reports`),
        fetch(`/api/projects/${projectId}/test-runs`),
        fetch(`/api/projects/${projectId}/hierarchy`)
      ])

      const projData = projRes.ok ? await projRes.json() : {}
      const casesData = casesRes.ok ? await casesRes.json() : {}
      const bugsData = bugsRes.ok ? await bugsRes.json() : {}
      const runsData = runsRes.ok ? await runsRes.json() : {}
      const hierData = hierRes.ok ? await hierRes.json() : {}

      setProject(projData.project)
      setTestCasesCount((casesData.testCases || []).length)
      setOpenBugsCount((bugsData.bugReports || []).filter((b: any) => b.status === "Open").length)
      setRunsCount((runsData.testRuns || []).length)
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
          { id: "overview", label: "Overview", icon: LayoutGrid },
          { id: "scope", label: "Scope / Modules", icon: Layers },
          { id: "credentials", label: "Credentials Vault", icon: Key },
          { id: "integrations", label: "OpenProject Connection", icon: Globe },
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
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="p-4 border rounded-xl bg-card space-y-2 border-slate-100 shadow-sm">
                <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60">Pass rate</span>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <span className="text-xl font-extrabold text-slate-800">{project.passRate ?? 0}%</span>
                </div>
              </div>
              <div className="p-4 border rounded-xl bg-card space-y-2 border-slate-100 shadow-sm">
                <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60">Test Cases</span>
                <span className="text-xl font-extrabold text-slate-800">{testCasesCount} cases</span>
              </div>
              <div className="p-4 border rounded-xl bg-card space-y-2 border-slate-100 shadow-sm">
                <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60">Open Bugs</span>
                <span className="text-xl font-extrabold text-rose-600">{openBugsCount} defects</span>
              </div>
              <div className="p-4 border rounded-xl bg-card space-y-2 border-slate-100 shadow-sm">
                <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60">Total Runs</span>
                <span className="text-xl font-extrabold text-slate-800">{runsCount} runs</span>
              </div>
            </div>

            {/* Quick links shortcuts only */}
            <div className="p-5 border border-slate-100 shadow-sm rounded-2xl bg-card space-y-4">
              <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block border-b pb-2">Primary Workspaces Shortcuts</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: "Open Test Cases", desc: "Manage functional test case steps suites.", href: `/projects/${projectId}/test-cases`, icon: FileText },
                  { title: "Open Bug Reports", desc: "Triage defect tickets and synchronizations.", href: `/projects/${projectId}/bug-reports`, icon: Bug },
                  { title: "Open Recorder Studio", desc: "Launch step pickers to record user actions.", href: `/projects/${projectId}/recorder-studio`, icon: Video },
                  { title: "Open Live QA Session", desc: "Run live QA checks and capture screenshots.", href: `/projects/${projectId}/live-qa-session`, icon: FlaskConical },
                  { title: "Live QA History", desc: "Past sessions with their bugs, screenshots, and videos.", href: `/projects/${projectId}/live-qa-history`, icon: History },
                  { title: "Open OpenProject Sync", desc: "Configure server hooks and track parent maps.", href: `/projects/${projectId}/openproject-sync`, icon: Globe }
                ].map((ws, idx) => (
                  <div 
                    key={idx}
                    onClick={() => router.push(ws.href)}
                    className="p-3 border rounded-xl hover:bg-slate-50 border-slate-100 hover:border-slate-200 cursor-pointer flex items-start gap-3 transition-colors group"
                  >
                    <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                      <ws.icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-extrabold text-slate-800 block truncate group-hover:text-indigo-700 transition-colors">{ws.title}</span>
                      <span className="text-[10px] text-muted-foreground leading-normal font-medium block">{ws.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
          <div className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-card">
            <span className="text-[9px] uppercase font-extrabold text-muted-foreground/60 block border-b pb-2 mb-4">Host Target API Config</span>
            <IntegrationConfig projectId={projectId} />
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
