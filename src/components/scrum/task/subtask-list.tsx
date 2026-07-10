"use client"

import { useState } from "react"
import type { ScrumSubtask } from "@/types/scrum"
import { useSubtaskMutations } from "@/hooks/scrum/use-scrum"
import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"

export function SubtaskList({
  projectId,
  taskId,
  subtasks,
}: {
  projectId: string
  taskId: string
  subtasks: ScrumSubtask[]
}) {
  const { add, toggle, remove } = useSubtaskMutations(projectId, taskId)
  const [title, setTitle] = useState("")
  const done = subtasks.filter((s) => s.completed).length
  const total = subtasks.length

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
        {subtasks.map((s) => (
          <li key={s.id} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50">
            <input
              type="checkbox"
              checked={s.completed}
              onChange={() => toggle.mutate({ subtaskId: s.id, completed: !s.completed })}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className={`flex-1 text-sm ${s.completed ? "text-muted-foreground line-through" : ""}`}>
              {s.title}
            </span>
            <button
              onClick={() => remove.mutate(s.id)}
              className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          add.mutate(title.trim(), { onSuccess: () => setTitle("") })
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
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </form>
    </div>
  )
}
