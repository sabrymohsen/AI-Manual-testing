"use client"

import { useState, useRef, useEffect } from "react"
import {
  CloudUpload, Link2, ChevronDown, Loader2, CheckCircle2, XCircle,
  ExternalLink, AlertCircle, LayoutGrid, RefreshCw, Eye,
  Settings, Clock, MoreHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { OpenProjectMapParentModal } from "./openproject-map-parent-modal"
import { OpenProjectSyncedItemsDrawer } from "./openproject-synced-items-drawer"
import { OpenProjectModuleConfigModal } from "./openproject-module-config-modal"

interface GroupOpStatus {
  parentMapped: boolean
  parentId: string | null
  parentSubject: string | null
  parentUrl: string | null
  syncedCount: number
  failedSyncCount: number
  boardReadyCount: number
  lastSyncAt: string | null
}

interface ModuleConfigStatus {
  hasOwnConfig: boolean
  configured: boolean
  complete: boolean
  lastSyncStatus: string | null
  lastSyncError: string | null
  lastSyncAt: string | null
}

interface BoardCheckResult {
  boardReady: number
  missingParent: number
  missingStatus: number
  notSynced: number
  total: number
  items: Array<{ testCaseId: string; testCaseTitle: string; status: string; issues: string[] }>
}

interface SyncResult {
  groupId: string
  groupName: string
  total: number
  created: number
  updated: number
  failed: number
  parentLinked: number
  message: string
}

interface Props {
  projectId: string
  groupId: string
  groupName: string
  totalCases: number
  opStatus: GroupOpStatus
  moduleConfig: ModuleConfigStatus
  onStatusRefresh?: () => void
}

// ── Status derivation ──────────────────────────────────────────────────────────

type OpState = "not-configured" | "ready" | "partial" | "synced" | "failed"

function deriveOpState(modCfg: ModuleConfigStatus, opStatus: GroupOpStatus, totalCases: number): OpState {
  if (!modCfg.complete) return "not-configured"
  if (modCfg.lastSyncStatus === "failed") return "failed"
  if (modCfg.lastSyncStatus === "success") return "synced"
  if (opStatus.syncedCount > 0 && opStatus.syncedCount < totalCases) return "partial"
  return "ready"
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OpenProjectGroupSyncPanel({
  projectId,
  groupId,
  groupName,
  totalCases,
  opStatus,
  moduleConfig,
  onStatusRefresh,
}: Props) {
  const [isSyncing, setIsSyncing]           = useState(false)
  const [isApplyingParent, setIsApplyingParent] = useState(false)
  const [isSyncingBoard, setIsSyncingBoard] = useState(false)
  const [isCheckingBoard, setIsCheckingBoard] = useState(false)
  const [showMapParent, setShowMapParent]   = useState(false)
  const [showSyncedItems, setShowSyncedItems] = useState(false)
  const [showModuleConfig, setShowModuleConfig] = useState(false)
  const [showMoreMenu, setShowMoreMenu]     = useState(false)
  const [localStatus, setLocalStatus]       = useState<GroupOpStatus>(opStatus)
  const [localModCfg, setLocalModCfg]       = useState<ModuleConfigStatus>(moduleConfig)
  const [toast, setToast]                   = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null)
  const [boardResult, setBoardResult]       = useState<BoardCheckResult | null>(null)
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setLocalStatus(opStatus) }, [opStatus])
  useEffect(() => { setLocalModCfg(moduleConfig) }, [moduleConfig])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    if (showMoreMenu) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showMoreMenu])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000)
      return () => clearTimeout(t)
    }
  }, [toast])

  function showToast(msg: string, type: "success" | "error" | "info" = "success") {
    setToast({ msg, type })
  }

  function formatRelativeTime(iso: string | null) {
    if (!iso) return null
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  // ── Action handlers (unchanged) ─────────────────────────────────────────────

  async function handleSync() {
    setIsSyncing(true)
    setLastSyncResult(null)
    setBoardResult(null)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/integrations/openproject/groups/${groupId}/sync`,
        { method: "POST" }
      )
      const data = await res.json()
      if (res.ok) {
        setLastSyncResult(data)
        setLocalModCfg(prev => ({
          ...prev,
          lastSyncStatus: data.failed === 0 ? "success" : "failed",
          lastSyncError: data.failed > 0 ? `${data.failed} item(s) failed` : null,
          lastSyncAt: new Date().toISOString(),
        }))
        showToast(data.message || "Sync complete", data.failed > 0 ? "error" : "success")
        onStatusRefresh?.()
      } else {
        setLocalModCfg(prev => ({ ...prev, lastSyncStatus: "failed", lastSyncError: data.error || "Sync failed" }))
        showToast(data.error || "Sync failed", "error")
      }
    } catch (err: any) {
      showToast(err.message || "Network error", "error")
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleApplyParent() {
    setIsApplyingParent(true)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/integrations/openproject/groups/${groupId}/apply-parent`,
        { method: "POST" }
      )
      const data = await res.json()
      if (res.ok) showToast(data.message || "Parent applied", "success")
      else showToast(data.error || "Failed to apply parent", "error")
      onStatusRefresh?.()
    } catch (err: any) {
      showToast(err.message || "Network error", "error")
    } finally {
      setIsApplyingParent(false)
      setShowMoreMenu(false)
    }
  }

  async function handleSyncToBoard() {
    setIsSyncingBoard(true)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/integrations/openproject/groups/${groupId}/sync-to-board`,
        { method: "POST" }
      )
      const data = await res.json()
      if (res.ok) showToast(data.message || "Board fields applied", "success")
      else showToast(data.error || "Failed to sync to board", "error")
    } catch (err: any) {
      showToast(err.message || "Network error", "error")
    } finally {
      setIsSyncingBoard(false)
      setShowMoreMenu(false)
    }
  }

  async function handleCheckBoard() {
    setIsCheckingBoard(true)
    setBoardResult(null)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/integrations/openproject/groups/${groupId}/check-board-visibility`,
        { method: "POST" }
      )
      const data = await res.json()
      if (res.ok) {
        setBoardResult(data)
        showToast(`Board ready: ${data.boardReady} / ${data.total}`, data.boardReady === data.total ? "success" : "info")
      } else {
        showToast(data.error || "Board check failed", "error")
      }
    } catch (err: any) {
      showToast(err.message || "Network error", "error")
    } finally {
      setIsCheckingBoard(false)
      setShowMoreMenu(false)
    }
  }

  function handleParentMapped(parentId: string, subject: string | null, url: string | null) {
    setLocalStatus(prev => ({ ...prev, parentMapped: true, parentId, parentSubject: subject, parentUrl: url }))
    showToast(`Parent #${parentId} mapped`, "success")
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const opState      = deriveOpState(localModCfg, localStatus, totalCases)
  const syncedCount  = localStatus.syncedCount
  const failedCount  = localStatus.failedSyncCount
  const lastSyncAt   = localModCfg.lastSyncAt || localStatus.lastSyncAt
  const relativeTime = formatRelativeTime(lastSyncAt)

  // ── Status badge ───────────────────────────────────────────────────────────

  function StatusBadge() {
    switch (opState) {
      case "not-configured":
        return (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Settings className="h-2.5 w-2.5" /> Not configured
          </span>
        )
      case "ready":
        return (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
            <CloudUpload className="h-2.5 w-2.5" /> Ready to sync
          </span>
        )
      case "partial":
        return (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <CloudUpload className="h-2.5 w-2.5" /> {syncedCount}/{totalCases} synced
          </span>
        )
      case "synced":
        return (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle2 className="h-2.5 w-2.5" /> Synced
            {relativeTime && <span className="font-normal ml-0.5 opacity-80">· {relativeTime}</span>}
          </span>
        )
      case "failed":
        return (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 max-w-[160px]"
            title={localModCfg.lastSyncError || undefined}
          >
            <XCircle className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">Sync failed{localModCfg.lastSyncError ? ` — ${localModCfg.lastSyncError}` : ""}</span>
          </span>
        )
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-2.5">

        {/* ── Header row: label + canonical badge ───────────────────── */}
        <div className="flex items-center justify-between gap-2" dir="ltr">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/50 flex items-center gap-1">
            <CloudUpload className="h-3 w-3" /> OpenProject
            {localModCfg.hasOwnConfig && (
              <span className="normal-case font-normal tracking-normal text-muted-foreground/40">(own config)</span>
            )}
          </span>
          <StatusBadge />
        </div>

        {/* ── Not configured: setup CTA ─────────────────────────────── */}
        {opState === "not-configured" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowModuleConfig(true)}
            className="w-full h-8 text-xs font-semibold border-dashed text-muted-foreground hover:text-foreground hover:border-solid"
          >
            <Settings className="h-3 w-3 mr-1.5" />
            Configure OpenProject
          </Button>
        )}

        {/* ── Configured: WP link + actions ────────────────────────── */}
        {opState !== "not-configured" && (
          <>
            {/* Parent WP link */}
            <div dir="ltr">
              {localStatus.parentMapped && localStatus.parentId ? (
                <a
                  href={localStatus.parentUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-400 hover:bg-blue-100 max-w-full font-medium group"
                >
                  <Link2 className="h-2.5 w-2.5 shrink-0" />
                  <span className="font-bold shrink-0">#{localStatus.parentId}</span>
                  {localStatus.parentSubject && (
                    <span
                      className="truncate max-w-[110px] text-blue-600/80 dark:text-blue-400/80"
                      title={localStatus.parentSubject}
                    >
                      — {localStatus.parentSubject}
                    </span>
                  )}
                  <ExternalLink className="h-2.5 w-2.5 shrink-0 ml-0.5 opacity-60 group-hover:opacity-100" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400 font-medium">
                  <AlertCircle className="h-2.5 w-2.5 shrink-0" /> No parent mapped
                </span>
              )}
            </div>

            {/* Sync count sub-line (only show for partial/failed to add context) */}
            {(opState === "partial" || failedCount > 0) && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground" dir="ltr">
                {syncedCount > 0 && (
                  <span className={syncedCount === totalCases ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-600 dark:text-amber-400 font-semibold"}>
                    {syncedCount}/{totalCases} synced
                  </span>
                )}
                {failedCount > 0 && (
                  <span className="text-red-600 dark:text-red-400 font-semibold flex items-center gap-0.5">
                    <XCircle className="h-2.5 w-2.5" /> {failedCount} failed
                  </span>
                )}
              </div>
            )}

            {/* ── Action row ─────────────────────────────────────────── */}
            <div className="flex items-center gap-1.5" dir="ltr">

              {/* Map Parent — amber warning, only when missing */}
              {!localStatus.parentMapped && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowMapParent(true)}
                  className="h-7 px-2.5 text-xs font-semibold border-amber-300 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/20 shrink-0"
                >
                  <Link2 className="h-3 w-3 mr-1" /> Map Parent
                </Button>
              )}

              {/* Primary: Sync Now */}
              <Button
                size="sm"
                variant="default"
                onClick={handleSync}
                disabled={isSyncing}
                className="h-7 px-3 text-xs font-semibold shrink-0"
              >
                {isSyncing
                  ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  : <CloudUpload className="h-3 w-3 mr-1" />}
                {isSyncing ? "Syncing…" : "Sync Now"}
              </Button>

              {/* Secondary: View (only when something to view) */}
              {syncedCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowSyncedItems(true)}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
                  title="View synced work packages"
                >
                  <Eye className="h-3 w-3 mr-1" /> View
                </Button>
              )}

              {/* More — icon-only overflow menu */}
              <div className="relative ms-auto" ref={menuRef}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowMoreMenu(v => !v)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  title="More actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>

                {showMoreMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-xl shadow-xl py-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={() => { setShowModuleConfig(true); setShowMoreMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent text-left"
                    >
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                      Module Settings
                    </button>

                    <div className="border-t my-1" />

                    <button
                      onClick={() => { setShowMapParent(true); setShowMoreMenu(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent text-left"
                    >
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {localStatus.parentMapped ? "Change Parent" : "Map Parent"}
                    </button>

                    {localStatus.parentMapped && syncedCount > 0 && (
                      <button
                        onClick={handleApplyParent}
                        disabled={isApplyingParent}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent text-left disabled:opacity-50"
                      >
                        {isApplyingParent
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Link2 className="h-3.5 w-3.5 text-muted-foreground" />}
                        Apply Parent to Synced
                      </button>
                    )}

                    {syncedCount > 0 && (
                      <>
                        <button
                          onClick={handleSyncToBoard}
                          disabled={isSyncingBoard}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent text-left disabled:opacity-50"
                        >
                          {isSyncingBoard
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />}
                          Sync Group to Board
                        </button>

                        <button
                          onClick={handleCheckBoard}
                          disabled={isCheckingBoard}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent text-left disabled:opacity-50"
                        >
                          {isCheckingBoard
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />}
                          Check Board Visibility
                        </button>

                        <button
                          onClick={() => { setShowSyncedItems(true); setShowMoreMenu(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent text-left"
                        >
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          View Synced Items
                        </button>
                      </>
                    )}

                    {localStatus.parentUrl && (
                      <>
                        <div className="border-t my-1" />
                        <a
                          href={localStatus.parentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowMoreMenu(false)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent text-left"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          View Parent in OpenProject
                        </a>
                      </>
                    )}

                    {failedCount > 0 && (
                      <>
                        <div className="border-t my-1" />
                        <button
                          onClick={() => { handleSync(); setShowMoreMenu(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent text-left text-red-600 dark:text-red-400"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Retry Failed ({failedCount})
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Inline result summaries ────────────────────────────── */}
            {lastSyncResult && (
              <div className={`rounded-lg p-2 text-xs border ${
                lastSyncResult.failed > 0
                  ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-300"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
              }`}>
                <div className="flex items-start gap-1.5">
                  {lastSyncResult.failed === 0
                    ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                  <div>
                    <span className="font-semibold">{lastSyncResult.message}</span>
                    <span className="text-[10px] ml-2 opacity-70">({lastSyncResult.total} total)</span>
                  </div>
                </div>
              </div>
            )}

            {boardResult && (
              <div className={`rounded-lg p-2 text-xs border ${
                boardResult.boardReady === boardResult.total
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
                  : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300"
              }`}>
                <div className="font-semibold mb-1">Board Visibility</div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span>Ready: <b>{boardResult.boardReady}</b></span>
                  {boardResult.notSynced > 0     && <span>Not synced: <b>{boardResult.notSynced}</b></span>}
                  {boardResult.missingParent > 0  && <span>Missing parent: <b>{boardResult.missingParent}</b></span>}
                  {boardResult.missingStatus > 0  && <span>Missing status: <b>{boardResult.missingStatus}</b></span>}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Toast ─────────────────────────────────────────────────── */}
        {toast && (
          <div className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
              : toast.type === "error"
              ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400"
              : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-400"
          }`}>
            {toast.type === "success" && <CheckCircle2 className="h-3 w-3 shrink-0" />}
            {toast.type === "error"   && <XCircle className="h-3 w-3 shrink-0" />}
            {toast.type === "info"    && <AlertCircle className="h-3 w-3 shrink-0" />}
            {toast.msg}
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {showMapParent && (
        <OpenProjectMapParentModal
          projectId={projectId}
          groupId={groupId}
          groupName={groupName}
          currentParentId={localStatus.parentId}
          currentParentSubject={localStatus.parentSubject}
          onSaved={handleParentMapped}
          onSavedAndSync={() => { setShowMapParent(false); handleSync() }}
          onClose={() => setShowMapParent(false)}
        />
      )}

      {showSyncedItems && (
        <OpenProjectSyncedItemsDrawer
          projectId={projectId}
          groupId={groupId}
          groupName={groupName}
          onClose={() => setShowSyncedItems(false)}
          onRetryItem={() => handleSync()}
        />
      )}

      {showModuleConfig && (
        <OpenProjectModuleConfigModal
          projectId={projectId}
          moduleId={groupId}
          moduleName={groupName}
          onClose={() => setShowModuleConfig(false)}
          onSaved={() => {
            setShowModuleConfig(false)
            onStatusRefresh?.()
          }}
        />
      )}
    </>
  )
}
