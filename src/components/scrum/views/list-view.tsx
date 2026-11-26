"use client"

/**
 * List view: every issue matching the filters in one sortable table, with the
 * fields a team plans by (type, points, sprint, epic), multi-select for bulk
 * edits, and CSV export of what's on screen.
 */
import { useConfirm } from "@/components/ui/alert-provider"
import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ScrumTask, TaskFilters, TaskPriority, TaskStatus } from "@/types/scrum"
import { useScrumEpics, useScrumMembers, useScrumSprints, useScrumTasks } from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { AvatarStack, PriorityBadge, PriorityIcon, STATUS_META, STATUS_ORDER, StatusIcon, TYPE_DOT, ViewError, overdueDays } from "@/components/scrum/shared"
import { BusyDot, Skeleton } from "@/components/ui/skeleton"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PermissionGate } from "@/components/permissions/PermissionGate"
import { ArrowUpDown, ChevronDown, Download, Trash2, X } from "@/components/ui/icons"
import { format } from "date-fns"
import { toast } from "sonner"

type SortField = "title" | "priority" | "dueDate" | "createdAt" | "boardRank"
const PRIORITIES: TaskPriority[] = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"]
const TYPE_LABEL: Record<string, string> = { STORY: "Story", TASK: "Task", BUG: "Bug", TEST_CASE: "Test case", SUBTASK: "Subtask", EPIC: "Epic" }

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function ListView({ projectId, filters }: { projectId: string; filters: TaskFilters }) {
  const [sort, setSort] = useState<SortField>("boardRank")
  const { data: tasks, isLoading, isError, error: tasksError, refetch: refetchTasks } = useScrumTasks(projectId, { ...filters, sort })
  const { data: sprints } = useScrumSprints(projectId)
  const { data: epics } = useScrumEpics(projectId)
  const { data: members } = useScrumMembers(projectId)
  const { openTask } = useScrumUI()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const sprintName = useMemo(() => new Map((sprints ?? []).map((s) => [s.id, s.name])), [sprints])
  const rows = tasks ?? []
  const visibleIds = rows.map((t) => t.id)
  const chosen = [...selected].filter((id) => visibleIds.includes(id))
  const allChosen = rows.length > 0 && chosen.length === rows.length

  const bulk = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/projects/${projectId}/scrum/tasks/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, taskIds: chosen }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Couldn't update the issues")
      return data as { affected: number }
    },
    onSuccess: (d, body) => {
      qc.invalidateQueries({ queryKey: ["scrum", projectId], refetchType: "all" })
      toast.success(`${body.action === "delete" ? "Deleted" : "Updated"} ${d.affected} issue${d.affected === 1 ? "" : "s"}`)
      if (body.action === "delete") setSelected(new Set())
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const exportCsv = () => {
    const list = chosen.length ? rows.filter((t) => selected.has(t.id)) : rows
    const header = ["Key", "Title", "Type", "Status", "Priority", "Story points", "Sprint", "Epic", "Assignees", "Labels", "Due date", "Created"]
    const lines = list.map((t: ScrumTask) =>
      [
        t.key,
        t.title,
        TYPE_LABEL[t.type] || t.type,
        STATUS_META[t.status]?.label || t.status,
        t.priority,
        t.storyPoints ?? "",
        t.sprintId ? sprintName.get(t.sprintId) || "" : "Backlog",
        t.epic?.title || "",
        t.assignees.map((a) => a.name || a.email).join("; "),
        (t.labels || []).join("; "),
        t.dueDate ? t.dueDate.slice(0, 10) : "",
        t.createdAt.slice(0, 10),
      ]
        .map(csvCell)
        .join(",")
    )
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `issues-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const Header = ({ field, label }: { field: SortField; label: string }) => (
    <button onClick={() => setSort(field)} className="inline-flex items-center gap-1 font-semibold hover:text-foreground">
      {label}
      {sort === field ? <ChevronDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  )

  if (isError) return <ViewError error={tasksError} onRetry={() => refetchTasks()} />
  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />

  const menuBtn = "inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {rows.length} issue{rows.length === 1 ? "" : "s"}
          {chosen.length > 0 && <> · <b className="text-foreground">{chosen.length} selected</b></>}
        </span>
        {chosen.length > 0 && (
          <PermissionGate permission="canCreateStories">
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger className={menuBtn} disabled={bulk.isPending}>Status <ChevronDown className="h-3 w-3" /></DropdownMenuTrigger>
                <DropdownMenuContent>
                  {STATUS_ORDER.map((st: TaskStatus) => (
                    <DropdownMenuItem key={st} onClick={() => bulk.mutate({ action: "update", status: st })} className="gap-2 text-sm">
                      <StatusIcon status={st} /> {STATUS_META[st].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger className={menuBtn} disabled={bulk.isPending}>Priority <ChevronDown className="h-3 w-3" /></DropdownMenuTrigger>
                <DropdownMenuContent>
                  {PRIORITIES.map((p) => (
                    <DropdownMenuItem key={p} onClick={() => bulk.mutate({ action: "update", priority: p })}><PriorityBadge priority={p} /></DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger className={menuBtn} disabled={bulk.isPending}>Sprint <ChevronDown className="h-3 w-3" /></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => bulk.mutate({ action: "move", sprintId: null })} className="text-sm">Backlog</DropdownMenuItem>
                  {(sprints ?? []).filter((s) => s.status !== "COMPLETED").map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => bulk.mutate({ action: "move", sprintId: s.id })} className="text-sm">{s.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger className={menuBtn} disabled={bulk.isPending}>Epic <ChevronDown className="h-3 w-3" /></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => bulk.mutate({ action: "update", epicId: null })} className="text-sm text-muted-foreground">No epic</DropdownMenuItem>
                  {(epics ?? []).map((e) => (
                    <DropdownMenuItem key={e.id} onClick={() => bulk.mutate({ action: "update", epicId: e.id })} className="gap-2 text-sm">
                      <span className="h-2 w-2 rounded-full" style={{ background: e.color }} /> {e.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger className={menuBtn} disabled={bulk.isPending}>Assign <ChevronDown className="h-3 w-3" /></DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuItem onClick={() => bulk.mutate({ action: "update", assigneeIds: [] })} className="text-sm text-muted-foreground">Unassigned</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Assign to</DropdownMenuLabel>
                  {(members ?? []).map((m) => (
                    <DropdownMenuItem key={m.id} onClick={() => bulk.mutate({ action: "update", assigneeIds: [m.id] })} className="text-sm">{m.name || m.email}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <PermissionGate permission="canDeleteStories">
                <button
                  className={`${menuBtn} text-destructive`}
                  disabled={bulk.isPending}
                  onClick={async () => {
                    const n = chosen.length
                    const ok = await confirm({ title: `Delete ${n} issue${n === 1 ? "" : "s"}?`, description: "This cannot be undone.", confirmLabel: "Delete", variant: "danger" })
                    if (ok) bulk.mutate({ action: "delete" })
                  }}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </PermissionGate>
              {bulk.isPending && <BusyDot />}
              <button className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())} aria-label="Clear selection">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </PermissionGate>
        )}
        <button onClick={exportCsv} disabled={!rows.length} className={`${menuBtn} ml-auto`} title="Download as CSV (opens in Excel)">
          <Download className="h-3.5 w-3.5" /> Export {chosen.length ? "selected" : "CSV"}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] whitespace-nowrap text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                <th className="w-8 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allChosen}
                    onChange={() => setSelected(allChosen ? new Set() : new Set(visibleIds))}
                  />
                </th>
                <th className="px-3 py-3">Key</th>
                <th className="w-full px-3 py-3"><Header field="title" label="Title" /></th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3"><Header field="priority" label="Priority" /></th>
                <th className="px-3 py-3 text-right">Points</th>
                <th className="px-3 py-3">Sprint</th>
                <th className="px-3 py-3">Epic</th>
                <th className="px-3 py-3">Assignees</th>
                <th className="px-3 py-3"><Header field="dueDate" label="Due" /></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const overdue = overdueDays(t.dueDate, t.status)
                const isSel = selected.has(t.id)
                return (
                  <tr key={t.id} onClick={() => openTask(t.id)} className={`h-9 cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/50 ${isSel ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${t.key}`} checked={isSel} onChange={() => toggle(t.id)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">{t.key}</td>
                    <td className="max-w-0 truncate px-3 py-3 text-xs font-medium text-foreground" title={t.title}>{t.title}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${TYPE_DOT[t.type] ?? "bg-muted-foreground"}`} />
                        {TYPE_LABEL[t.type] || t.type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2 text-xs text-foreground">
                        <StatusIcon status={t.status} />
                        {STATUS_META[t.status].label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <PriorityIcon priority={t.priority} />
                        {t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-xs">{t.storyPoints ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="max-w-[140px] truncate px-3 py-3 text-xs text-muted-foreground">{t.sprintId ? sprintName.get(t.sprintId) || "—" : "Backlog"}</td>
                    <td className="max-w-[160px] px-3 py-3 text-xs">
                      {t.epic ? (
                        <span className="inline-flex max-w-full items-center gap-2 truncate">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.epic.color }} />
                          <span className="truncate">{t.epic.title}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {t.assignees.length ? <AvatarStack members={t.assignees} size="sm" /> : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
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
              {rows.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">No issues match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
