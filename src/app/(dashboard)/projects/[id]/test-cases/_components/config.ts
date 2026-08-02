import {
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  MinusCircle,
  XCircle,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react"
import type { CaseStatus, CasePriority } from "../_hooks/use-test-library"

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
