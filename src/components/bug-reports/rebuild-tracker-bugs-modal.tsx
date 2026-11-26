"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, X, RefreshCw, Trash2, Download, CheckCircle2 } from "@/components/ui/icons"

/**
 * Rebuild the tracker's bug list: delete every bug work item over there and push
 * the app's bugs back as a clean set. Bugs that live only in the tracker are
 * imported here first, so nothing is lost.
 *
 * Three states, in order: a plan the user reads, a typed confirmation (the
 * deletion is permanent and the tracker has no undo), then the result.
 */

interface PlanItem {
  externalId: string
  title: string
  url: string
  action: "delete" | "import-then-delete"
}

interface Plan {
  provider: string
  trackerBugs: number
  linked: number
  unlinked: number
  localBugs: number
  items: PlanItem[]
}

interface RebuildResult extends Plan {
  imported: number
  deleted: number
  deleteFailed: number
  resynced: number
  resyncFailed: number
  errors: string[]
}

interface Props {
  projectId: string
  trackerName: string
  open: boolean
  onClose: () => void
  /** Fired after a run so the caller can refresh its bug list. */
  onCompleted?: () => void
}

const CONFIRM_WORD = "REBUILD"

export default function RebuildTrackerBugsModal({
  projectId,
  trackerName,
  open,
  onClose,
  onCompleted,
}: Props) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [result, setResult] = useState<RebuildResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const [resync, setResync] = useState(true)

  useEffect(() => {
    if (!open) return
    setPlan(null)
    setResult(null)
    setError(null)
    setConfirmText("")
    setResync(true)
    setLoading(true)
    fetch(`/api/projects/${projectId}/integrations/bugs/rebuild`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Could not read the tracker")
        setPlan(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [open, projectId])

  const runRebuild = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/bugs/rebuild`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, resync }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Rebuild failed")
      setResult(data)
      onCompleted?.()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  if (!open) return null

  const importCount = plan?.unlinked ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[560px] bg-background rounded-xl border shadow-[0_8px_24px_rgba(0,0,0,0.08)] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 text-xs font-semibold">
        <div className="p-6 border-b flex items-center justify-between bg-accent/10">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
            <RefreshCw className="h-4 w-4 text-primary" /> Rebuild {trackerName} bugs
          </h3>
          <button
            onClick={onClose}
            disabled={running}
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
              Reading the {trackerName} bug list…
            </p>
          )}

          {/* ── Result ─────────────────────────────────────────────────────── */}
          {result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-xs">
                <CheckCircle2 className="h-4 w-4" /> Rebuild finished
              </div>
              <ul className="space-y-2 text-xs text-foreground">
                <li>{result.imported} tracker-only bug(s) imported into the app first</li>
                <li>{result.deleted} work item(s) deleted from {trackerName}</li>
                {result.deleteFailed > 0 && (
                  <li className="text-amber-700">
                    {result.deleteFailed} could not be deleted — their links were kept, so the
                    re-sync updated them instead of duplicating them
                  </li>
                )}
                {resync ? (
                  <li>{result.resynced} bug(s) pushed back to {trackerName}</li>
                ) : (
                  <li>
                    Nothing pushed back — {trackerName} is empty and every bug now reads
                    &quot;Not Synced&quot;.
                  </li>
                )}
                {result.resyncFailed > 0 && (
                  <li className="text-amber-700">{result.resyncFailed} bug(s) failed to sync</li>
                )}
              </ul>
              {result.errors.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-amber-800 font-medium">{e}</p>
                  ))}
                </div>
              )}
              {(result.deleteFailed > 0 || result.resyncFailed > 0) && (
                <p className="text-xs text-muted-foreground font-medium">
                  Running the rebuild again is safe — it picks up whatever did not finish.
                </p>
              )}
            </div>
          ) : plan ? (
            /* ── Plan + confirmation ──────────────────────────────────────── */
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Stat label={`In ${trackerName}`} value={plan.trackerBugs} />
                <Stat label="To import first" value={importCount} tone={importCount > 0 ? "amber" : undefined} />
                <Stat label="To push back" value={plan.localBugs} />
              </div>

              <div className="p-3 rounded-xl border border-red-200 bg-red-50 space-y-2">
                <p className="flex items-center gap-2 font-semibold text-red-700 text-xs">
                  <AlertTriangle className="h-4 w-4" /> This permanently deletes work items
                </p>
                <p className="text-xs text-red-700/90 font-medium leading-relaxed">
                  All {plan.trackerBugs} bug work item(s) in the {trackerName} project are deleted,
                  along with their comments, attachments and history there. {trackerName} has no
                  undo. The app&apos;s {plan.localBugs} bug(s) are then pushed back as new work
                  items with new IDs.
                </p>
              </div>

              {importCount > 0 && (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 space-y-2">
                  <p className="flex items-center gap-2 font-semibold text-amber-800 text-xs">
                    <Download className="h-4 w-4" /> {importCount} bug(s) exist only in {trackerName}
                  </p>
                  <p className="text-xs text-amber-800/90 font-medium leading-relaxed">
                    They are imported into the app before anything is deleted, so they survive the
                    rebuild and come back as app-owned bugs.
                  </p>
                </div>
              )}

              {plan.items.length > 0 && (
                <div className="border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {plan.items.map((item) => (
                    <div
                      key={item.externalId}
                      className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-xs"
                    >
                      <span className="font-mono text-muted-foreground shrink-0">#{item.externalId}</span>
                      <span className="truncate flex-1 font-medium">{item.title}</span>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded font-semibold ${
                          item.action === "import-then-delete"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {item.action === "import-then-delete" ? "import + delete" : "delete"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <label className="flex items-start gap-2 p-3 rounded-xl border cursor-pointer hover:bg-accent/20">
                <input
                  type="checkbox"
                  checked={resync}
                  onChange={(e) => setResync(e.target.checked)}
                  disabled={running}
                  className="mt-0.5 h-3.5 w-3.5 accent-indigo-600"
                />
                <span className="space-y-0.5">
                  <span className="block font-semibold text-xs text-foreground">
                    Push the app&apos;s bugs back afterwards
                  </span>
                  <span className="block text-xs text-muted-foreground font-medium leading-relaxed">
                    {resync
                      ? `All ${plan.localBugs} bug(s) are re-created in ${trackerName} right after the wipe.`
                      : `${trackerName} is left empty and every bug reads "Not Synced" — the synced count goes to zero — so you can sync when you are ready.`}
                  </span>
                </span>
              </label>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">
                  Type {CONFIRM_WORD} to confirm
                </label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  disabled={running}
                  className="h-9 font-mono"
                />
              </div>
            </div>
          ) : null}
        </div>

        {!result && plan && (
          <div className="p-4 border-t flex items-center justify-end gap-2 bg-accent/5">
            <Button variant="outline" size="sm" onClick={onClose} disabled={running} className="h-9">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={runRebuild}
              disabled={running || confirmText !== CONFIRM_WORD}
              className="h-9 bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              {running
                ? "Rebuilding…"
                : resync
                  ? `Delete ${plan.trackerBugs} and re-sync`
                  : `Delete ${plan.trackerBugs} only`}
            </Button>
          </div>
        )}
        {result && (
          <div className="p-4 border-t flex items-center justify-end bg-accent/5">
            <Button size="sm" onClick={onClose} className="h-9 bg-primary hover:bg-primary/90 text-white font-semibold">
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" }) {
  return (
    <div
      className={`p-3 rounded-xl border text-center ${
        tone === "amber" ? "border-amber-200 bg-amber-50" : "border-border bg-muted/50"
      }`}
    >
      <div className={`text-lg font-semibold ${tone === "amber" ? "text-amber-700" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
    </div>
  )
}
