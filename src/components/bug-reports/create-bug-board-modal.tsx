"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kanban, X, ExternalLink, CheckCircle2, AlertTriangle } from "@/components/ui/icons"

/**
 * Create the bug board in the connected tracker.
 *
 * The columns are the tracker's OWN statuses — not a fixed set decided by this
 * app — so the board matches however the team actually works, in whatever
 * language their tracker is configured in. Every status is ticked by default:
 * a status with no column is a status a bug can reach and then vanish from the
 * board, so leaving one out is a deliberate choice, never the default.
 */

interface ColumnPlan {
  statusId: string
  name: string
  selected: boolean
}

interface CreateResult {
  boardId: string
  url: string
  bugTypeName?: string | null
  columns: Array<{ name: string; statusId: string }>
  excluded: string[]
  setAsDefault: boolean
}

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
  /** Fired after a board is created, so the caller can refresh anything board-related. */
  onCreated?: (result: CreateResult) => void
}

export default function CreateBugBoardModal({ projectId, open, onClose, onCreated }: Props) {
  const [name, setName] = useState("Bug workflow")
  const [plan, setPlan] = useState<ColumnPlan[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [providerName, setProviderName] = useState<string>("the tracker")
  const [bugTypeName, setBugTypeName] = useState<string | null>(null)
  const [result, setResult] = useState<CreateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("Bug workflow")
    setPlan(null)
    setSelected(new Set())
    setBugTypeName(null)
    setResult(null)
    setError(null)
    setLoading(true)
    fetch(`/api/projects/${projectId}/integrations/openproject/bug-board`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Could not read the tracker's statuses")
        const columns: ColumnPlan[] = data.columns || []
        setPlan(columns)
        setSelected(new Set(columns.filter((c) => c.selected).map((c) => c.statusId)))
        setProviderName(data.provider || "the tracker")
        setBugTypeName(data.bugTypeName || null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [open, projectId])

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/bug-board`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          statusIds: Array.from(selected),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not create the board")
      setResult(data)
      onCreated?.(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  const willCreate = plan?.filter((c) => selected.has(c.statusId)) || []
  const skipped = plan?.filter((c) => !selected.has(c.statusId)) || []

  const toggle = (statusId: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(statusId)) next.delete(statusId)
      else next.add(statusId)
      return next
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[520px] bg-background rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 text-xs font-semibold">
        <div className="p-6 border-b flex items-center justify-between bg-accent/10">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
            <Kanban className="h-4 w-4 text-primary" /> Create bug board in {providerName}
          </h3>
          <button
            onClick={onClose}
            disabled={creating}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 font-semibold text-xs">
              {error}
            </div>
          )}

          {loading && (
            <p className="text-muted-foreground animate-pulse font-semibold py-6 text-center">
              Reading the tracker's statuses…
            </p>
          )}

          {result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-xs">
                <CheckCircle2 className="h-4 w-4" /> Board created
              </div>
              <p className="text-xs text-foreground leading-relaxed">
                {result.columns.length} column(s):{" "}
                <span className="font-semibold">{result.columns.map((c) => c.name).join(" · ")}</span>
                {result.bugTypeName && `, each showing only ${result.bugTypeName} items`}
                {result.setAsDefault && " — and this project's bugs now sync onto it."}
              </p>
              {result.excluded.length > 0 && (
                <p className="text-xs text-amber-700 font-medium">
                  No column for {result.excluded.join(", ")} — a bug reaching one of those statuses
                  will not show on this board.
                </p>
              )}
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:text-primary font-semibold text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open the board in OpenProject
              </a>
            </div>
          ) : plan ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">Board name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={creating}
                  placeholder="Bug workflow"
                  className="h-9"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground font-medium">
                    Columns — one per {providerName} status
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        selected.size === plan.length
                          ? new Set()
                          : new Set(plan.map((c) => c.statusId))
                      )
                    }
                    className="text-xs font-semibold text-primary hover:text-primary"
                  >
                    {selected.size === plan.length ? "Clear all" : "Select all"}
                  </button>
                </div>

                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {plan.map((col) => {
                    const on = selected.has(col.statusId)
                    return (
                      <label
                        key={col.statusId}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                          on
                            ? "border-primary/25 bg-primary/10 text-primary"
                            : "border-transparent text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(col.statusId)}
                          disabled={creating}
                          className="rounded"
                        />
                        {col.name}
                      </label>
                    )
                  })}
                </div>

                <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                  Column names come from {providerName} itself.
                  {bugTypeName
                    ? ` Each shows only ${bugTypeName} items holding that status`
                    : " Each shows only items holding that status"}
                  , so a bug is always in exactly one column and can never appear twice.
                </p>
              </div>

              {skipped.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                  <p className="flex items-center gap-2 font-semibold text-amber-800 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    No column for {skipped.map((c) => c.name).join(", ")}
                  </p>
                  <p className="text-xs text-amber-800/90 font-medium mt-0.5 leading-relaxed">
                    A bug that reaches one of these statuses will not appear on the board at all —
                    it is not lost, just not shown. Tick them above unless you mean to hide them.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t flex items-center justify-end gap-2 bg-accent/5">
          {result ? (
            <Button size="sm" onClick={onClose} className="h-9 bg-primary hover:bg-primary/90 text-white font-semibold">
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onClose} disabled={creating} className="h-9">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={create}
                disabled={creating || loading || willCreate.length === 0}
                className="h-9 bg-primary hover:bg-primary/90 text-white font-semibold"
              >
                {creating ? "Creating…" : `Create board with ${willCreate.length} column(s)`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
