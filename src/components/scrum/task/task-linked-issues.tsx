"use client"

import { useMemo, useState } from "react"
import type { ScrumTask, TaskLinkRef, TaskLinkType } from "@/types/scrum"
import { useScrumTasks, useTaskDetailMutations } from "@/hooks/scrum/use-scrum"
import { useScrumUI } from "@/stores/scrum-ui"
import { LINK_TYPE_META, LINK_TYPES, STATUS_COLORS, TYPE_META } from "./task-detail-config"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Plus, X, Link2, Search } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

export function TaskLinkedIssues({
  projectId,
  task,
}: {
  projectId: string
  task: ScrumTask
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { deleteLink } = useTaskDetailMutations(projectId, task.id)
  const { openTask } = useScrumUI()
  const links = task.links ?? []

  // Group links by their phrasing so blocks / relates-to / etc. cluster together.
  const grouped = useMemo(() => {
    const map = new Map<string, TaskLinkRef[]>()
    for (const l of links) {
      if (!map.has(l.type)) map.set(l.type, [])
      map.get(l.type)!.push(l)
    }
    return [...map.entries()]
  }, [links])

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="title-4 flex items-center gap-2 text-foreground">
          <Link2 className="h-3.5 w-3.5" /> Linked issues {links.length > 0 && <span className="text-foreground">({links.length})</span>}
        </h4>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-3 w-3" /> Link issue
        </button>
      </div>

      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">No linked issues.</p>
      ) : (
        <div className="space-y-3">
          {grouped.map(([type, group]) => {
            const meta = LINK_TYPE_META[type] ?? LINK_TYPE_META["relates to"]
            const Icon = meta.icon
            return (
              <div key={type} className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium capitalize text-muted-foreground">
                  <Icon className={cn("h-3.5 w-3.5", meta.color)} /> {type}
                </div>
                <ul className="space-y-1">
                  {group.map((l) => {
                    const TypeIcon = TYPE_META[l.task.type]?.icon ?? Link2
                    const sc = STATUS_COLORS[l.task.status]
                    return (
                      <li
                        key={l.id}
                        className="group flex items-center gap-2 rounded border border-border px-2 py-2 text-sm hover:border-primary/40 hover:bg-muted/40"
                      >
                        <TypeIcon className={cn("h-3.5 w-3.5 shrink-0", TYPE_META[l.task.type]?.color)} />
                        <button
                          onClick={() => openTask(l.task.id)}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          {l.task.key}
                        </button>
                        <span className="flex-1 truncate">{l.task.title}</span>
                        <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", sc.bg, sc.text)}>
                          {sc.label}
                        </span>
                        <button
                          onClick={() => deleteLink.mutate(l.id)}
                          className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                          title="Remove link"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      <LinkIssueDialog projectId={projectId} task={task} open={dialogOpen} onOpenChange={setDialogOpen} />
    </section>
  )
}

function LinkIssueDialog({
  projectId,
  task,
  open,
  onOpenChange,
}: {
  projectId: string
  task: ScrumTask
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [type, setType] = useState<TaskLinkType>("relates to")
  const [query, setQuery] = useState("")
  const { data: allTasks } = useScrumTasks(projectId, {})
  const { createLink } = useTaskDetailMutations(projectId, task.id)

  const linkedIds = new Set((task.links ?? []).map((l) => l.task.id))

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (allTasks ?? [])
      .filter((t) => t.id !== task.id && !linkedIds.has(t.id))
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q))
      .slice(0, 40)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, query, task.id])

  const submit = (targetId: string) => {
    createLink.mutate({ targetId, type }, { onSuccess: () => onOpenChange(false) })
  }

  const linkMeta = LINK_TYPE_META[type] ?? LINK_TYPE_META["relates to"]
  const LinkIcon = linkMeta.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" /> Link issue
          </DialogTitle>
          <DialogDescription>
            Link <span className="font-mono font-semibold text-foreground">{task.key}</span> to another issue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {/* Relationship chips */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Relationship</label>
            <div className="flex flex-wrap gap-2">
              {LINK_TYPES.map((t) => {
                const meta = LINK_TYPE_META[t] ?? LINK_TYPE_META["relates to"]
                const Icon = meta.icon
                const on = type === t
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                      on ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", on ? "text-primary" : meta.color)} /> {t}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Search */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Search issue</label>
            <div className="flex items-center gap-2 rounded-lg border border-input px-3 focus-within:ring-1 focus-within:ring-ring">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by key or title…"
                className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* Preview of the relationship being created */}
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{task.key}</span>
            <LinkIcon className={cn("h-3.5 w-3.5", linkMeta.color)} />
            <span className="capitalize">{type}</span>
            <span>the selected issue below.</span>
          </div>

          {/* Results */}
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
            {results.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-2 py-8 text-center">
                <Search className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">{query ? "No matching issues." : "Start typing to search issues."}</p>
              </div>
            ) : (
              results.map((t) => {
                const TypeIcon = TYPE_META[t.type]?.icon ?? Link2
                const sc = STATUS_COLORS[t.status]
                return (
                  <button
                    key={t.id}
                    onClick={() => submit(t.id)}
                    disabled={createLink.isPending}
                    className="flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-primary/30 hover:bg-muted disabled:opacity-50"
                  >
                    <TypeIcon className={cn("h-4 w-4 shrink-0", TYPE_META[t.type]?.color)} />
                    <span className="font-mono text-xs font-semibold text-primary">{t.key}</span>
                    <span className="flex-1 truncate text-foreground">{t.title}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", sc.bg, sc.text)}>{sc.label}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
