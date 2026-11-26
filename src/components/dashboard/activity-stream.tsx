"use client"

import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity, GitCommit, MessageSquare, CheckCircle2, Bug, FileText, Zap, UserPlus } from "@/components/ui/icons"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

interface ActivityItem {
  id: string
  action: string
  details: string | null
  user: { id: string; name: string | null; avatarUrl: string | null } | null
  createdAt: string
  taskId?: string | null
  taskKey?: string | null
  taskTitle?: string | null
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  STATUS_CHANGED: <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />,
  COMMENT_ADDED: <MessageSquare className="h-3.5 w-3.5 text-primary" />,
  TASK_CREATED: <FileText className="h-3.5 w-3.5 text-emerald-500" />,
  TASK_ASSIGNED: <UserPlus className="h-3.5 w-3.5 text-violet-500" />,
  BUG_REPORTED: <Bug className="h-3.5 w-3.5 text-rose-500" />,
  SPRINT_STARTED: <Zap className="h-3.5 w-3.5 text-amber-500" />,
  SPRINT_COMPLETED: <Zap className="h-3.5 w-3.5 text-emerald-500" />,
  WORK_LOGGED: <Activity className="h-3.5 w-3.5 text-muted-foreground" />,
}

const ACTION_LABELS: Record<string, string> = {
  STATUS_CHANGED: "changed status",
  COMMENT_ADDED: "commented on",
  TASK_CREATED: "created",
  TASK_ASSIGNED: "assigned",
  BUG_REPORTED: "reported",
  SPRINT_STARTED: "started sprint",
  SPRINT_COMPLETED: "completed sprint",
  WORK_LOGGED: "logged work on",
}

function getIcon(action: string) {
  return ACTION_ICONS[action] || <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
}

function getLabel(action: string) {
  return ACTION_LABELS[action] || action.toLowerCase().replace(/_/g, " ")
}

export function ActivityStream({ projectId }: { projectId: string }) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)

    fetch(`/api/projects/${projectId}/scrum/activities?limit=20`)
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((data) => {
        const list = (data.activities || []).map((a: any) => ({
          id: a.id,
          action: a.action,
          details: a.details,
          user: a.user,
          createdAt: a.createdAt,
          taskId: a.taskId,
          taskKey: a.task?.key || null,
          taskTitle: a.task?.title || null,
        }))
        setActivities(list)
      })
      .catch(() => setActivities([]))
      .finally(() => setLoading(false))
  }, [projectId])

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-6 py-3">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-foreground">Activity Stream</span>
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Activity className="h-8 w-8 text-slate-200" />
            <p className="text-xs text-muted-foreground font-medium">No recent activity in this project.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {activities.map((item) => (
              <div key={item.id} className="flex gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="mt-0.5 shrink-0">
                  {item.user?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {(item.user?.name || "?")[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">
                    <span className="font-semibold">{item.user?.name || "Someone"}</span>{" "}
                    <span className="text-muted-foreground">{getLabel(item.action)}</span>{" "}
                    {item.taskKey && (
                      <span className="font-mono text-xs font-semibold text-primary">{item.taskKey}</span>
                    )}
                    {item.taskTitle && !item.taskKey && (
                      <span className="font-medium text-muted-foreground">{item.taskTitle}</span>
                    )}
                  </p>
                  {item.details && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.details}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="mt-0.5 shrink-0">{getIcon(item.action)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
