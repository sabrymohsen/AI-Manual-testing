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
  Owner: "bg-purple-100 text-purple-700",
  Admin: "bg-blue-100 text-blue-700",
  Member: "bg-slate-100 text-slate-600",
  Viewer: "bg-slate-50 text-slate-500",
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
    <div className="p-4 border-b space-y-1.5 select-none" ref={ref}>
      <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60">Selected Scope</span>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-xs hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-indigo-500"
        >
          <span className="flex items-center gap-2 truncate">
            <FolderKanban className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="truncate font-semibold">
              {active?.name || (loading ? "Loading…" : projects.length === 0 ? "No projects" : "Select project")}
            </span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-10 z-50 max-h-80 overflow-y-auto rounded-lg border bg-popover shadow-lg py-1">
            <div className="px-3 py-1 text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60">
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
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/40 ${
                  p.id === activeProjectId ? "bg-indigo-50" : ""
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {p.id === activeProjectId ? (
                    <Check className="h-3 w-3 shrink-0 text-indigo-600" />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span className="truncate font-medium">{p.name}</span>
                </span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${ROLE_BADGE[p.role] || ROLE_BADGE.Member}`}>
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
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-indigo-600 hover:bg-accent/40"
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
