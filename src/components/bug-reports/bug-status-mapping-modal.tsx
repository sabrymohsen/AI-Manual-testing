"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, CheckCircle2, GitCompare, Info, X } from "lucide-react"

/**
 * Which tracker status each of this app's bug statuses means.
 *
 * Nothing here is decided by the app. The left column is this app's own bug
 * vocabulary; the right is whatever the connected tracker actually reports, in
 * its own words and language. On first open the rows may be pre-filled with a
 * guess — clearly labelled as one — and the user changes or clears any of them.
 *
 * A row left empty means "don't touch the tracker's status for this", which is
 * the safe answer: syncing a status the user never chose would move a work item
 * somewhere nobody asked for.
 */

interface AppStatus {
  value: string
  label: string
}

interface TrackerStatus {
  id: string
  name: string
}

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

export default function BugStatusMappingModal({ projectId, open, onClose, onSaved }: Props) {
  const [appStatuses, setAppStatuses] = useState<AppStatus[]>([])
  const [trackerStatuses, setTrackerStatuses] = useState<TrackerStatus[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [isSuggestion, setIsSuggestion] = useState(false)
  const [provider, setProvider] = useState("the tracker")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaved(false)
    setLoading(true)
    fetch(`/api/projects/${projectId}/integrations/bug-status-mapping`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Could not load the status mapping")
        setAppStatuses(data.appStatuses || [])
        setTrackerStatuses(data.trackerStatuses || [])
        setMapping(data.mapping || {})
        setIsSuggestion(!!data.isSuggestion)
        setProvider(data.provider || "the tracker")
        if (data.statusError) setError(data.statusError)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [open, projectId])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/bug-status-mapping`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not save the status mapping")
      setIsSuggestion(false)
      setSaved(true)
      onSaved?.()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  /** A tracker status already claimed by another row can't be picked twice. */
  const claimedBy = (statusId: string) =>
    Object.entries(mapping).find(([, id]) => id === statusId)?.[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex max-h-[90vh] w-[560px] flex-col overflow-hidden rounded-2xl border bg-background text-xs font-semibold shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b bg-accent/10 p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
            <GitCompare className="h-4 w-4 text-indigo-500" /> Bug status mapping
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] font-bold text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="animate-pulse py-6 text-center font-bold text-muted-foreground">
              Reading the tracker&apos;s statuses…
            </p>
          ) : (
            <>
              {isSuggestion && trackerStatuses.length > 0 && (
                <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                  <p className="text-[10px] font-medium leading-relaxed text-amber-800">
                    These are a first guess, not saved yet. Check every row, change what is wrong,
                    and press Save — nothing is applied until you do.
                  </p>
                </div>
              )}

              <p className="text-[10px] font-medium leading-relaxed text-muted-foreground">
                When a bug&apos;s status changes here, sync sets the status you choose below in{" "}
                {provider}. Leave a row empty and sync will not touch that bug&apos;s status there.
              </p>

              <div className="space-y-1">
                {appStatuses.map((app) => {
                  const current = mapping[app.value] || ""
                  return (
                    <div key={app.value} className="grid grid-cols-[1fr_auto_1.3fr] items-center gap-2">
                      <span className="truncate rounded-md border bg-muted/40 px-2 py-1.5 text-[11px] font-bold">
                        {app.label}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <select
                        value={current}
                        disabled={saving || trackerStatuses.length === 0}
                        onChange={(e) => {
                          const next = { ...mapping }
                          if (e.target.value) next[app.value] = e.target.value
                          else delete next[app.value]
                          setMapping(next)
                          setSaved(false)
                        }}
                        className="h-8 w-full cursor-pointer rounded-md border bg-background px-2 text-[11px] font-semibold outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
                      >
                        <option value="">— Not mapped —</option>
                        {trackerStatuses.map((s) => {
                          const owner = claimedBy(s.id)
                          const takenByAnother = owner && owner !== app.value
                          return (
                            <option key={s.id} value={s.id} disabled={!!takenByAnother}>
                              {s.name}
                              {takenByAnother
                                ? ` (used by ${appStatuses.find((a) => a.value === owner)?.label})`
                                : ""}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  )
                })}
              </div>

              {trackerStatuses.length === 0 && !error && (
                <p className="text-[10px] font-medium text-muted-foreground">
                  No statuses came back from {provider}. Check the integration connection first.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-accent/5 p-4">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
            {saved && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </>
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="h-9">
              Close
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={saving || loading || trackerStatuses.length === 0}
              className="h-9 bg-indigo-600 font-bold text-white hover:bg-indigo-700"
            >
              {saving ? "Saving…" : "Save mapping"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
