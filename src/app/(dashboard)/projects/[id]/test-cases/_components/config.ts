import {
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  MinusCircle,
  XCircle,
  AlertTriangle,
  type LucideIcon,
} from "@/components/ui/icons"
import type { CaseStatus, CasePriority, ReviewState } from "../_hooks/use-test-library"

/**
 * Single source of truth for how a status or priority reads in the test
 * library. The old page repeated these ternaries inline in five places, which
 * is how the tree and the cards drifted to different colours for "To Do".
 */

export const STATUS_META: Record<
  CaseStatus,
  { label: string; icon: LucideIcon; dot: string; chip: string }
> = {
  Passed: {
    label: "Passed",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  Failed: {
    label: "Failed",
    icon: XCircle,
    dot: "bg-red-500",
    chip: "bg-red-500/10 text-red-700 dark:text-red-400",
  },
  Blocked: {
    label: "Blocked",
    icon: CircleSlash,
    dot: "bg-orange-500",
    chip: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  },
  Warning: {
    label: "Warning",
    icon: AlertTriangle,
    dot: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  Skipped: {
    label: "Skipped",
    icon: MinusCircle,
    dot: "bg-slate-400",
    chip: "bg-muted text-muted-foreground",
  },
  NotExecuted: {
    label: "Not run",
    icon: CircleDashed,
    dot: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground",
  },
}

export const STATUS_ORDER: CaseStatus[] = [
  "Passed",
  "Failed",
  "Blocked",
  "Warning",
  "Skipped",
  "NotExecuted",
]

export const PRIORITY_META: Record<CasePriority, { label: string; chip: string }> = {
  Critical: { label: "Critical", chip: "bg-red-500/10 text-red-700 dark:text-red-400" },
  High: { label: "High", chip: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  Medium: { label: "Medium", chip: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  Low: { label: "Low", chip: "bg-muted text-muted-foreground" },
}

export const PRIORITY_ORDER: CasePriority[] = ["Critical", "High", "Medium", "Low"]

/** "3 days ago" without pulling a formatting library into every row. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/** Authoring lifecycle. Ready is the quiet default, so it gets no badge in rows. */
export const REVIEW_META: Record<ReviewState, { label: string; chip: string; hint: string }> = {
  Draft: {
    label: "Draft",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    hint: "Still being written",
  },
  Ready: {
    label: "Ready",
    chip: "bg-muted text-muted-foreground",
    hint: "Written and runnable",
  },
  Approved: {
    label: "Approved",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    hint: "Reviewed and approved",
  },
  Deprecated: {
    label: "Deprecated",
    chip: "bg-muted text-muted-foreground line-through",
    hint: "Retired — skipped when a plan runs",
  },
}

export const REVIEW_ORDER: ReviewState[] = ["Draft", "Ready", "Approved", "Deprecated"]

/** 95 → "1h 35m", 20 → "20m". */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return "—"
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Two-letter initials for an assignee avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}
