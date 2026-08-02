"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { MoreHorizontal, GripVertical } from "lucide-react"

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
      "rounded-lg border border-slate-200 bg-white shadow-sm",
      fullWidth && "col-span-full",
      className
    )}>
      {/* Jira-style gadget header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-slate-300 cursor-grab" />
          {icon && <span className="text-slate-500">{icon}</span>}
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-2 top-8 z-10 w-32 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              <button className="block w-full px-3 py-1 text-left text-[10px] text-slate-600 hover:bg-slate-50">Refresh</button>
              <button className="block w-full px-3 py-1 text-left text-[10px] text-slate-600 hover:bg-slate-50">Configure</button>
              <button className="block w-full px-3 py-1 text-left text-[10px] text-red-600 hover:bg-slate-50">Remove</button>
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
