"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kanban, X, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react"

/**
 * Create the bug-workflow board in OpenProject.
 *
 * The only decision left to the user is the board's name — the columns come from
 * the bug workflow itself, matched to the statuses the OpenProject project
 * actually has. They are shown before creating so there are no surprises, but
 * there is nothing to configure.
 */

interface ColumnPlan {
  bugStatus: string
  name: string
  statusId: string | null
  statusName: string | null
}

interface CreateResult {
  boardId: number
  url: string
  bugTypeName?: string
  columns: Array<{ name: string; statusName: string | null }>
  unmatched: string[]
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
  const [name, setName] = useState("Bug Workflow")
  const [plan, setPlan] = useState<ColumnPlan[] | null>(null)
  const [bugTypeName, setBugTypeName] = useState<string | null>(null)
  const [result, setResult] = useState<CreateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("Bug Workflow")
    setPlan(null)
    setBugTypeName(null)
    setResult(null)
    setError(null)
    setLoading(true)
    fetch(`/api/projects/${projectId}/integrations/openproject/bug-board`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Could not read OpenProject statuses")
        setPlan(data.columns || [])
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
        body: JSON.stringify({ name: name.trim() || undefined }),
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

  const willCreate = plan?.filter((c) => c.statusId) || []
  const skipped = plan?.filter((c) => !c.statusId) || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[520px] bg-background rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 text-xs font-semibold">
        <div className="p-5 border-b flex items-center justify-between bg-accent/10">
          <h3 className="font-extrabold text-sm flex items-center gap-1.5 text-foreground">
            <Kanban className="h-4 w-4 text-indigo-500" /> Create bug board in OpenProject
          </h3>
          <button
            onClick={onClose}
            disabled={creating}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold text-[11px]">
              {error}
            </div>
          )}

          {loading && (
            <p className="text-muted-foreground animate-pulse font-bold py-6 text-center">
              Reading the OpenProject statuses…
            </p>
          )}

          {result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-[13px]">
                <CheckCircle2 className="h-4 w-4" /> Board created
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                {result.columns.length} column(s):{" "}
                <span className="font-bold">{result.columns.map((c) => c.name).join(" · ")}</span>
                {result.bugTypeName && `, each showing only ${result.bugTypeName} work packages`}
                {result.setAsDefault && " — and this project's bugs now sync onto it."}
              </p>
              {result.unmatched.length > 0 && (
                <p className="text-[10px] text-amber-700 font-medium">
                  No column for {result.unmatched.join(", ")} — OpenProject has no matching status.
                </p>
              )}
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-bold text-[11px]"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open the board in OpenProject
              </a>
            </div>
          ) : plan ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase text-muted-foreground font-bold">Board name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={creating}
                  placeholder="Bug Workflow"
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">
                  Columns created for you
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {willCreate.map((col) => (
                    <span
                      key={col.bugStatus}
                      title={`Shows bugs whose OpenProject status is "${col.statusName}"`}
                      className="px-2 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 text-[10px] font-bold"
                    >
                      {col.name}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                  Each column shows only <span className="font-bold">{bugTypeName || "Bug"}</span>{" "}
                  work packages holding that status — no tasks or features — so a bug is always in
                  exactly one column and can never appear twice.
                </p>
              </div>

              {skipped.length > 0 && (
                <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50">
                  <p className="flex items-center gap-1.5 font-bold text-amber-800 text-[10px]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    No column for {skipped.map((c) => c.name).join(", ")}
                  </p>
                  <p className="text-[10px] text-amber-800/90 font-medium mt-0.5 leading-relaxed">
                    OpenProject has no status matching these. Add them there and create the board
                    again if you need those columns.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t flex items-center justify-end gap-2 bg-accent/5">
          {result ? (
            <Button size="sm" onClick={onClose} className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
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
                className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
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
