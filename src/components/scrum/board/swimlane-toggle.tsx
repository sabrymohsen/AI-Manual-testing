"use client"

import { cn } from "@/lib/utils"
import { Rows3, User, Layers, X } from "@/components/ui/icons"

export type SwimlaneMode = "none" | "assignee" | "epic"

interface SwimlaneToggleProps {
  value: SwimlaneMode
  onChange: (mode: SwimlaneMode) => void
}

const OPTIONS: { key: SwimlaneMode; label: string; icon: React.ReactNode }[] = [
  { key: "none", label: "No swimlanes", icon: <Rows3 className="h-3.5 w-3.5" /> },
  { key: "assignee", label: "Assignee", icon: <User className="h-3.5 w-3.5" /> },
  { key: "epic", label: "Epic", icon: <Layers className="h-3.5 w-3.5" /> },
]

export function SwimlaneToggle({ value, onChange }: SwimlaneToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground/60">Swimlane</span>
      <div className="flex gap-1 rounded-lg border border-border p-0.5 bg-white">
        {OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
              value === opt.key
                ? "bg-primary text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            title={opt.label}
          >
            {opt.icon}
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
