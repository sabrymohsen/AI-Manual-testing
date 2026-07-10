"use client"

import { useState } from "react"
import type { TaskFilters } from "@/types/scrum"
import { useScrumTasks } from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { PriorityBadge, STATUS_META, AvatarStack, overdueDays } from "@/components/scrum/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react"
import { format } from "date-fns"

type SortField = "title" | "priority" | "dueDate" | "createdAt" | "boardRank"

export function ListView({ projectId, filters }: { projectId: string; filters: TaskFilters }) {
  const [sort, setSort] = useState<SortField>("boardRank")
  const { data: tasks, isLoading } = useScrumTasks(projectId, { ...filters, sort })
  const { openTask } = useScrumUI()

  const Header = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => setSort(field)}
      className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
    >
      {label}
      {sort === field ? <ChevronDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  )

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5">ID</th>
              <th className="px-4 py-2.5"><Header field="title" label="Title" /></th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5"><Header field="priority" label="Priority" /></th>
              <th className="px-4 py-2.5">Assignees</th>
              <th className="px-4 py-2.5"><Header field="dueDate" label="Due" /></th>
            </tr>
          </thead>
          <tbody>
            {(tasks ?? []).map((t) => {
              const overdue = overdueDays(t.dueDate, t.status)
              return (
                <tr
                  key={t.id}
                  onClick={() => openTask(t.id)}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-2.5 font-mono text-xs font-bold text-primary">{t.key}</td>
                  <td className="px-4 py-2.5 font-medium">{t.title}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`h-2 w-2 rounded-full ${STATUS_META[t.status].dot}`} />
                      {STATUS_META[t.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-4 py-2.5">
                    {t.assignees.length ? <AvatarStack members={t.assignees} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {t.dueDate ? (
                      <span className={overdue ? "font-semibold text-red-600" : "text-muted-foreground"}>
                        {format(new Date(t.dueDate), "MMM d")}
                        {overdue ? ` · ${overdue}d late` : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {tasks?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No tasks found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
