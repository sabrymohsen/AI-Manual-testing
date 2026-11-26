"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { User, Bug, FileText, Clock, AlertCircle } from "@/components/ui/icons"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

interface MyTask {
  id: string
  key: string
  title: string
  type: "STORY" | "TASK" | "BUG" | "TEST_CASE" | string
  status: string
  priority: string
  projectId: string
  updatedAt: string
}

interface MyBug {
  id: string
  bugKey: string | null
  title: string
  severity: string
  status: string
  projectId: string
  updatedAt: string
}

export function AssignedToMeWidget({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [bugs, setBugs] = useState<MyBug[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"tasks" | "bugs">("tasks")

  useEffect(() => {
    if (!projectId) return
    setLoading(true)

    Promise.all([
      fetch(`/api/projects/${projectId}/scrum/tasks?assignee=me&status=TODO,IN_PROGRESS,REVIEW,TESTING`).then(r =>
        r.ok ? r.json() : { tasks: [] }
      ),
      fetch(`/api/projects/${projectId}/bug-reports?status=Open,InProgress&limit=20`).then(r =>
        r.ok ? r.json() : { bugReports: [] }
      ),
    ])
      .then(([taskData, bugData]) => {
        setTasks((taskData.tasks || []).slice(0, 8))
        // Filter bugs to only show those relevant to current user context
        setBugs((bugData.bugReports || []).slice(0, 8))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectId])

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      TODO: "bg-muted text-muted-foreground",
      IN_PROGRESS: "bg-blue-100 text-blue-700",
      REVIEW: "bg-violet-100 text-violet-700",
      TESTING: "bg-amber-100 text-amber-700",
      DONE: "bg-emerald-100 text-emerald-700",
      Open: "bg-red-100 text-red-700",
      InProgress: "bg-amber-100 text-amber-700",
    }
    return map[status] || "bg-muted text-muted-foreground"
  }

  const priorityColor = (p: string) => {
    const map: Record<string, string> = {
      HIGHEST: "text-red-500",
      HIGH: "text-orange-500",
      MEDIUM: "text-amber-500",
      LOW: "text-blue-400",
      LOWEST: "text-muted-foreground",
    }
    return map[p] || "text-muted-foreground"
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-foreground">Assigned to Me</span>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => setTab("tasks")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
              tab === "tasks" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setTab("bugs")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
              tab === "bugs" ? "bg-rose-600 text-white" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            Bugs ({bugs.length})
          </button>
        </div>
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : tab === "tasks" && tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <FileText className="h-8 w-8 text-slate-200" />
            <p className="text-xs text-muted-foreground font-medium">No open tasks assigned to you.</p>
          </div>
        ) : tab === "bugs" && bugs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-slate-200" />
            <p className="text-xs text-muted-foreground font-medium">No open bugs assigned to you.</p>
          </div>
        ) : tab === "tasks" ? (
          <div className="divide-y divide-slate-50">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => router.push(`/projects/${projectId}/scrum?task=${task.id}`)}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors"
              >
                <span className="shrink-0 font-mono text-xs font-semibold text-primary">{task.key}</span>
                <span className="flex-1 truncate text-xs font-medium text-foreground">{task.title}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusColor(task.status))}>
                  {task.status.replace("_", " ")}
                </span>
                <span className={cn("text-xs font-semibold", priorityColor(task.priority))}>{task.priority[0]}</span>
                <span className="text-xs text-muted-foreground">
                  <Clock className="inline h-3 w-3 mr-0.5" />
                  {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {bugs.map((bug) => (
              <div
                key={bug.id}
                onClick={() => router.push(`/projects/${projectId}/bug-reports`)}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors"
              >
                <Bug className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                <span className="shrink-0 font-mono text-xs font-semibold text-rose-600">{bug.bugKey || "BUG"}</span>
                <span className="flex-1 truncate text-xs font-medium text-foreground">{bug.title}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusColor(bug.status))}>
                  {bug.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  <Clock className="inline h-3 w-3 mr-0.5" />
                  {formatDistanceToNow(new Date(bug.updatedAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
