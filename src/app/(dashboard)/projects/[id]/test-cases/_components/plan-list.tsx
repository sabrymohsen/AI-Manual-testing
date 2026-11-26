"use client"

import { useState } from "react"
import { usePlans, usePlanMutations, type TestPlanRow } from "../_hooks/use-test-library"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ClipboardCheck, MoreHorizontal, Pencil, Plus, Trash2 } from "@/components/ui/icons"
import { cn } from "@/lib/utils"
import { formatMinutes } from "./config"

/**
 * Left-rail list of test plans — saved sets of cases a tester re-runs, e.g.
 * "Smoke" or "Sprint 14 regression". Click to filter the table to the plan;
 * drag cases from the table onto a plan to add them.
 */
export function PlanList({
  projectId,
  selectedPlan,
  onSelectPlan,
  draggingCaseIds,
}: {
  projectId: string
  selectedPlan: string | undefined
  onSelectPlan: (planId: string | undefined) => void
  draggingCaseIds: string[]
}) {
  const { data, isLoading } = usePlans(projectId)
  const { create, rename, remove, editCases } = usePlanMutations(projectId)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [pendingDelete, setPendingDelete] = useState<TestPlanRow | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const plans = data?.plans ?? []

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-t px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Test plans</span>
        <button
          onClick={() => {
            setAdding(true)
            setNewName("")
          }}
          className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="New test plan"
          aria-label="New test plan"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {adding && (
          <div className="px-1 py-1">
            <Input
              autoFocus
              value={newName}
              placeholder="Plan name, e.g. Smoke"
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => setAdding(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  create.mutate({ name: newName.trim() })
                  setAdding(false)
                }
                if (e.key === "Escape") setAdding(false)
              }}
              className="h-7 text-xs"
            />
          </div>
        )}

        {isLoading && <div className="h-6 animate-pulse rounded bg-muted" />}

        {!isLoading && plans.length === 0 && !adding && (
          <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
            A plan is a set of cases you run again, like a smoke test. Select cases, then choose More and Add to plan, or drag them here.
          </p>
        )}

        {plans.map((p) => {
          const passed = p.byStatus.Passed ?? 0
          const failed = (p.byStatus.Failed ?? 0) + (p.byStatus.Blocked ?? 0)
          const isSelected = selectedPlan === p.id
          const isDrop = dropTarget === p.id && draggingCaseIds.length > 0

          if (renaming === p.id) {
            return (
              <div key={p.id} className="px-1 py-1">
                <Input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => setRenaming(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draftName.trim()) {
                      rename.mutate({ planId: p.id, name: draftName.trim() })
                      setRenaming(null)
                    }
                    if (e.key === "Escape") setRenaming(null)
                  }}
                  className="h-7 text-xs"
                />
              </div>
            )
          }

          return (
            <div
              key={p.id}
              onClick={() => onSelectPlan(isSelected ? undefined : p.id)}
              onDragOver={(e) => {
                if (!draggingCaseIds.length) return
                e.preventDefault()
                setDropTarget(p.id)
              }}
              onDragLeave={() => setDropTarget((t) => (t === p.id ? null : t))}
              onDrop={(e) => {
                e.preventDefault()
                setDropTarget(null)
                if (draggingCaseIds.length) editCases.mutate({ planId: p.id, add: draggingCaseIds })
              }}
              title={`${p.caseCount} cases · est. ${formatMinutes(p.totalMinutes)}${p.unestimated ? ` (+${p.unestimated} unestimated)` : ""}`}
              className={cn(
                "group cursor-pointer rounded-md px-2 py-2 text-sm transition-colors",
                isSelected ? "bg-primary/10 font-medium text-primary" : "hover:bg-accent/60",
                isDrop && "ring-2 ring-primary ring-offset-1 ring-offset-background"
              )}
            >
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-primary/70" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{p.caseCount}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    onClick={(e) => e.stopPropagation()}
                    className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus:opacity-100"
                    aria-label={`Actions for ${p.name}`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem
                      className="gap-2 text-xs"
                      onClick={() => {
                        setRenaming(p.id)
                        setDraftName(p.name)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="gap-2 text-xs text-destructive focus:text-destructive"
                      onClick={() => setPendingDelete(p)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete plan
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {p.caseCount > 0 && (
                <div className="ml-6 mt-1 flex h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className="bg-emerald-500" style={{ width: `${(passed / p.caseCount) * 100}%` }} />
                  <span className="bg-red-500" style={{ width: `${(failed / p.caseCount) * 100}%` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="danger"
        title={`Delete plan "${pendingDelete?.name}"?`}
        description="Only the plan is removed. Its test cases, runs and bugs are not touched."
        confirmLabel="Delete plan"
        isLoading={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return
          await remove.mutateAsync(pendingDelete.id)
          if (selectedPlan === pendingDelete.id) onSelectPlan(undefined)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
