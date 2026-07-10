import type { TaskPriority, TaskStatus, ScrumMember } from "@/types/scrum"
import { ArrowUp, ArrowDown } from "lucide-react"
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

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  const meta = PRIORITY_META[priority]
  const Icon = meta.dir === "up" ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
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
export function AvatarStack({ members, max = 2 }: { members: ScrumMember[]; max?: number }) {
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <div className="flex -space-x-1.5">
      {shown.map((m) => (
        <span
          key={m.id}
          title={m.name || m.email}
          className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-primary/10 text-[9px] font-bold text-primary"
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
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-slate-200 text-[9px] font-bold text-slate-600">
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
