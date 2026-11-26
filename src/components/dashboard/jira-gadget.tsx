"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { MoreHorizontal, GripVertical } from "@/components/ui/icons"

interface GadgetProps {
  title: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  fullWidth?: boolean
}

export function Gadget({ title, icon, actions, children, className, fullWidth }: GadgetProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className={cn(
      "rounded-lg border border-border bg-card shadow-sm",
      fullWidth && "col-span-full",
      className
    )}>
      {/* Jira-style gadget header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/50">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-slate-300 cursor-grab" />
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h3 className="text-xs font-medium text-foreground">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-2 top-8 z-10 w-32 rounded-md border border-border bg-card py-1 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
              <button className="block w-full px-3 py-1 text-left text-xs text-muted-foreground hover:bg-muted/50">Refresh</button>
              <button className="block w-full px-3 py-1 text-left text-xs text-muted-foreground hover:bg-muted/50">Configure</button>
              <button className="block w-full px-3 py-1 text-left text-xs text-red-600 hover:bg-muted/50">Remove</button>
            </div>
          )}
        </div>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

export function GadgetGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4", className)}>
      {children}
    </div>
  )
}
