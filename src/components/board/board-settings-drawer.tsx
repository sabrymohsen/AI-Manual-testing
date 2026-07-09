"use client"

import { useState } from "react"
import { X, Settings } from "lucide-react"
import { type BoardConfig } from "./board-config"
import { BOARD_COLUMNS, ConfirmModal } from "./shared"

interface BoardSettingsDrawerProps {
  config: BoardConfig
  onChange: (config: BoardConfig) => void
  onClose: () => void
}

export default function BoardSettingsDrawer({ config, onChange, onClose }: BoardSettingsDrawerProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-card border-l border-slate-100 dark:border-slate-800/80 shadow-2xl w-full max-w-sm h-full flex flex-col animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
          <h3 className="font-black text-sm uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Settings className="h-4.5 w-4.5 text-indigo-500" /> Board Configuration
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted p-1.5 rounded-xl transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* WIP Limits */}
          <div className="space-y-4">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Work In Progress (WIP) Limits</h4>
              <p className="text-[11px] text-muted-foreground/80 mt-0.5">Control column card limits to avoid team bottlenecks. Set to 0 to disable.</p>
            </div>
            <div className="space-y-3.5">
              {BOARD_COLUMNS.map((col) => (
                <div key={col.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-900/30">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{col.label}</span>
                    <span className="text-[9px] text-muted-foreground uppercase font-semibold">Column Limit</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={config.wipLimits[col.id] || 0}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value) || 0)
                      onChange({ ...config, wipLimits: { ...config.wipLimits, [col.id]: val } })
                    }}
                    className="w-16 h-8.5 text-xs text-center rounded-lg border border-slate-200 dark:border-slate-800 bg-background font-extrabold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Reset */}
          <div className="pt-5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="h-8.5 px-4 rounded-xl border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              Reset to Defaults
            </button>
            <button
              onClick={onClose}
              className="h-8.5 px-4 rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-md shadow-indigo-500/10"
            >
              Apply Settings
            </button>
          </div>
        </div>
      </div>

      {showResetConfirm && (
        <ConfirmModal
          title="Reset Layout Settings"
          message="Are you sure you want to reset all work-in-progress limits, swimlanes, and active filter states to defaults?"
          onConfirm={() => {
            onChange({
              swimlaneMode: "none",
              cardColorMode: "priority",
              cardSize: "normal",
              wipLimits: { todo: 0, inprogress: 0, blocked: 0, done: 0 },
              collapsedColumns: [],
              quickFilters: { assignees: [], priorities: [], labels: [], types: [] },
            })
            setShowResetConfirm(false)
          }}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  )
}
