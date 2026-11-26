"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { MessageSquarePlus, AtSign, Check, CheckCircle2, Trash2, CornerDownRight, Loader2, Quote, X, FileText } from "@/components/ui/icons"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { normalize } from "@/lib/brd/text-utils"

interface Member { id: string; name: string | null; email: string }
interface Comment {
  id: string
  text: string | null
  quote: string | null
  parentId: string | null
  resolved: boolean
  mentionIds: string[]
  authorId: string | null
  authorName: string | null
  createdAt: string
  type: string
  page: number | null
  versionNumber: number | null
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(d).toLocaleDateString()
}

/** Render comment body with @mentions bolded. */
function renderBody(text: string) {
  return text.split(/(@[\p{L}][\p{L}\s]*?(?=\s@|[.,!?]|$)|@[\w.-]+)/u).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="rounded bg-primary/10 px-1 font-semibold text-primary">{part.trim()}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

/**
 * Comments panel for a BRD: threaded comments anchored to a quoted section,
 * with @mentions that notify teammates. `getSelectedText` lets the caller pass
 * the current document text selection as the quote for a new comment.
 *
 * Anchoring: clicking a quote asks the document to scroll to and highlight it;
 * when the quote no longer appears in the current text (`docText`), the
 * comment is marked "Outdated" so reviewers know it refers to old wording.
 * PDFs can't expose their text selection, so a PDF comment carries a page
 * number instead and clicking it jumps the viewer to that page.
 */
export function BrdCommentsPanel({
  brdId,
  projectId,
  currentUserId,
  getSelectedText,
  docText,
  onJumpToQuote,
  isPdf,
  onJumpToPage,
}: {
  brdId: string
  projectId: string
  currentUserId: string
  getSelectedText?: () => string
  /** Plain text of the version on screen; enables "Outdated" detection. */
  docText?: string
  onJumpToQuote?: (quote: string) => void
  isPdf?: boolean
  onJumpToPage?: (page: number) => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [quote, setQuote] = useState("")
  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [mentionFor, setMentionFor] = useState<"new" | "reply" | null>(null)
  const [page, setPage] = useState("")
  const [pendingDelete, setPendingDelete] = useState<Comment | null>(null)
  const normDoc = docText ? normalize(docText) : null
  const isOutdated = (c: Comment) => !!(c.quote && normDoc !== null && !normDoc.includes(normalize(c.quote)))

  const load = useCallback(() => {
    fetch(`/api/brds/${brdId}/annotations`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setComments((d.annotations as Comment[]).filter((a) => a.type === "comment")) })
      .finally(() => setLoading(false))
  }, [brdId])

  useEffect(() => {
    load()
    fetch(`/api/projects/${projectId}/scrum/members`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setMembers(d.members || []) })
  }, [load, projectId])

  function startComment() {
    const sel = getSelectedText?.() || ""
    setQuote(sel.slice(0, 300))
    setText("")
    setPage("")
    setComposerOpen(true)
  }

  function insertMention(target: "new" | "reply", m: Member) {
    const tag = `@${m.name || m.email} `
    if (target === "new") setText((t) => t + tag)
    else setReplyText((t) => t + tag)
    setMentionFor(null)
  }

  async function submit(parentId: string | null, bodyText: string, q: string) {
    if (!bodyText.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/brds/${brdId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "comment",
          text: bodyText.trim(),
          quote: q || null,
          parentId,
          page: !parentId && isPdf && Number(page) > 0 ? Math.floor(Number(page)) : null,
        }),
      })
      if (res.ok) {
        toast.success(parentId ? "Reply added" : "Comment added")
        setComposerOpen(false); setText(""); setQuote(""); setReplyTo(null); setReplyText("")
        load()
      } else toast.error((await res.json()).error || "Failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleResolve(c: Comment) {
    const res = await fetch(`/api/brds/${brdId}/annotations/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !c.resolved }),
    })
    if (res.ok) load()
    else toast.error("Failed")
  }

  async function remove(c: Comment) {
    const res = await fetch(`/api/brds/${brdId}/annotations/${c.id}`, { method: "DELETE" })
    if (res.ok) load()
    else toast.error("Failed")
  }

  const roots = comments.filter((c) => !c.parentId && (showResolved || !c.resolved))
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id)
  const openCount = comments.filter((c) => !c.parentId && !c.resolved).length

  const MentionMenu = ({ target }: { target: "new" | "reply" }) => (
    <div className="relative inline-block">
      <button type="button" onClick={() => setMentionFor(mentionFor === target ? null : target)} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
        <AtSign className="h-3 w-3" /> Mention
      </button>
      {mentionFor === target && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMentionFor(null)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-52 overflow-y-auto rounded-lg border bg-card p-1 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
            {members.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">No members</p>
            ) : members.map((m) => (
              <button key={m.id} type="button" onClick={() => insertMention(target, m)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted/50">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">{(m.name || m.email)[0]}</span>
                <span className="truncate">{m.name || m.email}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Comments
          {openCount > 0 && <span className="rounded-full bg-primary/15 px-2 text-xs font-semibold text-primary">{openCount}</span>}
        </h3>
        <button onClick={startComment} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primary/90">
          <MessageSquarePlus className="h-3.5 w-3.5" /> New
        </button>
      </div>

      {composerOpen && (
        <div className="border-b bg-muted/60 p-3">
          {isPdf && (
            <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" /> Page
              <input
                type="number"
                min={1}
                value={page}
                onChange={(e) => setPage(e.target.value)}
                placeholder="e.g. 4"
                className="h-6 w-20 rounded border bg-card px-2 text-xs"
              />
              <span>(optional — links the comment to a page)</span>
            </label>
          )}
          {getSelectedText && !isPdf && (
            <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-primary/25 bg-card px-2 py-2 text-xs text-muted-foreground">
              <Quote className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
              {quote ? <span className="line-clamp-2 ">{quote}</span> : <span className=" text-muted-foreground">Select text in the document to quote a section (optional).</span>}
              {quote && <button onClick={() => setQuote("")} className="ml-auto text-muted-foreground hover:text-muted-foreground"><X className="h-3 w-3" /></button>}
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Write a comment… use @ to mention a teammate"
            className="w-full rounded-lg border bg-card p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-2 flex items-center gap-2">
            <MentionMenu target="new" />
            <div className="ml-auto flex gap-2">
              <button onClick={() => { setComposerOpen(false); setText(""); setQuote("") }} className="rounded-md border px-3 py-1 text-xs font-semibold">Cancel</button>
              <button onClick={() => submit(null, text, quote)} disabled={submitting || !text.trim()} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
                {submitting && <BusyDot />} Comment
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex justify-center py-8"><BusyDot /></div>
        ) : roots.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No comments yet.<br />Select any section and add one.
          </div>
        ) : (
          <div className="space-y-3">
            {roots.map((c) => (
              <div key={c.id} className={`rounded-lg border p-3 ${c.resolved ? "opacity-60" : ""}`}>
                {c.quote && (
                  <button
                    type="button"
                    onClick={() => !isOutdated(c) && onJumpToQuote?.(c.quote!)}
                    title={isOutdated(c) ? "This text is no longer in the current version" : "Show in document"}
                    className="mb-2 block w-full border-l-2 border-primary/25 pl-2 text-left text-xs text-muted-foreground line-clamp-2 hover:text-foreground"
                  >
                    “{c.quote}”
                  </button>
                )}
                {(isOutdated(c) || c.page) && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {isOutdated(c) && (
                      <span
                        className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                        title="The quoted text was changed or removed in a later version"
                      >
                        Outdated{c.versionNumber ? ` · from v${c.versionNumber}` : ""}
                      </span>
                    )}
                    {c.page && (
                      <button
                        type="button"
                        onClick={() => onJumpToPage?.(c.page!)}
                        className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Page {c.page}
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">{(c.authorName || "?")[0]}</span>
                  <span className="text-xs font-semibold">{c.authorName}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                  {c.resolved && <span className="ml-1 rounded-full bg-emerald-50 px-2 text-xs font-semibold text-emerald-600">Resolved</span>}
                  <div className="ml-auto flex items-center gap-0.5">
                    <button onClick={() => toggleResolve(c)} title={c.resolved ? "Reopen" : "Resolve"} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-emerald-600">
                      {c.resolved ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    {(c.authorId === currentUserId) && (
                      <button onClick={() => setPendingDelete(c)} title="Delete" className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{renderBody(c.text || "")}</p>

                {/* Replies */}
                {repliesOf(c.id).map((r) => (
                  <div key={r.id} className="mt-2 flex gap-2 border-l-2 pl-2">
                    <CornerDownRight className="mt-1 h-3 w-3 shrink-0 text-slate-300" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{r.authorName}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                        {r.authorId === currentUserId && (
                          <button onClick={() => setPendingDelete(r)} className="ml-auto rounded p-0.5 text-muted-foreground hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-foreground">{renderBody(r.text || "")}</p>
                    </div>
                  </div>
                ))}

                {/* Reply box */}
                {replyTo === c.id ? (
                  <div className="mt-2">
                    <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2} autoFocus placeholder="Reply… use @ to mention" className="w-full rounded-lg border bg-card p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                    <div className="mt-1 flex items-center gap-2">
                      <MentionMenu target="reply" />
                      <div className="ml-auto flex gap-2">
                        <button onClick={() => { setReplyTo(null); setReplyText("") }} className="rounded-md border px-2 py-0.5 text-xs font-semibold">Cancel</button>
                        <button onClick={() => submit(c.id, replyText, "")} disabled={submitting || !replyText.trim()} className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-60">Reply</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setReplyTo(c.id); setReplyText("") }} className="mt-2 text-xs font-semibold text-primary hover:underline">Reply</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="danger"
        title="Delete this comment?"
        description="The comment and its text are removed for everyone."
        confirmLabel="Delete comment"
        onConfirm={async () => {
          if (pendingDelete) await remove(pendingDelete)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
