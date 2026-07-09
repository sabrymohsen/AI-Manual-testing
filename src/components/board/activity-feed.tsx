"use client"

import { useEffect, useState } from "react"
import { Send, Loader2, MessageSquare } from "lucide-react"

interface Comment {
  id: string
  author: string
  content: string
  createdAt: string
}

interface ActivityFeedProps {
  requirementId: string
  currentUser?: string
}

export default function ActivityFeed({ requirementId, currentUser = "User" }: ActivityFeedProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/requirements/${requirementId}/comments`)
    const data = res.ok ? await res.json() : { comments: [] }
    setComments(data.comments || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [requirementId])

  const submit = async () => {
    if (!newComment.trim() || sending) return
    setSending(true)
    const res = await fetch(`/api/requirements/${requirementId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: currentUser, content: newComment.trim() }),
    })
    setSending(false)
    if (res.ok) {
      setNewComment("")
      load()
    }
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-indigo-500" /></div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {comments.length === 0 && (
            <div className="text-center py-6 border border-dashed border-slate-100 dark:border-slate-850 rounded-2xl bg-slate-50/50 dark:bg-slate-900/10">
              <MessageSquare className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1.5" />
              <p className="text-[11px] text-muted-foreground font-semibold">No discussions logged yet.</p>
            </div>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-3 p-3 rounded-2xl border border-slate-50 dark:border-slate-850 bg-slate-50/20 dark:bg-slate-900/10 hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-all">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[9px] font-black flex items-center justify-center shrink-0 shadow-sm">
                {c.author.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">{c.author}</span>
                  <span className="text-[9px] text-muted-foreground/80 font-bold">
                    {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-xs text-slate-650 dark:text-slate-350 mt-1 leading-relaxed whitespace-pre-wrap">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/40">
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="Reply or leave feedback..."
          className="flex-1 h-9.5 px-3.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
        />
        <button
          onClick={submit}
          disabled={!newComment.trim() || sending}
          className="h-9.5 w-9.5 flex items-center justify-center rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white disabled:opacity-50 transition-all shadow-md shadow-indigo-500/10"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
