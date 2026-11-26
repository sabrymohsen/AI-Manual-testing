"use client"

import { useState } from "react"
import type { ScrumSubtask } from "@/types/scrum"
import { useSubtaskMutations, useScrumMembers } from "@/hooks/scrum/use-scrum"
import { ChevronDown, ChevronRight, Plus, Trash2, UserCircle2 } from "@/components/ui/icons"
import { Input } from "@/components/ui/input"

type Member = { id: string; name: string | null; email: string; avatarUrl?: string | null }

const displayName = (m: { name: string | null; email: string }) => m.name || m.email

/** Small avatar / initials bubble for a subtask assignee. */
function AssigneeBubble({ user }: { user: ScrumSubtask["assignee"] }) {
  if (!user) {
    return <UserCircle2 className="h-5 w-5 shrink-0 text-muted-foreground/50" />
  }
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt={displayName(user)} className="h-5 w-5 shrink-0 rounded-full object-cover" />
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold uppercase text-indigo-700">
      {displayName(user).slice(0, 2)}
    </span>
  )
}

export function SubtaskList({
  projectId,
  taskId,
  subtasks,
}: {
  projectId: string
  taskId: string
  subtasks: ScrumSubtask[]
}) {
  const { add, toggle, update, remove } = useSubtaskMutations(projectId, taskId)
  const { data: members } = useScrumMembers(projectId)
  const [title, setTitle] = useState("")
  // Which subtask rows are expanded to show description + assignee.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Local buffer so typing a description doesn't fire a request per keystroke;
  // it's committed on blur.
  const [draftDesc, setDraftDesc] = useState<Record<string, string>>({})

  const done = subtasks.filter((s) => s.completed).length
  const total = subtasks.length

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const memberList: Member[] = (members as Member[] | undefined) ?? []

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Subtasks {total > 0 && <span className="ml-1 text-foreground">{done}/{total}</span>}
        </h4>
      </div>

      {total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}

      <ul className="space-y-1">
        {subtasks.map((s) => {
          const isOpen = expanded.has(s.id)
          return (
            <li key={s.id} className="rounded border border-transparent hover:border-border">
              <div className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                <button
                  onClick={() => toggleExpanded(s.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? "Hide details" : "Show details"}
                  aria-expanded={isOpen}
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>

                <input
                  type="checkbox"
                  checked={s.completed}
                  onChange={() => toggle.mutate({ subtaskId: s.id, completed: !s.completed })}
                  className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                  aria-label={`Mark "${s.title}" ${s.completed ? "incomplete" : "complete"}`}
                />

                <span className={`flex-1 truncate text-sm ${s.completed ? "text-muted-foreground line-through" : ""}`}>
                  {s.title}
                  {/* A description exists but is hidden — hint that there's more. */}
                  {!isOpen && s.description && (
                    <span className="ml-2 text-xs text-muted-foreground">≡</span>
                  )}
                </span>

                <span title={s.assignee ? displayName(s.assignee) : "Unassigned"}>
                  <AssigneeBubble user={s.assignee} />
                </span>

                <button
                  onClick={() => remove.mutate(s.id)}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                  aria-label={`Delete subtask "${s.title}"`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {isOpen && (
                <div className="space-y-2 border-t bg-muted/20 px-3 py-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Description
                    </label>
                    <textarea
                      value={draftDesc[s.id] ?? s.description ?? ""}
                      onChange={(e) => setDraftDesc((d) => ({ ...d, [s.id]: e.target.value }))}
                      onBlur={() => {
                        const next = draftDesc[s.id]
                        // Only write when it actually changed.
                        if (next === undefined || next === (s.description ?? "")) return
                        update.mutate({ subtaskId: s.id, description: next.trim() || null })
                      }}
                      rows={3}
                      placeholder="Add more detail…"
                      className="w-full resize-y rounded-md border bg-background p-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Assignee
                    </label>
                    <select
                      value={s.assigneeId ?? ""}
                      onChange={(e) =>
                        update.mutate({ subtaskId: s.id, assigneeId: e.target.value || null })
                      }
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">Unassigned</option>
                      {memberList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {displayName(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          add.mutate({ title: title.trim() }, { onSuccess: () => setTitle("") })
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a subtask…"
          className="h-8 text-sm"
        />
        <button
          type="submit"
          disabled={add.isPending}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </form>
    </div>
  )
}
