"use client"

import { LayoutList, Rows3 } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

export type CardLayout = "compact" | "detailed"

export function CardLayoutToggle({ value, onChange }: { value: CardLayout; onChange: (v: CardLayout) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-[#DFE1E6] bg-white p-0.5">
      <button
        onClick={() => onChange("compact")}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
          value === "compact" ? "bg-[#0052CC] text-white" : "text-[#6B778C] hover:text-[#172B4D]"
        )}
        title="Compact cards"
      >
        <Rows3 className="h-3.5 w-3.5" />
        Compact
      </button>
      <button
        onClick={() => onChange("detailed")}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
          value === "detailed" ? "bg-[#0052CC] text-white" : "text-[#6B778C] hover:text-[#172B4D]"
        )}
        title="Detailed cards"
      >
        <LayoutList className="h-3.5 w-3.5" />
        Detailed
      </button>
    </div>
  )
}
