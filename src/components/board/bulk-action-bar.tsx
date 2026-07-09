"use client"

import { Trash2, ArrowRight, CheckCircle2, X } from "lucide-react"

interface BulkActionBarProps {
  selectedCount: number
  onClear: () => void
  onMoveToColumn: (status: string) => void
  onDelete: () => void
}

export default function BulkActionBar({ selectedCount, onClear, onMoveToColumn, onDelete }: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border shadow-2xl rounded-xl px-4 py-2.5">
      <span className="text-sm font-bold">{selectedCount} selected</span>
      <div className="h-5 w-px bg-border" />
      <button onClick={() => onMoveToColumn("ReadyForTesting")} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1">
        <ArrowRight className="h-3.5 w-3.5" /> To Do
      </button>
      <button onClick={() => onMoveToColumn("InTesting")} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center gap-1">
        <ArrowRight className="h-3.5 w-3.5" /> In Progress
      </button>
      <button onClick={() => onMoveToColumn("Blocked")} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-red-100 hover:bg-red-200 text-red-700 flex items-center gap-1">
        <ArrowRight className="h-3.5 w-3.5" /> Blocked
      </button>
      <button onClick={() => onMoveToColumn("Covered")} className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" /> Done
      </button>
      <div className="h-5 w-px bg-border" />
      <button onClick={onDelete} className="h-8 px-2.5 rounded-lg text-[11px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-1">
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </button>
      <button onClick={onClear} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
