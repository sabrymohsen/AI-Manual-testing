"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  BarChart3,
  LineChart,
  PieChart,
  Users,
  Bug,
  FileText,
  Settings,
  ChevronRight,
  ChevronDown,
  Timer,
  Activity,
  TrendingUp,
} from "@/components/ui/icons"

interface SidebarItem {
  id: string
  label: string
  icon: React.ReactNode
  badge?: number
  children?: { id: string; label: string; badge?: number }[]
}

interface JiraSidebarProps {
  activeId: string
  onSelect: (id: string) => void
  items?: SidebarItem[]
  title?: string
}

const DEFAULT_ITEMS: SidebarItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    id: "sprint",
    label: "Sprint Report",
    icon: <Timer className="h-4 w-4" />,
  },
  {
    id: "burndown",
    label: "Burndown Chart",
    icon: <LineChart className="h-4 w-4" />,
  },
  {
    id: "velocity",
    label: "Velocity Chart",
    icon: <TrendingUp className="h-4 w-4" />,
  },
  {
    id: "cumulative",
    label: "Cumulative Flow",
    icon: <Activity className="h-4 w-4" />,
  },
  {
    id: "control",
    label: "Control Chart",
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    id: "created-resolved",
    label: "Created vs Resolved",
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    id: "defects",
    label: "Defect Trend",
    icon: <Bug className="h-4 w-4" />,
  },
  {
    id: "team",
    label: "Team Performance",
    icon: <Users className="h-4 w-4" />,
  },
  {
    id: "funnel",
    label: "Execution Funnel",
    icon: <PieChart className="h-4 w-4" />,
  },
  {
    id: "tests",
    label: "Test Reports",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    id: "settings",
    label: "Configure",
    icon: <Settings className="h-4 w-4" />,
  },
]

export function JiraSidebar({ activeId, onSelect, items = DEFAULT_ITEMS, title = "Reports" }: JiraSidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Analytics & insights</p>
      </div>
      <nav className="py-2">
        {items.map((item) => {
          const isActive = activeId === item.id
          const isExpanded = expanded.has(item.id)
          const hasChildren = item.children && item.children.length > 0

          return (
            <div key={item.id}>
              <button
                onClick={() => {
                  if (hasChildren) toggleExpand(item.id)
                  else onSelect(item.id)
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2 text-xs font-semibold transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700 border-l-3 border-blue-600"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
                style={isActive ? { borderLeftWidth: "3px", borderLeftColor: "#2563eb", marginLeft: "0" } : { marginLeft: "3px" }}
              >
                <span className={cn("text-muted-foreground", isActive && "text-blue-600")}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge != null && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {item.badge}
                  </span>
                )}
                {hasChildren && (
                  isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
              {hasChildren && isExpanded && (
                <div className="pl-8 pr-2 py-1">
                  {item.children!.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => onSelect(child.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors",
                        activeId === child.id
                          ? "bg-blue-50 text-blue-700"
                          : "text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      <span>{child.label}</span>
                      {child.badge != null && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {child.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
