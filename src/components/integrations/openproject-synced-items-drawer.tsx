"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useState, useEffect } from "react"
import { X, Loader2, ExternalLink, CheckCircle2, XCircle, CloudUpload, RefreshCw, Clock } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"

interface SyncedItem {
  testCaseId: string
  testCaseTitle: string
  localStatus: string | null
  externalId: string | null
  externalUrl: string | null
  parentLinked: boolean
  lastSyncStatus: string | null
  lastSyncAt: string | null
}

interface Props {
  projectId: string
  groupId: string
  groupName: string
  onClose: () => void
  onRetryItem?: (tcId: string) => void
}

export function OpenProjectSyncedItemsDrawer({ projectId, groupId, groupName, onClose, onRetryItem }: Props) {
  const [items, setItems] = useState<SyncedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadItems()
  }, [groupId])

  async function loadItems() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/groups/${groupId}/items`)
      const data = await res.json()
      if (res.ok) setItems(data.items || [])
      else setError(data.error || "Failed to load items")
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setLoading(false)
    }
  }

  function statusBadge(status: string | null) {
    if (!status) return <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground font-semibold">Not Run</span>
    const colors: Record<string, string> = {
      Passed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
      Failed: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
      Blocked: "bg-slate-100 text-slate-700 dark:bg-slate-800/30 dark:text-slate-400",
    }
    return <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[status] || "bg-secondary text-muted-foreground"}`}>{status}</span>
  }

  function syncBadge(item: SyncedItem) {
    if (!item.externalId) {
      return <span className="text-xs px-2 py-0.5 rounded border border-muted-foreground/20 text-muted-foreground/60 font-semibold flex items-center gap-0.5"><CloudUpload className="h-2.5 w-2.5" /> Not Synced</span>
    }
    if (item.lastSyncStatus === "failed") {
      return <span className="text-xs px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 font-semibold flex items-center gap-0.5"><XCircle className="h-2.5 w-2.5" /> Failed</span>
    }
    return (
      <a href={item.externalUrl || "#"} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        className="text-xs px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 font-semibold flex items-center gap-0.5 hover:bg-blue-100">
        <CheckCircle2 className="h-2.5 w-2.5" /> #{item.externalId}
      </a>
    )
  }

  const synced = items.filter(i => i.externalId && i.lastSyncStatus !== "failed").length
  const failed = items.filter(i => i.lastSyncStatus === "failed").length
  const notSynced = items.filter(i => !i.externalId).length

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-2xl bg-card border-l shadow-[0_8px_24px_rgba(0,0,0,0.08)] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-accent/10 shrink-0">
          <div>
            <h2 className="font-semibold text-lg">Synced Items</h2>
            <p className="text-sm text-muted-foreground mt-0.5" dir="auto">{groupName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadItems} disabled={loading} className="h-8 w-8 p-0">
              {loading ? <BusyDot /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 p-4 border-b bg-accent/5 shrink-0">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
            <div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{synced}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Synced</div>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 text-center">
            <div className="text-2xl font-semibold text-red-700 dark:text-red-400">{failed}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Failed</div>
          </div>
          <div className="rounded-lg bg-secondary border p-3 text-center">
            <div className="text-2xl font-semibold text-muted-foreground">{notSynced}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Not Synced</div>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <BusyDot /> Loading...
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-600 text-sm">{error}</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No test cases in this group.</div>
          ) : (
            <div className="divide-y">
              {items.map(item => (
                <div key={item.testCaseId} className="p-4 flex items-start gap-3 hover:bg-accent/20">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.testCaseTitle}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {statusBadge(item.localStatus)}
                      {syncBadge(item)}
                      {item.lastSyncAt && (
                        <span className="text-xs text-muted-foreground/60 flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(item.lastSyncAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.externalUrl && (
                      <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
                        className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-950/20 text-blue-600 dark:text-blue-400"
                        title="View in OpenProject">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {(item.lastSyncStatus === "failed" || !item.externalId) && onRetryItem && (
                      <Button variant="ghost" size="sm" onClick={() => onRetryItem(item.testCaseId)}
                        className="h-7 px-2 text-xs text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/20">
                        <RefreshCw className="h-3 w-3 mr-1" /> Retry
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
