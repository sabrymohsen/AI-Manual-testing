"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Activity,
  Bot,
  ChevronDown,
  Database,
  Film,
  Images,
  LayoutGrid,
  Route,
  ScanEye,
  Shield,
  Stethoscope,
  Wrench,
} from "@/components/ui/icons"
import { cn } from "@/lib/utils"

export type HubTool =
  | "Trace"
  | "Evidence"
  | "Video"
  | "Visual"
  | "Diagnosis"
  | "Heal"
  | "Flakes"
  | "Matrix"
  | "Agent"
  | "DataConfig"

type Item = { id: HubTool; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }

/** Every analysis tool, grouped by what you are trying to do. */
export const HUB_TOOL_GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Look at results",
    items: [
      { id: "Trace", label: "Trace Viewer", hint: "Step through a run action by action", icon: Route },
      { id: "Evidence", label: "Evidence", hint: "Screenshots, videos and logs from runs", icon: Images },
      { id: "Video", label: "Video Lab", hint: "Watch recordings and cut clips", icon: Film },
      { id: "Visual", label: "Visual diff", hint: "Compare screenshots with a saved baseline", icon: ScanEye },
    ],
  },
  {
    label: "Find problems",
    items: [
      { id: "Diagnosis", label: "Failure diagnosis", hint: "AI explains why a run failed", icon: Stethoscope },
      { id: "Heal", label: "Self-healing", hint: "Locator fixes to approve, and locator health", icon: Shield },
      { id: "Flakes", label: "Flaky tests", hint: "Tests that pass and fail with no change", icon: Activity },
      { id: "Matrix", label: "Browser matrix", hint: "Results for each browser", icon: LayoutGrid },
    ],
  },
  {
    label: "Assistant",
    items: [{ id: "Agent", label: "AI Agent", hint: "Chat with an assistant that can run and fix tests", icon: Bot }],
  },
  {
    label: "Setup",
    items: [{ id: "DataConfig", label: "Data & settings", hint: "Test data, variables, secrets and run settings", icon: Database }],
  },
]

const ALL = HUB_TOOL_GROUPS.flatMap((g) => g.items)

export function HubToolsMenu({ active, onPick }: { active: string; onPick: (tool: HubTool) => void }) {
  const current = ALL.find((t) => t.id === active)
  const Icon = current?.icon ?? Wrench

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          current ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
        {current ? current.label : "Tools"}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[75vh] w-80 overflow-y-auto p-1.5">
        {HUB_TOOL_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">{group.label}</DropdownMenuLabel>
            {group.items.map((item) => {
              const ItemIcon = item.icon
              const on = item.id === active
              return (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => onPick(item.id)}
                  className={cn("items-start gap-3 rounded-md px-2 py-2", on && "bg-accent")}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                    <ItemIcon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">{item.hint}</span>
                  </span>
                </DropdownMenuItem>
              )
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
