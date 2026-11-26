import type { TaskPriority, TaskStatus, TaskType, ScrumMember } from "@/types/scrum"
import { ArrowUp, ArrowDown } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; className: string; dir: "up" | "down" }
> = {
  HIGHEST: { label: "Highest", className: "bg-red-100 text-red-700 border-red-200", dir: "up" },
  HIGH: { label: "High", className: "bg-blue-100 text-blue-700 border-blue-200", dir: "up" },
  MEDIUM: { label: "Medium", className: "bg-slate-100 text-slate-600 border-slate-200", dir: "up" },
  LOW: { label: "Low", className: "bg-emerald-100 text-emerald-700 border-emerald-200", dir: "down" },
  LOWEST: { label: "Lowest", className: "bg-teal-50 text-teal-600 border-teal-200", dir: "down" },
}

export const STATUS_META: Record<TaskStatus, { label: string; dot: string }> = {
  TODO: { label: "To Do", dot: "bg-slate-400" },
  IN_PROGRESS: { label: "In Progress", dot: "bg-blue-500" },
  REVIEW: { label: "In Review", dot: "bg-violet-500" },
  TESTING: { label: "Testing", dot: "bg-amber-500" },
  DEPLOYED: { label: "Deployed", dot: "bg-cyan-500" },
  DONE: { label: "Done", dot: "bg-emerald-500" },
}

/** Workflow order, used to place a status that has no saved column. */
export const STATUS_ORDER: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "TESTING", "DONE", "DEPLOYED"]

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  const meta = PRIORITY_META[priority]
  const Icon = meta.dir === "up" ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-semibold",
        meta.className,
        className
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  )
}

export function initials(name: string | null | undefined, email?: string) {
  const base = name?.trim() || email?.split("@")[0] || "?"
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

/** Overlapping avatar stack, showing up to `max` then a +N chip. */
export function AvatarStack({ members, max = 2, size = "md" }: { members: ScrumMember[]; max?: number; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-5 w-5 text-xs border" : "h-6 w-6 text-xs border-2"
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <div className={cn("flex", size === "sm" ? "-space-x-1" : "-space-x-2")}>
      {shown.map((m) => (
        <span
          key={m.id}
          title={m.name || m.email}
          className={cn("inline-flex items-center justify-center overflow-hidden rounded-full border-background bg-primary/10 font-semibold text-primary", dim)}
        >
          {m.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatarUrl} alt={m.name || m.email} className="h-full w-full object-cover" />
          ) : (
            initials(m.name, m.email)
          )}
        </span>
      ))}
      {extra > 0 && (
        <span className={cn("inline-flex items-center justify-center rounded-full border-background bg-muted font-semibold text-muted-foreground", dim)}>
          +{extra}
        </span>
      )}
    </div>
  )
}

/** Whole-day overdue count, or null when not overdue / no due date. */
export function overdueDays(dueDate: string | null, status: TaskStatus): number | null {
  if (!dueDate || status === "DONE" || status === "DEPLOYED") return null
  const due = new Date(dueDate)
  const now = new Date()
  const diff = Math.floor((now.getTime() - due.getTime()) / 86_400_000)
  return diff > 0 ? diff : null
}

/* ── Linear-style primitives ─────────────────────────────────────────────── */

const STATUS_ICON: Record<TaskStatus, { color: string; fill: number }> = {
  TODO: { color: "text-slate-400", fill: 0 },
  IN_PROGRESS: { color: "text-amber-500", fill: 0.5 },
  REVIEW: { color: "text-violet-500", fill: 0.75 },
  TESTING: { color: "text-indigo-500", fill: 0.75 },
  DONE: { color: "text-emerald-500", fill: 1 },
  DEPLOYED: { color: "text-cyan-500", fill: 1 },
}

/** 14px status ring: empty, part-filled pie, or a filled check. */
export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const meta = STATUS_ICON[status] ?? STATUS_ICON.TODO
  const label = STATUS_META[status]?.label ?? status
  if (meta.fill >= 1) {
    return (
      <svg viewBox="0 0 14 14" className={cn("h-3.5 w-3.5 shrink-0", meta.color, className)} role="img" aria-label={label}>
        <circle cx="7" cy="7" r="6" fill="currentColor" />
        <path d="M4.3 7.2 6.2 9l3.5-3.8" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  // Pie slice from 12 o'clock, clockwise, radius 3.5 inside a 5.5 ring.
  const a = meta.fill * 2 * Math.PI
  const x = 7 + 3.5 * Math.sin(a)
  const y = 7 - 3.5 * Math.cos(a)
  const large = meta.fill > 0.5 ? 1 : 0
  return (
    <svg viewBox="0 0 14 14" className={cn("h-3.5 w-3.5 shrink-0", meta.color, className)} role="img" aria-label={label}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {meta.fill > 0 && <path d={`M7 7V3.5A3.5 3.5 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`} fill="currentColor" />}
    </svg>
  )
}

const PRIORITY_BARS: Record<TaskPriority, number> = { HIGHEST: 4, HIGH: 3, MEDIUM: 2, LOW: 1, LOWEST: 0 }

/** Linear-style priority: 1–3 signal bars, or a red "!" square for Highest. */
export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  const label = PRIORITY_META[priority]?.label ?? priority
  const bars = PRIORITY_BARS[priority] ?? 2
  if (bars === 4) {
    return (
      <svg viewBox="0 0 16 16" className={cn("h-3 w-3 shrink-0 text-red-500", className)} role="img" aria-label={label}>
        <title>{label}</title>
        <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
        <path d="M8 4v5M8 11.6v.2" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3 w-3 shrink-0 text-muted-foreground", className)} role="img" aria-label={label}>
      <title>{label}</title>
      <rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" opacity={bars >= 1 ? 1 : 0.3} />
      <rect x="6.5" y="5.5" width="3" height="8.5" rx="1" fill="currentColor" opacity={bars >= 2 ? 1 : 0.3} />
      <rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor" opacity={bars >= 3 ? 1 : 0.3} />
    </svg>
  )
}

export const TYPE_DOT: Record<TaskType, string> = {
  STORY: "bg-emerald-500",
  BUG: "bg-red-500",
  TASK: "bg-indigo-500",
  TEST_CASE: "bg-teal-500",
  SUBTASK: "bg-sky-500",
  EPIC: "bg-violet-500",
}

/** Small bordered pill with a coloured dot: issue type, epic, label. */
export function DotLabel({
  dotClass,
  dotColor,
  children,
  className,
}: {
  dotClass?: string
  dotColor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-[11rem] items-center gap-2 rounded-full border border-border px-2 text-xs text-muted-foreground",
        className
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} style={dotColor ? { backgroundColor: dotColor } : undefined} />
      <span className="truncate">{children}</span>
    </span>
  )
}

/** Inline error for a Scrum view whose data failed to load (SKILL.md B9: specific, with a next step). */
export function ViewError({ what = "issues", error, onRetry }: { what?: string; error?: unknown; onRetry: () => void }) {
  const detail = error instanceof Error && error.message ? ` ${error.message}.` : ""
  return (
    <div role="alert" className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
      <p className="title-3 text-foreground">The {what} could not be loaded</p>
      <p className="body-6 text-muted-foreground">Check your connection and try again.{detail}</p>
      <button
        type="button"
        onClick={onRetry}
        className="button-sm rounded-lg bg-primary px-3 py-2 text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
      >
        Try again
      </button>
    </div>
  )
}
