import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Zap, LayoutDashboard, ChevronRight, Folder } from "lucide-react"

interface Project {
  id: string
  name: string
  environment: string
  baseUrl: string
}

interface ProjectSelectionGatewayProps {
  title: string
  description: string
  targetWorkflow: string // e.g. 'test-cases', 'bug-reports', 'recorder-studio', 'live-qa-session', 'openproject-sync', 'settings'
}

export function ProjectSelectionGateway({
  title,
  description,
  targetWorkflow
}: ProjectSelectionGatewayProps) {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/projects")
        if (res.ok) {
          const data = await res.json()
          setProjects(data.projects || [])
        }
      } catch (err) {
        console.error("Error loading gateway projects:", err)
      } finally {
        setLoading(false)
      }
    }
    loadProjects()
  }, [])

  function handleSelect(projectId: string) {
    localStorage.setItem("activeProjectId", projectId)
    window.dispatchEvent(new Event("projectChanged"))
    // A "?"-prefixed target is a query on the project page (e.g. "?tab=general");
    // otherwise it's a sub-route segment (e.g. "test-cases").
    const dest = targetWorkflow.startsWith("?")
      ? `/projects/${projectId}${targetWorkflow}`
      : `/projects/${projectId}/${targetWorkflow}`
    router.replace(dest)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] py-12 px-4 max-w-xl mx-auto select-none text-xs font-semibold">
      <div className="w-full p-6 space-y-6 shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-border bg-card rounded-xl">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Zap className="h-6 w-6 fill-current" />
          </div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground font-medium max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-medium text-muted-foreground/60">Select Project Workspace</span>
          
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-12 bg-muted/50 border rounded-xl" />
              <div className="h-12 bg-muted/50 border rounded-xl" />
            </div>
          ) : projects.length === 0 ? (
            <div className="p-8 border border-dashed rounded-xl text-center space-y-3">
              <p className="text-muted-foreground italic font-medium">No projects created yet.</p>
              <Button size="sm" onClick={() => router.push("/projects/new")}>
                Create New Project
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {projects.map((proj) => (
                <div 
                  key={proj.id}
                  onClick={() => handleSelect(proj.id)}
                  className="p-3 border rounded-xl bg-card hover:bg-muted/50 border-border hover:border-border cursor-pointer flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className="h-4.5 w-4.5 text-indigo-400 fill-indigo-400/5 shrink-0" />
                    <div className="space-y-0.5 min-w-0">
                      <span className="font-semibold text-foreground truncate block group-hover:text-primary transition-colors">
                        {proj.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate block">
                        {proj.baseUrl.replace(/^https?:\/\//, "") || "No target URL"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {proj.environment}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
