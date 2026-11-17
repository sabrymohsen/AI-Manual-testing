"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FolderKanban, ChevronDown, Plus, FolderOpen, Check } from "lucide-react"

interface SwitcherProject {
  id: string
  name: string
  environment?: string
  role: string
}

const ROLE_BADGE: Record<string, string> = {
  Owner: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  Admin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Member: "bg-muted text-muted-foreground",
  Viewer: "bg-muted text-muted-foreground",
}

// The project list is owned by the dashboard layout so that the selected
// project and the list shown here can never disagree.
export function ProjectSwitcher({
  projects,
  canCreateProject,
  loading,
  activeProjectId,
  onSelect,
}: {
  projects: SwitcherProject[]
  canCreateProject: boolean
  loading: boolean
  activeProjectId: string
  onSelect: (projectId: string) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const active = projects.find((p) => p.id === activeProjectId)

  return (
    <div className="select-none px-2 pb-1" ref={ref}>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 truncate">
            <FolderKanban className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate font-medium">
              {active?.name || (loading ? "Loading…" : projects.length === 0 ? "No projects" : "Select project")}
            </span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-9 z-50 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
              Your Projects
            </div>
            {projects.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No projects yet.</div>
            )}
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onSelect(p.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent ${
                  p.id === activeProjectId ? "bg-primary/10" : ""
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {p.id === activeProjectId ? (
                    <Check className="h-3 w-3 shrink-0 text-primary" />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span className="truncate font-medium">{p.name}</span>
                </span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE[p.role] || ROLE_BADGE.Member}`}>
                  {p.role}
                </span>
              </button>
            ))}

            <div className="my-1 border-t" />
            <button
              onClick={() => {
                router.push("/projects")
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent/40"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Manage Projects
            </button>
            {canCreateProject && (
              <button
                onClick={() => {
                  router.push("/projects/new")
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-primary hover:bg-accent/40"
              >
                <Plus className="h-3.5 w-3.5" /> Create New Project
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
