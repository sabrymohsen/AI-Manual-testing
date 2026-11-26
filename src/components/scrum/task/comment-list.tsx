"use client"

import { useMemo, useRef, useState } from "react"
import type { ScrumComment, ScrumMember } from "@/types/scrum"
import { useCommentMutations, useScrumMembers } from "@/hooks/scrum/use-scrum"
import { mentionsToPlain, plainToMentions, splitMentions } from "@/lib/scrum/mentions"
import { initials } from "@/components/scrum/shared"
import { formatDistanceToNow } from "date-fns"
import { Pencil, Trash2, Check, X } from "@/components/ui/icons"

function Avatar({ name, email, url }: { name: string | null; email: string; url: string | null }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name || email} className="h-full w-full object-cover" />
      ) : (
        initials(name, email)
      )}
    </span>
  )
}

type Picked = { name: string; id: string }

/** Comment text with @mentions shown as highlighted names. */
function CommentBody({ content }: { content: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm">
      {splitMentions(content).map((part, i) =>
        "mention" in part ? (
          <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">@{part.mention}</span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  )
}

/**
 * Text box that offers project members after "@". Picking one inserts
 * "@Name" and remembers who it was, so the comment can be saved with the
 * person's id even though the box shows only the name.
 */
function MentionInput({
  projectId,
  value,
  onChange,
  picked,
  onPick,
  onSubmit,
  placeholder,
  autoFocus,
  id,
}: {
  projectId: string
  value: string
  onChange: (v: string) => void
  picked: Picked[]
  onPick: (p: Picked[]) => void
  onSubmit?: () => void
  placeholder?: string
  autoFocus?: boolean
  id?: string
}) {
  const { data: members = [] } = useScrumMembers(projectId)
  const ref = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null)
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    if (!query) return []
    const q = query.text.toLowerCase()
    return members
      .filter((m: ScrumMember) => (m.name || "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .slice(0, 6)
  }, [members, query])

  const detect = (text: string, caret: number) => {
    const upto = text.slice(0, caret)
    const m = upto.match(/(^|\s)@([^\s@]{0,30})$/)
    setQuery(m ? { start: caret - m[2].length - 1, text: m[2] } : null)
    setActive(0)
  }

  const choose = (m: ScrumMember) => {
    if (!query) return
    const name = (m.name || m.email.split("@")[0]).trim()
    const caret = query.start + 1 + query.text.length
    const next = `${value.slice(0, query.start)}@${name} ${value.slice(caret)}`
    onChange(next)
    if (!picked.some((p) => p.id === m.id)) onPick([...picked, { name, id: m.id }])
    setQuery(null)
    requestAnimationFrame(() => {
      const pos = query.start + name.length + 2
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="relative flex-1">
      <textarea
        id={id}
        ref={ref}
        rows={value.includes("\n") ? 3 : 1}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={(e) => {
          if (query && matches.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(matches[active]); return }
            if (e.key === "Escape") { setQuery(null); return }
          }
          if (e.key === "Enter" && !e.shiftKey && onSubmit) {
            e.preventDefault()
            onSubmit()
          }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {query && matches.length > 0 && (
        <ul className="absolute bottom-full left-0 z-30 mb-1 w-64 overflow-hidden rounded-md border bg-popover shadow-lg">
          {matches.map((m: ScrumMember, i: number) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); choose(m) }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === active ? "bg-accent" : "hover:bg-accent"}`}
              >
                <Avatar name={m.name} email={m.email} url={m.avatarUrl} />
                <span className="truncate">
                  {m.name || m.email}
                  {m.name && <span className="ml-1 text-xs text-muted-foreground">{m.email}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const [draftPicked, setDraftPicked] = useState<Picked[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editPicked, setEditPicked] = useState<Picked[]>([])

  const send = () => {
    if (!draft.trim()) return
    add.mutate(plainToMentions(draft.trim(), draftPicked), {
      onSuccess: () => {
        setDraft("")
        setDraftPicked([])
      },
    })
  }
  const saveEdit = (commentId: string) => {
    if (!editText.trim()) return
    edit.mutate({ commentId, content: plainToMentions(editText.trim(), editPicked) }, { onSuccess: () => setEditingId(null) })
  }

  return (
    <div className="space-y-3">
      <h4 className="title-4 text-foreground">
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
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        const plain = mentionsToPlain(c.content)
                        setEditingId(c.id)
                        setEditText(plain.text)
                        setEditPicked(plain.mentions)
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
                  <MentionInput
                    projectId={projectId}
                    value={editText}
                    onChange={setEditText}
                    picked={editPicked}
                    onPick={setEditPicked}
                    onSubmit={() => saveEdit(c.id)}
                    autoFocus
                  />
                  <button onClick={() => saveEdit(c.id)} className="text-emerald-600" aria-label="Save comment">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-muted-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <CommentBody content={c.content} />
              )}
            </div>
          </li>
        ))}
        {comments.length === 0 && <li className="text-sm text-muted-foreground">No comments yet.</li>}
      </ul>

      <form
        className="flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <MentionInput
          id="scrum-comment-input"
          projectId={projectId}
          value={draft}
          onChange={setDraft}
          picked={draftPicked}
          onPick={setDraftPicked}
          onSubmit={send}
          placeholder="Write a comment… type @ to mention someone"
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
