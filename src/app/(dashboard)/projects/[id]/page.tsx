"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { AppPageHeader } from "@/components/ui/app-page-header"
import { ActiveProjectContextBar } from "@/components/ui/active-project-context-bar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CredentialsList } from "@/components/credentials/credentials-list"
import { IntegrationConfig } from "@/components/integrations/integration-config"
import { IntegrationConnectPanel } from "@/components/integrations/integration-connect-panel"
import { useProjectIntegration } from "@/hooks/use-project-integration"
import { Layers, Key, Globe, Settings, ShieldAlert, Trash2, Users, Bot, Loader2, Lock, AlertTriangle } from "@/components/ui/icons"
import { TeamPanel } from "@/components/team/team-panel"
import { ProjectAiPanel } from "@/components/ai/project-ai-panel"
import { ModulesPanel } from "@/components/modules/modules-panel"

type ProjectTab = "scope" | "credentials" | "integrations" | "ai" | "team" | "settings"
const TABS: ProjectTab[] = ["scope", "credentials", "integrations", "ai", "team", "settings"]

/** ?tab= value → tab. Accepts the old "general" alias and "modules". */
function tabFromParam(value: string | null): ProjectTab {
  if (value === "general") return "settings"
  if (value === "modules") return "scope"
  return TABS.includes(value as ProjectTab) ? (value as ProjectTab) : "scope"
}

interface Access {
  globalRole: string
  role: string | null
  permissions: Record<string, boolean>
}

