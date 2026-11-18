"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Clock, Loader2, MessageSquareWarning, Send, UserCheck } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Review workflow: ask named people to review the current version; each
 * approves or requests changes (with a reason). When everyone approves the
 * current version, the server moves the BRD to Reviewed. A new version
 * supersedes pending reviews of the old one.
 */

interface Review {
  id: string
  versionId: string
  versionNumber: number
  reviewerId: string
  reviewerName: string
  requestedByName: string | null
  decision: "Pending" | "Approved" | "ChangesRequested" | "Superseded"
  comment: string | null
  decidedAt: string | null
  createdAt: string
}

const DECISION: Record<Review["decision"], { label: string; chip: string; icon: typeof Clock }> = {
  Pending: { label: "Waiting", chip: "bg-muted text-muted-foreground", icon: Clock },
  Approved: { label: "Approved", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
  ChangesRequested: { label: "Changes requested", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400", icon: MessageSquareWarning },
  Superseded: { label: "Superseded", chip: "bg-muted text-muted-foreground line-through", icon: Clock },
}

export function BrdReviews({
  brdId,
  currentVersionId,
  currentVersionNumber,
  canRequest,
  onStatusChanged,
}: {
  brdId: string
  currentVersionId: string | null
  currentVersionNumber: number
  canRequest: boolean
  onStatusChanged: () => void
}) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [me, setMe] = useState("")
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/brds/${brdId}/reviews`)
    if (res.ok) {
      const d = await res.json()
      setReviews(d.reviews)
      setMembers(d.members)
      setMe(d.currentUserId)
    }
    setLoading(false)
  }, [brdId])

  useEffect(() => {
    load()
  }, [load])

  async function request() {
    setSending(true)
    try {
      const res = await fetch(`/api/brds/${brdId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerIds: picked, message: message.trim() || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success(d.requested ? `Asked ${d.requested} reviewer${d.requested === 1 ? "" : "s"}` : "They're already reviewing this version")
      setPicked([])
      setMessage("")
      load()
    } catch (e) {
      toast.error((e as Error).message || "Couldn't request a review")
    } finally {
      setSending(false)
    }
  }

  const current = reviews.filter((r) => r.versionId === currentVersionId)
  const older = reviews.filter((r) => r.versionId !== currentVersionId)
  const pendingIds = new Set(current.filter((r) => r.decision === "Pending").map((r) => r.reviewerId))

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Reviews of v{currentVersionNumber} (current)</h3>
          {current.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Nobody has been asked to review this version yet.
            </p>
          ) : (
            <div className="space-y-2">
              {current.map((r) => (
                <ReviewRow key={r.id} r={r} mine={r.reviewerId === me} brdId={brdId} onDone={(statusChanged) => { load(); if (statusChanged) onStatusChanged() }} />
              ))}
            </div>
          )}
        </section>

        {older.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Earlier versions</h3>
            <div className="space-y-2">
              {older.map((r) => (
                <ReviewRow key={r.id} r={r} mine={false} brdId={brdId} onDone={load} />
              ))}
            </div>
          </section>
        )}
      </div>

      {canRequest && (
        <aside className="h-fit space-y-2 rounded-lg border bg-card p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <UserCheck className="h-4 w-4 text-primary" /> Request a review
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Reviewers approve or request changes on v{currentVersionNumber}. When all approve, the BRD becomes Reviewed.
          </p>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {members.map((m) => (
              <label key={m.id} className={cn("flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent", pendingIds.has(m.id) && "opacity-50")}>
                <input
                  type="checkbox"
                  disabled={pendingIds.has(m.id)}
                  checked={picked.includes(m.id)}
                  onChange={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                  className="accent-[hsl(var(--primary))]"
                />
                <span className="truncate">{m.name}</span>
                {pendingIds.has(m.id) && <span className="ml-auto text-[10px] text-muted-foreground">asked</span>}
              </label>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Note for reviewers (optional)"
            className="w-full rounded-md border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={request}
            disabled={!picked.length || sending}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Ask {picked.length || ""} to review
          </button>
        </aside>
      )}
    </div>
  )
}

function ReviewRow({ r, mine, brdId, onDone }: { r: Review; mine: boolean; brdId: string; onDone: (statusChanged: boolean) => void }) {
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  const meta = DECISION[r.decision] ?? DECISION.Pending
  const Icon = meta.icon

  async function decide(decision: "Approved" | "ChangesRequested") {
    if (decision === "ChangesRequested" && !comment.trim()) {
      toast.error("Say what needs to change")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/brds/${brdId}/reviews/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success(d.statusChanged ? "Approved — everyone approved, the BRD is now Reviewed" : decision === "Approved" ? "Approved" : "Changes requested")
      onDone(!!d.statusChanged)
    } catch (e) {
      toast.error((e as Error).message || "Couldn't save your review")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn("rounded-lg border p-3 text-xs", mine && r.decision === "Pending" && "border-primary/40 bg-primary/[0.03]")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{r.reviewerName}</span>
        <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium", meta.chip)}>
          <Icon className="h-3 w-3" /> {meta.label}
        </span>
        <span className="text-muted-foreground">v{r.versionNumber}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {r.requestedByName ? `asked by ${r.requestedByName} · ` : ""}
          {new Date(r.decidedAt ?? r.createdAt).toLocaleDateString()}
        </span>
      </div>
      {r.comment && <p className="mt-1.5 whitespace-pre-wrap text-foreground">{r.comment}</p>}

      {mine && r.decision === "Pending" && (
        <div className="mt-2 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Comment — required when requesting changes"
            className="w-full rounded-md border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2">
            <button
              onClick={() => decide("Approved")}
              disabled={busy}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-3 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </button>
            <button
              onClick={() => decide("ChangesRequested")}
              disabled={busy}
              className="inline-flex h-7 items-center gap-1 rounded-md border px-3 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
            >
              <MessageSquareWarning className="h-3.5 w-3.5" /> Request changes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
