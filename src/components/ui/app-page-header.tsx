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
    <div className="mb-6 space-y-1.5 border-b border-border pb-5 select-none">
      {/* Breadcrumb path */}
      {breadcrumb && (
        <div className="text-xs text-muted-foreground">
          {breadcrumb}
        </div>
      )}

      {/* Main Title & Action Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
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
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                badge.variant === "success" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                badge.variant === "warning" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                badge.variant === "danger" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-muted text-muted-foreground"
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
              className="h-8 text-xs"
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
              className="h-8 text-xs"
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
