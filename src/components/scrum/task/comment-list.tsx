"use client"

import { useState } from "react"
import type { ScrumComment } from "@/types/scrum"
import { useCommentMutations } from "@/hooks/scrum/use-scrum"
import { initials } from "@/components/scrum/shared"
import { formatDistanceToNow } from "date-fns"
import { Pencil, Trash2, Check, X } from "lucide-react"

function Avatar({ name, email, url }: { name: string | null; email: string; url: string | null }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-bold text-primary">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name || email} className="h-full w-full object-cover" />
      ) : (
        initials(name, email)
      )}
    </span>
  )
}

export function CommentList({
  projectId,
  taskId,
  comments,
}: {
  projectId: string
  taskId: string
  comments: ScrumComment[]
}) {
  const { add, edit, remove } = useCommentMutations(projectId, taskId)
  const [draft, setDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Comments {comments.length > 0 && <span className="text-foreground">({comments.length})</span>}
      </h4>

      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2">
            <Avatar name={c.author.name} email={c.author.email} url={c.author.avatarUrl} />
            <div className="group flex-1 rounded-lg bg-muted/50 px-3 py-2">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-xs font-semibold">{c.author.name || c.author.email}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setEditingId(c.id)
                        setEditText(c.content)
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button onClick={() => remove.mutate(c.id)} className="text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
              {editingId === c.id ? (
                <div className="flex items-center gap-1">
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      edit.mutate({ commentId: c.id, content: editText }, { onSuccess: () => setEditingId(null) })
                    }}
                    className="text-emerald-600"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-muted-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm">{c.content}</p>
              )}
            </div>
          </li>
        ))}
        {comments.length === 0 && <li className="text-sm text-muted-foreground">No comments yet.</li>}
      </ul>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          add.mutate(draft.trim(), { onSuccess: () => setDraft("") })
        }}
      >
        <input
          id="scrum-comment-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a comment…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={add.isPending}
          className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Send
        </button>
      </form>
    </div>
  )
}
