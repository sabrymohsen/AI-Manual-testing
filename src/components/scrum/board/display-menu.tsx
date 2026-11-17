"use client"

import { SlidersHorizontal } from "lucide-react"
import { useScrumUI, boardDisplayFor, type BoardDisplay } from "@/stores/scrum-ui"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Board-only view options (Linear's "Display"): card density, grouping, card
 * fields. Real menu radio/checkbox items, so arrow keys reach every option.
 */
export function DisplayMenu({ projectId }: { projectId: string }) {
  const display = useScrumUI((s) => boardDisplayFor(s, projectId))
  const setFor = useScrumUI((s) => s.setBoardDisplay)
  const set = (patch: Partial<BoardDisplay>) => setFor(projectId, patch)
  const keepOpen = (e: Event) => e.preventDefault()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Display options"
        title="Display options"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 rotate-90" />
        <span className="hidden xl:inline">Display</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Cards</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={display.cardLayout} onValueChange={(v) => set({ cardLayout: v as BoardDisplay["cardLayout"] })}>
          <DropdownMenuRadioItem value="detailed" className="text-xs" onSelect={keepOpen}>Detailed</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact" className="text-xs" onSelect={keepOpen}>Compact</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Group by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={display.swimlane} onValueChange={(v) => set({ swimlane: v as BoardDisplay["swimlane"] })}>
          <DropdownMenuRadioItem value="none" className="text-xs" onSelect={keepOpen}>None</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="assignee" className="text-xs" onSelect={keepOpen}>Assignee</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="epic" className="text-xs" onSelect={keepOpen}>Epic</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={display.showEstimations}
          onCheckedChange={(v) => set({ showEstimations: !!v })}
          onSelect={keepOpen}
          className="text-xs"
        >
          Show estimates
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={display.showSubtasks}
          onCheckedChange={(v) => set({ showSubtasks: !!v })}
          onSelect={keepOpen}
          className="text-xs"
        >
          Show subtask progress
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
