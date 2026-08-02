"use client"

import { useEffect, useMemo, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface MemberWorkload {
  id: string
  name: string | null
  email: string
  avatarUrl: string | null
  openTasks: number
  inProgressTasks: number
  totalStoryPoints: number
}

export function TeamWorkloadWidget({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<MemberWorkload[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)

    Promise.all([
      fetch(`/api/projects/${projectId}/scrum/members`).then((r) =>
        r.ok ? r.json() : { members: [] }
      ),
      fetch(`/api/projects/${projectId}/scrum/tasks?status=TODO,IN_PROGRESS,REVIEW,TESTING`).then((r) =>
        r.ok ? r.json() : { tasks: [] }
      ),
    ])
      .then(([membersData, tasksData]) => {
        const memberList: any[] = membersData.members || []
        const tasks: any[] = tasksData.tasks || []

        const workloadMap = new Map<string, MemberWorkload>()

        // Initialize with all members
        memberList.forEach((m) => {
          workloadMap.set(m.id, {
            id: m.id,
            name: m.name,
            email: m.email,
            avatarUrl: m.avatarUrl,
            openTasks: 0,
            inProgressTasks: 0,
            totalStoryPoints: 0,
          })
        })

        // Count tasks per assignee
        tasks.forEach((task) => {
          const assignees = task.assignees || []
          assignees.forEach((assignee: any) => {
            const existing = workloadMap.get(assignee.id)
            if (existing) {
              existing.openTasks += 1
              if (task.status === "IN_PROGRESS") {
                existing.inProgressTasks += 1
              }
              existing.totalStoryPoints += task.storyPoints || 0
            }
          })
        })

        setMembers(Array.from(workloadMap.values()).sort((a, b) => b.openTasks - a.openTasks))
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }, [projectId])

  const maxTasks = useMemo(() => Math.max(1, ...members.map((m) => m.openTasks)), [members])

  return (
    <div className="rounded-2xl border border-slate-100 bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <Users className="h-4 w-4 text-indigo-600" />
        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Team Workload</span>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No team members in this project.</p>
        ) : (
          <div className="space-y-3">
            {members.map((member) => {
              const percent = Math.round((member.openTasks / maxTasks) * 100)
              const isOverloaded = member.openTasks >= 5
              return (
                <div key={member.id} className="flex items-center gap-3">
                  <div className="shrink-0">
                    {member.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={member.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-[9px] font-bold text-indigo-600">
                        {(member.name || member.email || "?")[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="truncate text-xs font-semibold text-slate-700">
                        {member.name || member.email}
                        {isOverloaded && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        {member.openTasks} open
                        {member.inProgressTasks > 0 && (
                          <span className="text-blue-500"> · {member.inProgressTasks} in prog</span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isOverloaded ? "bg-amber-500" : "bg-indigo-500"
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
