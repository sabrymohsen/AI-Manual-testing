"use client"

import { useMemo, useState } from "react"
import type { ScrumActivity } from "@/types/scrum"
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns"
import {
  Plus,
  MoveRight,
  UserPlus,
  MessageSquare,
  Pencil,
  Paperclip,
  Clock,
  Link2,
  CheckCircle2,
  ChevronDown,
  History,
} from "@/components/ui/icons"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  created: Plus,
  moved: MoveRight,
  status_changed: MoveRight,
  assigned: UserPlus,
  unassigned: UserPlus,
  commented: MessageSquare,
  updated: Pencil,
  description_edited: Pencil,
  attachment_added: Paperclip,
  attachment_removed: Paperclip,
  work_logged: Clock,
  linked: Link2,
  unlinked: Link2,
  subtask_completed: CheckCircle2,
}

/** Human label for the day bucket (Today / Yesterday / Mon d, yyyy). */
function dayLabel(d: Date): string {
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "MMM d, yyyy")
}

export function TaskActivity({ activities }: { activities: ScrumActivity[] }) {
  const [open, setOpen] = useState(true)

  // Newest-first, bucketed by calendar day.
  const groups = useMemo(() => {
    const sorted = [...activities].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    const map = new Map<string, ScrumActivity[]>()
    for (const a of sorted) {
      const label = dayLabel(new Date(a.createdAt))
      if (!map.has(label)) map.set(label, [])
      map.get(label)!.push(a)
    }
    return [...map.entries()]
  }, [activities])

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <History className="h-3.5 w-3.5" /> Activity
        {activities.length > 0 && <span className="text-foreground">({activities.length})</span>}
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      {open &&
        (activities.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="space-y-4">
            {groups.map(([label, items]) => (
              <div key={label} className="space-y-2">
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <ol className="space-y-2 border-l border-border pl-4">
                  {items.map((a) => {
                    const Icon = ICONS[a.action] ?? Pencil
                    const when = new Date(a.createdAt)
                    return (
                      <li key={a.id} className="relative text-xs">
                        <span className="absolute -left-[22px] flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Icon className="h-2.5 w-2.5" />
                        </span>
                        <div>
                          <span className="font-semibold text-foreground">{a.user?.name || "System"}</span>{" "}
                          <span className="capitalize text-muted-foreground">{a.action.replace(/_/g, " ")}</span>
                          {a.details && <span className="text-muted-foreground"> — {a.details}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground/70" title={format(when, "PPpp")}>
                          {format(when, "MMM d, yyyy · h:mm a")} · {formatDistanceToNow(when, { addSuffix: true })}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}
