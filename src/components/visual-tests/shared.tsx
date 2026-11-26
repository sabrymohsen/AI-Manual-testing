"use client"

import { CheckCircle2, CircleDashed, AlertTriangle, XCircle, Clock, Loader2, MinusCircle, Sparkles, Ban } from "@/components/ui/icons"
import type { VisualEnvironment } from "@/lib/visual-tests/environments"

export type ScreenStatus = "New" | "Passed" | "Unresolved" | "Accepted" | "Rejected" | "Error" | "Removed"
export type RunStatus = "Queued" | "Running" | "Completed" | "Failed" | "Cancelled"
export type RunOutcome = "Passed" | "Unresolved" | "Failed" | null

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {}
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status, data })
  return data as T
}

export const SCREEN_STATUS_META: Record<ScreenStatus, { label: string; className: string; icon: any; hint: string }> = {
  New: { label: "New", className: "bg-sky-50 text-sky-700 border-sky-200", icon: Sparkles, hint: "First time this page was captured here. Its image is now the approved one." },
  Passed: { label: "Passed", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, hint: "Matches the approved image." },
  Unresolved: { label: "Needs review", className: "bg-amber-50 text-amber-800 border-amber-200", icon: CircleDashed, hint: "Looks different from the approved image. Accept it or reject it." },
  Accepted: { label: "Accepted", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, hint: "Someone approved this change. It is the new approved image." },
  Rejected: { label: "Rejected", className: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle, hint: "Someone marked this change as a defect." },
  Error: { label: "Error", className: "bg-rose-50 text-rose-700 border-rose-200", icon: AlertTriangle, hint: "The page could not be captured." },
  Removed: { label: "Removed", className: "bg-muted text-foreground border-border", icon: MinusCircle, hint: "The page is no longer in the sitemap." },
}

export function ScreenStatusBadge({ status, auto }: { status: ScreenStatus; auto?: boolean }) {
  const meta = SCREEN_STATUS_META[status] ?? SCREEN_STATUS_META.Unresolved
  const Icon = meta.icon
  return (
    <span title={meta.hint} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
      {auto && <span className="font-normal opacity-80">· auto</span>}
    </span>
  )
}

export function RunStatusBadge({
  status,
  outcome,
  newCount,
  passedCount,
}: {
  status: RunStatus
  outcome: RunOutcome
  // When every passed screen was new, the run only recorded baselines — nothing
  // was compared yet, so "Passed" would claim a check that never happened.
  newCount?: number
  passedCount?: number
}) {
  if (status === "Queued")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
        <Clock className="h-3 w-3" /> Waiting to start
      </span>
    )
  if (status === "Running")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
        <Loader2 className="h-3 w-3 animate-spin" /> Capturing
      </span>
    )
  if (status === "Cancelled")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
        <Ban className="h-3 w-3" /> Stopped
      </span>
    )
  if (status === "Failed" && !outcome)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
        <AlertTriangle className="h-3 w-3" /> Could not run
      </span>
    )
  if (outcome === "Passed" && newCount && newCount === passedCount)
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700"
        title="First screenshots of these pages were saved as the approved images. The next run compares against them."
      >
        <CheckCircle2 className="h-3 w-3" /> Baseline saved
      </span>
    )
  if (outcome === "Passed") return <ScreenStatusBadge status="Passed" />
  if (outcome === "Failed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
        <XCircle className="h-3 w-3" /> Failed
      </span>
    )
  return <ScreenStatusBadge status="Unresolved" />
}

export function pathOf(url: string | null | undefined): string {
  if (!url) return ""
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}` || "/"
  } catch {
    return url
  }
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—"
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function formatDuration(start?: string | null, end?: string | null): string {
  if (!start) return "—"
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} s`
  const m = Math.floor(ms / 60_000)
  return m < 60 ? `${m} min ${Math.round((ms % 60_000) / 1000)} s` : `${Math.floor(m / 60)} h ${m % 60} min`
}

export function EnvChips({ environments, max = 3 }: { environments: VisualEnvironment[]; max?: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {environments.slice(0, max).map(e => (
        <span key={e.key} className="rounded border bg-card px-2 py-0.5 text-xs text-muted-foreground">
          {e.name} <span className="text-muted-foreground">{e.width}×{e.height}</span>
        </span>
      ))}
      {environments.length > max && <span className="text-xs text-muted-foreground">+{environments.length - max}</span>}
    </span>
  )
}

export const TEST_TYPE_LABEL: Record<string, string> = {
  FullWebsite: "Whole website",
  UrlList: "URL list",
  Flow: "Test case checkpoints",
}

export const MATCH_LEVEL_META = {
  Strict: { label: "Exact", hint: "Flags any difference a person would notice." },
  Dynamic: { label: "Ignore changing text", hint: "Like Exact, but dates, times, numbers, prices, emails and form values may change." },
  IgnoreColors: { label: "Ignore colours", hint: "Compares shapes and lightness only, so a colour or theme change is not flagged." },
} as const
