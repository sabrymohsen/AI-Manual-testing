"use client"

import type { ScrumActivity } from "@/types/scrum"
import { formatDistanceToNow } from "date-fns"
import { Plus, MoveRight, UserPlus, MessageSquare, Pencil } from "@/components/ui/icons"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  created: Plus,
  moved: MoveRight,
  assigned: UserPlus,
  commented: MessageSquare,
  updated: Pencil,
}

export function ActivityLog({ activities }: { activities: ScrumActivity[] }) {
  return (
    <div className="space-y-3">
      <h4 className="title-4 text-foreground">Activity</h4>
      <ol className="space-y-2 border-l border-border pl-4">
        {activities.map((a) => {
          const Icon = ICONS[a.action] ?? Pencil
          return (
            <li key={a.id} className="relative text-xs">
              <span className="absolute -left-[22px] flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="h-2.5 w-2.5" />
              </span>
              <span className="font-semibold capitalize">{a.action}</span>
              {a.details && <span className="text-muted-foreground"> — {a.details}</span>}
              <span className="ml-1 text-muted-foreground/70">
                · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                {a.user?.name ? ` · ${a.user.name}` : ""}
              </span>
            </li>
          )
        })}
        {activities.length === 0 && <li className="text-xs text-muted-foreground">No activity yet.</li>}
      </ol>
    </div>
  )
}