/** Shown in place of a tab the user isn't allowed to manage. */
function AdminOnly({ what }: { what: string }) {
  return (
    <div className="p-6 border border-border rounded-xl bg-card flex items-start gap-3 text-xs text-muted-foreground">
      <Lock className="h-4 w-4 mt-0.5 shrink-0" />
      <p>Only the project&apos;s owner and admins can see or change {what}. Ask one of them if something here needs to change.</p>
    </div>
  )
}

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  // Connected tracker (Jira / Azure DevOps / ClickUp / OpenProject) for labels + gating.
  const { provider: integrationProvider, name: integrationName, connected: integrationConnected } =
    useProjectIntegration(projectId)
  const integrationTabLabel = integrationConnected ? `${integrationName} connection` : "Integrations"

  const activeTab = tabFromParam(searchParams.get("tab"))
  const setActiveTab = (tab: ProjectTab) => {
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", tab)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  const [project, setProject] = useState<any>(null)
  const [access, setAccess] = useState<Access | null>(null)
  const [loadError, setLoadError] = useState<"not-found" | "failed" | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [projRes, accessRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/membership`),
      ])
      if (projRes.status === 404 || projRes.status === 403) {
        setLoadError("not-found")
        return
      }
      if (!projRes.ok) {
        setLoadError("failed")
        return
      }
      const projData = await projRes.json()
      setProject(projData.project)
      setAccess(accessRes.ok ? await accessRes.json() : null)
      setLoadError(null)
    } catch {
      setLoadError("failed")
    }
  }, [projectId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Mirrors the server: settings/credentials/integrations/AI need project
  // Owner or Admin (a global Admin counts as Admin).
  const role = access?.role ?? null
  const canManage = access?.globalRole === "Admin" || role === "Owner" || role === "Admin"
  const perms = access?.permissions ?? {}
  const canDeleteProject = !!perms.canDeleteProject

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
        toast.success("Project settings saved")
        loadData()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Couldn't save the project settings")
      }
    } catch (err: any) {
      setError(err?.message || "Couldn't reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  // Throwing shows the message inside the confirm dialog.
  async function handleDeleteProject() {
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Couldn't delete the project")
    }
    try {
      if (localStorage.getItem("activeProjectId") === projectId) localStorage.removeItem("activeProjectId")
    } catch {}
    window.dispatchEvent(new Event("projectChanged"))
    toast.success(`Deleted ${project.name}`)
    router.push("/projects")
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <AlertTriangle className="h-6 w-6 mx-auto text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">
            {loadError === "not-found" ? "Project not found" : "Couldn't load this project"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {loadError === "not-found"
              ? "It may have been deleted, or you aren't a member. Ask a project admin to invite you."
              : "Something went wrong while loading. Check your connection and try again."}
          </p>
          <div className="flex justify-center gap-2">
            {loadError === "failed" && (
              <Button size="sm" variant="outline" onClick={() => { setLoadError(null); loadData() }}>
                Try again
              </Button>
            )}
            <Button size="sm" asChild>
              <Link href="/projects">All projects</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading project…
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 text-xs">
      <AppPageHeader
        title={project.name}
        subtitle="Modules, credentials, integrations, AI provider, team and settings for this project."
        breadcrumb={`Projects > ${project.name}`}
      />

      <ActiveProjectContextBar projectId={projectId} />

      {/* Tabs navigation */}
      <div className="flex border-b pb-px overflow-x-auto gap-4" role="tablist">
        {[
          { id: "scope", label: "Modules", icon: Layers },
          { id: "credentials", label: "Credentials", icon: Key },
          { id: "integrations", label: integrationTabLabel, icon: Globe },
          { id: "ai", label: "AI provider", icon: Bot },
          { id: "team", label: "Team", icon: Users },
          { id: "settings", label: "Settings", icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id as ProjectTab)}
              className={`flex items-center gap-2 pb-3 px-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
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
            <ModulesPanel
              projectId={projectId}
              canEdit={!!perms.canCreateStories}
              canDelete={!!perms.canDeleteStories}
            />
          </div>
        )}

        {/* CREDENTIALS TAB — listing needs Owner/Admin on the server too */}
        {activeTab === "credentials" &&
          (canManage ? (
            <div className="p-6 border border-border shadow-sm rounded-xl bg-card">
              <CredentialsList projectId={projectId} credentials={project.credentials || []} onUpdate={loadData} />
            </div>
          ) : (
            <AdminOnly what="the test logins stored for this project" />
          ))}

        {/* INTEGRATIONS TAB */}
        {activeTab === "integrations" &&
          (canManage ? (
            <div className="space-y-6">
              <div className="p-6 border border-border shadow-sm rounded-xl bg-card">
                <span className="text-xs font-medium text-muted-foreground block border-b pb-2 mb-4">Project-management integration</span>
                <IntegrationConnectPanel projectId={projectId} />
              </div>
              {/* Advanced OpenProject controls (parent strategy, group/board sync,
                  custom fields) — only relevant when this project uses OpenProject. */}
              {integrationProvider === "OpenProject" && (
                <div className="p-6 border border-border shadow-sm rounded-xl bg-card">
                  <span className="text-xs font-medium text-muted-foreground block border-b pb-2 mb-4">OpenProject advanced settings</span>
                  <IntegrationConfig projectId={projectId} />
                </div>
              )}
            </div>
          ) : (
            <AdminOnly what="this project's tracker connection" />
          ))}

        {/* AI PROVIDER TAB — members see what's in use; owners/admins change it */}
        {activeTab === "ai" && <ProjectAiPanel projectId={projectId} canManage={canManage} />}

        {/* TEAM TAB */}
        {activeTab === "team" && (
          <TeamPanel
            projectId={projectId}
            providerName={integrationName || integrationProvider}
            connected={integrationConnected}
            canManage={canManage}
          />
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="p-6 border border-border shadow-sm lg:col-span-2 space-y-6 rounded-xl bg-card">
              <span className="text-xs font-medium text-muted-foreground block border-b pb-2">Project details</span>
              {!canManage && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Only the project&apos;s owner and admins can change these.
                </p>
              )}
              {error && <p className="text-destructive font-medium">{error}</p>}
              {/* key: re-seed the uncontrolled inputs after a save or reload */}
              <form key={project.updatedAt} onSubmit={handleGeneralSubmit} className="space-y-4">
                <fieldset disabled={!canManage || saving} className="space-y-4 disabled:opacity-80">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-muted-foreground">Project name *</Label>
                      <Input id="name" name="name" required maxLength={200} defaultValue={project.name} className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="webAppUrl" className="text-muted-foreground">Web app URL *</Label>
                      <Input id="webAppUrl" name="webAppUrl" type="url" required defaultValue={project.webAppUrl} placeholder="https://app.example.com" className="h-9" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-muted-foreground">Description</Label>
                    <Input id="description" name="description" defaultValue={project.description || ""} className="h-9" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="environment" className="text-muted-foreground">Environment</Label>
                      <select id="environment" name="environment" defaultValue={project.environment} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                        <option value="Dev">Dev</option>
                        <option value="Staging">Staging</option>
                        <option value="UAT">UAT</option>
                        <option value="Production">Production</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="browserType" className="text-muted-foreground">Browser</Label>
                      <select id="browserType" name="browserType" defaultValue={project.browserType} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                        <option value="Chromium">Chromium</option>
                        <option value="Firefox">Firefox</option>
                        <option value="WebKit">WebKit</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="viewport" className="text-muted-foreground">Viewport</Label>
                      <select id="viewport" name="viewport" defaultValue={project.viewport} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                        <option value="Desktop">Desktop (1280×800)</option>
                        <option value="Tablet">Tablet (768×1024)</option>
                        <option value="Mobile">Mobile (375×667)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="testType" className="text-muted-foreground">Testing type</Label>
                      <select id="testType" name="testType" defaultValue={project.testType} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs">
                        <option value="E2E">End-to-end (automated)</option>
                        <option value="API">API</option>
                        <option value="Manual">Manual</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="figmaUrl" className="text-muted-foreground">Figma link</Label>
                      <Input id="figmaUrl" name="figmaUrl" type="url" defaultValue={project.figmaUrl || ""} placeholder="https://www.figma.com/design/…" className="h-9" />
                    </div>
                  </div>
                </fieldset>

                {canManage && (
                  <Button type="submit" disabled={saving} size="sm" className="h-9 px-4">
                    {saving ? "Saving…" : "Save settings"}
                  </Button>
                )}
              </form>
            </div>

            {canDeleteProject && (
              <div className="p-6 border border-destructive/30 bg-destructive/5 shadow-sm space-y-4 rounded-xl h-fit">
                <span className="text-xs font-medium text-destructive flex items-center gap-2 border-b border-destructive/20 pb-2">
                  <ShieldAlert className="h-4 w-4" /> Delete project
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Deletes this project with its test cases, runs, bugs, evidence and settings for everyone.
                  This can&apos;t be undone.
                </p>
                <Button
                  onClick={() => setDeleteOpen(true)}
                  variant="destructive"
                  size="sm"
                  className="w-full h-9 flex items-center justify-center gap-1"
                >
                  <Trash2 className="h-4 w-4" /> Delete project…
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${project.name}?`}
        description="This permanently deletes the project's test cases, runs, bugs, evidence and settings for everyone. Type the project name to confirm."
        confirmLabel="Delete project"
        variant="danger"
        requireTextConfirmation={project.name}
        onConfirm={handleDeleteProject}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}
