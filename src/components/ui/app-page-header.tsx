import React from "react"
import { Button } from "@/components/ui/button"

interface Action {
  label: string
  onClick: () => void
  icon?: React.ComponentType<{ className?: string }>
  variant?: "default" | "outline" | "ghost" | "secondary"
}

interface Badge {
  label: string
  variant?: "default" | "success" | "warning" | "danger"
}

interface AppPageHeaderProps {
  title: string
  subtitle?: string
  breadcrumb?: string
  primaryAction?: Action
  secondaryActions?: Action[]
  statusBadges?: Badge[]
}

export function AppPageHeader({
  title,
  subtitle,
  breadcrumb,
  primaryAction,
  secondaryActions = [],
  statusBadges = []
}: AppPageHeaderProps) {
  return (
    <div className="border-b pb-4 mb-6 space-y-2 select-none text-xs font-semibold">
      {/* Breadcrumb path */}
      {breadcrumb && (
        <div className="text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground/60">
          {breadcrumb}
        </div>
      )}

      {/* Main Title & Action Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 flex items-center gap-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>

        {/* Badges and Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Badges */}
          {statusBadges.map((badge, idx) => (
            <span 
              key={idx}
              className={`px-2 py-0.5 rounded font-extrabold uppercase tracking-wide text-[9px] ${
                badge.variant === "success" ? "bg-emerald-100 text-emerald-700" :
                badge.variant === "warning" ? "bg-amber-100 text-amber-700" :
                badge.variant === "danger" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {badge.label}
            </span>
          ))}

          {/* Secondary Actions */}
          {secondaryActions.map((action, idx) => (
            <Button
              key={idx}
              size="sm"
              variant={action.variant || "outline"}
              onClick={action.onClick}
              className="h-8 font-semibold text-[11px]"
            >
              {action.icon && React.createElement(action.icon, { className: "mr-1.5 h-3.5 w-3.5" })}
              {action.label}
            </Button>
          ))}

          {/* Primary Action */}
          {primaryAction && (
            <Button
              size="sm"
              variant={primaryAction.variant || "default"}
              onClick={primaryAction.onClick}
              className="h-8 font-semibold text-[11px] shadow-sm"
            >
              {primaryAction.icon && React.createElement(primaryAction.icon, { className: "mr-1.5 h-3.5 w-3.5" })}
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
