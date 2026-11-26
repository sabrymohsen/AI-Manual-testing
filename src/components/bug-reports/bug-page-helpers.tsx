"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Bookmark, Keyboard, Trash2, Undo2, X } from "@/components/ui/icons"

/* ─── Keyboard shortcuts ──────────────────────────────────────────────────── */

export const SHORTCUTS: [string, string][] = [
  ["J / K", "Next / previous bug"],
  ["E", "Edit title"],
  ["D", "Delete bug"],
  ["C", "Copy link"],
  ["T", "AI triage"],
  ["/", "Search"],
  ["Esc", "Close"],
  ["?", "Show shortcuts"],
]

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
}

/**
 * Shortcuts for the Bug Reports page. Ignored while typing in a field and while
 * a modifier key is held, so browser shortcuts keep working.
 */
export function useBugShortcuts(handlers: {
  open: boolean
  next: () => void
  prev: () => void
  edit: () => void
  remove: () => void
  copyLink: () => void
  triage: () => void
  search: () => void
  close: () => void
  help: () => void
}) {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const h = ref.current
      if (e.key === "Escape" && h.open && !typing(e)) return h.close()
      if (typing(e)) return
      const k = e.key.toLowerCase()
      if (k === "/") {
        e.preventDefault()
        return h.search()
      }
      if (e.key === "?") return h.help()
      if (!h.open) return
      const map: Record<string, () => void> = { j: h.next, k: h.prev, e: h.edit, d: h.remove, c: h.copyLink, t: h.triage }
      if (map[k]) {
        e.preventDefault()
        map[k]()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[340px] rounded-xl border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Keyboard className="h-4 w-4" /> Keyboard shortcuts
          </h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2 text-xs">
          {SHORTCUTS.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between">
              <span className="text-muted-foreground">{label}</span>
              <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">{k}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ─── Delete with Undo ────────────────────────────────────────────────────── */

const UNDO_MS = 10_000

/**
 * Deletes wait 10 seconds before they reach the server, so Undo is a real undo
 * (nothing was removed yet). If the page is closed meanwhile, the pending
 * deletes are sent with keepalive so they still happen.
 */
export function useUndoableDelete(opts: {
  /** Hide these bugs right away. */
  hide: (ids: string[]) => void
  /** Bring them back (reload the list). */
  restore: () => void
  /** After the server deleted them. */
  done: (deleted: number, failed: { id: string; error: string }[]) => void
}) {
  const [pending, setPending] = useState<{ ids: string[]; deleteRemote: boolean; label: string; until: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const optsRef = useRef(opts)
  optsRef.current = opts

  const commit = useCallback(async (p = pendingRef.current) => {
    if (!p) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPending(null)
    const results = await Promise.all(
      p.ids.map(async (id) => {
        try {
          const res = await fetch(`/api/bug-reports/${id}?deleteRemote=${p.deleteRemote}`, { method: "DELETE" })
          if (res.ok) return null
          const data = await res.json().catch(() => ({}))
          return { id, error: data.error || `error ${res.status}` }
        } catch {
          return { id, error: "network error" }
        }
      })
    )
    const failed = results.filter(Boolean) as { id: string; error: string }[]
    optsRef.current.done(p.ids.length - failed.length, failed)
  }, [])

  const schedule = useCallback(
    (ids: string[], deleteRemote: boolean, label: string) => {
      if (!ids.length) return
      // A second delete while one waits: send the first now.
      if (pendingRef.current) void commit(pendingRef.current)
      optsRef.current.hide(ids)
      const p = { ids, deleteRemote, label, until: Date.now() + UNDO_MS }
      setPending(p)
      timer.current = setTimeout(() => void commit(p), UNDO_MS)
    },
    [commit]
  )

  const undo = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPending(null)
    optsRef.current.restore()
  }, [])

  useEffect(() => {
    const flush = () => {
      const p = pendingRef.current
      if (!p) return
      for (const id of p.ids) {
        fetch(`/api/bug-reports/${id}?deleteRemote=${p.deleteRemote}`, { method: "DELETE", keepalive: true }).catch(() => {})
      }
    }
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      // Leaving the page inside the app: carry out what the user asked for.
      flush()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return { pending, schedule, undo, commitNow: () => commit() }
}

export function UndoBar({ pending, onUndo, onCommit }: { pending: { label: string; until: number } | null; onUndo: () => void; onCommit: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [pending])
  if (!pending) return null
  const left = Math.max(0, Math.ceil((pending.until - now) / 1000))
  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-[65] flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-foreground px-4 py-3 text-xs font-semibold text-background shadow-2xl">
      <Trash2 className="h-4 w-4" />
      <span>
        {pending.label} <span className="opacity-60">· {left}s</span>
      </span>
      <button onClick={onUndo} className="inline-flex items-center gap-1 rounded-md bg-background/15 px-3 py-1 hover:bg-background/25">
        <Undo2 className="h-3.5 w-3.5" /> Undo
      </button>
      <button onClick={onCommit} className="rounded p-1 opacity-60 hover:opacity-100" aria-label="Delete now" title="Delete now">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/* ─── Saved filter views ──────────────────────────────────────────────────── */

export interface BugFilters {
  search: string
  severity: string
  priority: string
  status: string
  source: string
  module: string
  unassigned: boolean
  reopened: boolean
}

interface SavedView {
  name: string
  filters: BugFilters
}

const viewsKey = (projectId: string) => `qa-bug-views:${projectId}`

function readViews(projectId: string): SavedView[] {
  try {
    const raw = localStorage.getItem(viewsKey(projectId))
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function writeViews(projectId: string, views: SavedView[]) {
  try {
    localStorage.setItem(viewsKey(projectId), JSON.stringify(views))
  } catch {
    /* private mode: views just aren't kept */
  }
}

/** Named filter combinations, kept in this browser per project. */
export function SavedViews({ projectId, current, apply }: { projectId: string; current: BugFilters; apply: (f: BugFilters) => void }) {
  const [views, setViews] = useState<SavedView[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState("")
  useEffect(() => setViews(readViews(projectId)), [projectId])

  const save = () => {
    const n = name.trim()
    if (!n) return
    const next = [...views.filter((v) => v.name !== n), { name: n, filters: current }]
    setViews(next)
    writeViews(projectId, next)
    setNaming(false)
    setName("")
  }
  const remove = (n: string) => {
    const next = views.filter((v) => v.name !== n)
    setViews(next)
    writeViews(projectId, next)
  }
  const same = (a: BugFilters, b: BugFilters) => JSON.stringify(a) === JSON.stringify(b)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
      {views.map((v) => (
        <span
          key={v.name}
          className={`inline-flex h-7 items-center overflow-hidden rounded-full border text-xs ${same(v.filters, current) ? "border-primary bg-primary/10 text-primary" : ""}`}
        >
          <button onClick={() => apply(v.filters)} className="h-full px-3 font-semibold hover:bg-muted">
            {v.name}
          </button>
          <button onClick={() => remove(v.name)} className="h-full px-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove view ${v.name}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {naming ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save()
              if (e.key === "Escape") setNaming(false)
            }}
            placeholder="View name, e.g. My critical"
            className="h-7 w-44 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button onClick={save} disabled={!name.trim()} className="h-7 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            Save
          </button>
        </span>
      ) : (
        <button onClick={() => setNaming(true)} className="h-7 rounded-full border border-dashed px-3 text-xs font-semibold text-muted-foreground hover:bg-muted">
          + Save current filters
        </button>
      )}
    </div>
  )
}
