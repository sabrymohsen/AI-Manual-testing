"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Shield, CheckCircle2, AlertCircle, RefreshCw, CloudUpload, Loader2,
  Link2, Eye, RotateCcw, ChevronDown, ChevronRight, ExternalLink
} from "lucide-react"

interface IntegrationConfigProps {
  projectId: string
}

interface OpType { id: number; name: string; href: string }
interface OpStatus { id: number; name: string; href: string; isClosed: boolean; isDefault: boolean }
interface OpVersion { id: number; name: string; href: string; status: string }
interface OpBoard { id: number; name: string; type: string }
interface OpBoardColumn { widgetId: number; name: string; queryId: string | null; columnType: string; attributeId: string | null }
interface SyncRunItem {
  id: string; operation: string; status: string; totalCount: number;
  createdCount: number; updatedCount: number; skippedCount: number; failedCount: number;
  error: string | null; startedAt: string | null; completedAt: string | null; createdAt: string
}

// Legacy integration state (Jira / Azure DevOps)
interface LegacyState {
  provider: string; enabled: boolean; host: string; projectKey: string;
  username: string; token: string; triggerOn: string; hasToken: boolean
}

// Dedicated OpenProject integration state
interface OpState {
  hasToken: boolean
  baseUrl: string; openProjectProjectIdentifier: string; apiToken: string
  testCaseTypeId: string; bugTypeId: string
  defaultStatusId: string; notExecutedStatusId: string; runningStatusId: string
  passedStatusId: string; failedStatusId: string; blockedStatusId: string
  parentStrategy: string; defaultParentWorkPackageId: string
  boardStrategy: string; targetVersionId: string; targetBoardId: string; targetColumnStatusId: string
  autoSyncTestCases: boolean; autoSyncResults: boolean
  autoCreateBugOnFailure: boolean; autoSyncBugToOpenProject: boolean
  lastConnectionStatus: string; lastConnectionCheckedAt: string | null; lastSyncAt: string | null
}

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"

export function IntegrationConfig({ projectId }: IntegrationConfigProps) {
  // Provider selection
  const [provider, setProvider] = useState("none")

  // Legacy state
  const [legacy, setLegacy] = useState<LegacyState>({
    provider: "none", enabled: false, host: "", projectKey: "",
    username: "", token: "", triggerOn: "Failed", hasToken: false,
  })

  // OpenProject dedicated state
  const [op, setOp] = useState<OpState>({
    hasToken: false, baseUrl: "", openProjectProjectIdentifier: "", apiToken: "",
    testCaseTypeId: "", bugTypeId: "",
    defaultStatusId: "", notExecutedStatusId: "", runningStatusId: "",
    passedStatusId: "", failedStatusId: "", blockedStatusId: "",
    parentStrategy: "None", defaultParentWorkPackageId: "",
    boardStrategy: "StatusBased", targetVersionId: "", targetBoardId: "", targetColumnStatusId: "",
    autoSyncTestCases: false, autoSyncResults: true,
    autoCreateBugOnFailure: true, autoSyncBugToOpenProject: false,
    lastConnectionStatus: "", lastConnectionCheckedAt: null, lastSyncAt: null,
  })

  // OpenProject metadata
  const [opTypes, setOpTypes] = useState<OpType[]>([])
  const [opStatuses, setOpStatuses] = useState<OpStatus[]>([])
  const [opVersions, setOpVersions] = useState<OpVersion[]>([])
  const [opBoards, setOpBoards] = useState<OpBoard[]>([])
  const [opBoardColumns, setOpBoardColumns] = useState<OpBoardColumn[]>([])
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [metadataLoaded, setMetadataLoaded] = useState(false)

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [applyingParent, setApplyingParent] = useState(false)
  const [creatingBugBoard, setCreatingBugBoard] = useState(false)
  const [bugBoardResult, setBugBoardResult] = useState<{ success: boolean; message: string; url?: string } | null>(null)
  const [syncingBoard, setSyncingBoard] = useState(false)
  const [checkingBoard, setCheckingBoard] = useState(false)
  const [validatingParent, setValidatingParent] = useState(false)

  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)
  const [parentResult, setParentResult] = useState<{ success: boolean; message: string } | null>(null)
  const [boardResult, setBoardResult] = useState<{ success: boolean; message: string } | null>(null)

  // Sync history
  const [syncRuns, setSyncRuns] = useState<SyncRunItem[]>([])
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    connection: true, types: false, statuses: false, parent: false,
    board: false, autoSync: false, actions: false, history: false,
  })

  const togglePanel = (key: string) =>
    setExpandedPanels((prev) => ({ ...prev, [key]: !prev[key] }))

  // Load settings
  useEffect(() => {
    async function load() {
      try {
        // Load legacy settings
        const legRes = await fetch(`/api/projects/${projectId}/integrations`)
        if (legRes.ok) {
          const d = await legRes.json()
          if (d.integration) {
            setLegacy({
              provider: d.integration.provider || "none",
              enabled: d.integration.enabled || false,
              host: d.integration.host || "", projectKey: d.integration.projectKey || "",
              username: d.integration.username || "", token: "",
              triggerOn: d.integration.triggerOn || "Failed", hasToken: d.integration.hasToken || false,
            })
            setProvider(d.integration.provider || "none")
          }
        }

        // Load OpenProject dedicated settings
        const opRes = await fetch(`/api/projects/${projectId}/integrations/openproject`)
        if (opRes.ok) {
          const d = await opRes.json()
          if (d.integration) {
            setOp((prev) => ({ ...prev, ...d.integration, apiToken: "" }))
            if (d.integration.baseUrl) setProvider("openproject")
          }
        }
      } catch (e) {
        console.error("Failed to load settings:", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  // Load metadata when OpenProject is selected and has saved settings
  const loadMetadata = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/metadata`)
      if (res.ok) {
        const data = await res.json()
        setOpTypes(data.types || [])
        setOpStatuses(data.statuses || [])
        setOpVersions(data.versions || [])
        setOpBoards(data.boards || [])
        setMetadataLoaded(true)
      }
    } catch {}
  }, [projectId])

  useEffect(() => {
    if (provider === "openproject" && op.hasToken) loadMetadata()
  }, [provider, op.hasToken, loadMetadata])

  const loadBoardColumns = useCallback(async (boardId: string) => {
    if (!boardId) { setOpBoardColumns([]); return }
    setLoadingColumns(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/board-columns?boardId=${boardId}`)
      if (res.ok) {
        const data = await res.json()
        setOpBoardColumns(data.columns || [])
      }
    } catch {}
    finally { setLoadingColumns(false) }
  }, [projectId])

  // Auto-load columns when metadata loads and a board is already saved
  useEffect(() => {
    if (metadataLoaded && op.targetBoardId) loadBoardColumns(op.targetBoardId)
  }, [metadataLoaded, op.targetBoardId, loadBoardColumns])

  // Load sync history
  const loadSyncRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/sync-runs`)
      if (res.ok) {
        const data = await res.json()
        setSyncRuns(data.runs || [])
      }
    } catch {}
  }, [projectId])

  useEffect(() => {
    if (provider === "openproject") loadSyncRuns()
  }, [provider, loadSyncRuns])

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleTestConnection() {
    setTesting(true); setTestResult(null); setError("")
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: op.baseUrl,
          openProjectProjectIdentifier: op.openProjectProjectIdentifier,
          apiToken: op.apiToken || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTestResult({ success: true, message: data.message || "Connected!" })
        if (data.types?.length) setOpTypes(data.types)
        if (data.statuses?.length) setOpStatuses(data.statuses)
        if (data.versions?.length) setOpVersions(data.versions)
        if (data.boards?.length) setOpBoards(data.boards)
        setMetadataLoaded(true)
        setExpandedPanels((p) => ({ ...p, types: true, statuses: true, board: true }))
        if (op.targetBoardId) loadBoardColumns(op.targetBoardId)
      } else {
        setTestResult({ success: false, message: data.error || "Connection failed" })
      }
    } catch {
      setTestResult({ success: false, message: "Network error" })
    } finally {
      setTesting(false)
    }
  }

  async function handleSaveOpenProject() {
    setSaving(true); setError(""); setSuccess("")
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...op,
          apiToken: op.apiToken || undefined,
          testCaseTypeId: op.testCaseTypeId || null,
          bugTypeId: op.bugTypeId || null,
          defaultStatusId: op.defaultStatusId || null,
          notExecutedStatusId: op.notExecutedStatusId || null,
          runningStatusId: op.runningStatusId || null,
          passedStatusId: op.passedStatusId || null,
          failedStatusId: op.failedStatusId || null,
          blockedStatusId: op.blockedStatusId || null,
          defaultParentWorkPackageId: op.defaultParentWorkPackageId || null,
          targetVersionId: op.targetVersionId || null,
          targetBoardId: op.targetBoardId || null,
          targetColumnStatusId: op.targetColumnStatusId || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess("OpenProject settings saved successfully!")
        setOp((p) => ({ ...p, hasToken: data.hasToken, apiToken: "" }))
      } else {
        setError(data.error || "Failed to save")
      }
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveLegacy() {
    setSaving(true); setError(""); setSuccess("")
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: legacy.provider, enabled: legacy.enabled,
          host: legacy.host, projectKey: legacy.projectKey,
          username: legacy.username, token: legacy.token || undefined,
          triggerOn: legacy.triggerOn,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess("Settings saved!"); setLegacy((p) => ({ ...p, hasToken: data.integration?.hasToken, token: "" }))
      } else {
        setError(data.error || "Failed to save")
      }
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  async function handleSyncTestCases() {
    setSyncing(true); setSyncResult(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/sync-test-cases`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        setSyncResult({ success: true, message: data.message || `Synced: ${data.total}` })
        loadSyncRuns()
      } else {
        setSyncResult({ success: false, message: data.error || "Sync failed" })
      }
    } catch {
      setSyncResult({ success: false, message: "Network error" })
    } finally {
      setSyncing(false)
    }
  }

  async function handleApplyParent() {
    setApplyingParent(true); setParentResult(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/apply-parent`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        setParentResult({ success: true, message: data.message })
        loadSyncRuns()
      } else {
        setParentResult({ success: false, message: data.error || "Failed" })
      }
    } catch {
      setParentResult({ success: false, message: "Network error" })
    } finally {
      setApplyingParent(false)
    }
  }

  // Create a status-column board for the bug workflow, and point bug sync at it.
  // Status columns need no id filters, so a card can only ever be in one column.
  async function handleCreateBugBoard() {
    setCreatingBugBoard(true); setBugBoardResult(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/bug-board`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setBugBoardResult({ success: false, message: data.error || "Failed to create the board" })
        return
      }
      const skipped = data.unmatched?.length
        ? ` Skipped ${data.unmatched.join(", ")} — no matching OpenProject status.`
        : ""
      setBugBoardResult({
        success: true,
        message: `Created "${data.columns.map((c: any) => c.name).join(" · ")}" and set it as this project's bug board.${skipped}`,
        url: data.url,
      })
      setOp((p) => ({ ...p, targetBoardId: String(data.boardId) }))
      loadBoardColumns(String(data.boardId))
    } catch {
      setBugBoardResult({ success: false, message: "Network error" })
    } finally {
      setCreatingBugBoard(false)
    }
  }

  async function handleSyncToBoard() {
    setSyncingBoard(true); setBoardResult(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/sync-to-board`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        setBoardResult({ success: true, message: data.message })
        loadSyncRuns()
      } else {
        setBoardResult({ success: false, message: data.error || "Failed" })
      }
    } catch {
      setBoardResult({ success: false, message: "Network error" })
    } finally {
      setSyncingBoard(false)
    }
  }

  async function handleCheckBoard() {
    setCheckingBoard(true); setBoardResult(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/check-board-visibility`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        setBoardResult({ success: true, message: `Ready: ${data.ready} · Not Ready: ${data.notReady} · Not Synced: ${data.notSynced}` })
      } else {
        setBoardResult({ success: false, message: data.error || "Check failed" })
      }
    } catch {
      setBoardResult({ success: false, message: "Network error" })
    } finally {
      setCheckingBoard(false)
    }
  }

  async function handleValidateParent() {
    setValidatingParent(true); setParentResult(null)
    if (!op.defaultParentWorkPackageId) {
      setParentResult({ success: false, message: "Enter a parent work package ID first" })
      setValidatingParent(false)
      return
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: op.baseUrl,
          openProjectProjectIdentifier: op.openProjectProjectIdentifier,
          apiToken: op.apiToken || undefined,
        }),
      })
      if (res.ok) {
        setParentResult({ success: true, message: `Parent WP #${op.defaultParentWorkPackageId} is accessible` })
      } else {
        setParentResult({ success: false, message: "Cannot validate — check connection first" })
      }
    } catch {
      setParentResult({ success: false, message: "Network error" })
    } finally {
      setValidatingParent(false)
    }
  }

  async function handleLegacyTest() {
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: legacy.provider, host: legacy.host,
          projectKey: legacy.projectKey, username: legacy.username,
          token: legacy.token || undefined,
        }),
      })
      const data = await res.json()
      setTestResult(res.ok ? { success: true, message: data.message } : { success: false, message: data.error })
    } catch {
      setTestResult({ success: false, message: "Network error" })
    } finally {
      setTesting(false)
    }
  }

  // ── Panel Header Component ─────────────────────────────────────────────────
  function PanelHeader({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) {
    return (
      <button
        type="button"
        onClick={() => togglePanel(id)}
        className="flex items-center justify-between w-full py-2.5 text-left group"
      >
        <div>
          <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">{title}</h4>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {expandedPanels[id] ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
    )
  }

  function ResultBanner({ result, variant = "default" }: { result: { success: boolean; message: string } | null; variant?: string }) {
    if (!result) return null
    const isSuccess = result.success
    return (
      <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm mt-2 ${
        isSuccess ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
                  : "bg-destructive/10 border-destructive/20 text-destructive-foreground"
      }`}>
        {isSuccess ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" /> : <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />}
        <div>
          <p className="font-semibold">{isSuccess ? "Success" : "Error"}</p>
          <p className="text-xs opacity-90 mt-0.5">{result.message}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 space-x-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        <span>Loading integrations...</span>
      </div>
    )
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <h3 className="font-semibold text-base">Project Integrations</h3>
          <p className="text-xs text-muted-foreground">
            Sync test cases, results, and bugs to external project tracking tools.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full font-medium border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400">
          <Shield className="h-3.5 w-3.5" />
          Encrypted Storage
        </div>
      </div>

      {/* Provider Selection */}
      <div className="space-y-2">
        <Label htmlFor="provider-select">Select Integration Provider</Label>
        <select
          id="provider-select"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value)
            setTestResult(null); setSyncResult(null); setError(""); setSuccess("")
          }}
          className={selectClass}
        >
          <option value="none">None / Disabled</option>
          <option value="jira">Jira Software (Cloud)</option>
          <option value="azure_devops">Azure DevOps (Boards)</option>
          <option value="openproject">OpenProject</option>
        </select>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          OPENPROJECT SECTION
          ═══════════════════════════════════════════════════════════════════════ */}
      {provider === "openproject" && (
        <div className="space-y-3 border-t pt-3">
          {/* A. Connection Panel */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4"><PanelHeader id="connection" title="🔗 Connection" subtitle="Base URL, project, and API token" /></div>
            {expandedPanels.connection && (
              <div className="px-4 pb-4 space-y-3 border-t bg-accent/5">
                <div className="grid gap-3 md:grid-cols-2 pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="op-base-url">OpenProject Base URL</Label>
                    <Input id="op-base-url" value={op.baseUrl} onChange={(e) => setOp((p) => ({ ...p, baseUrl: e.target.value }))}
                      placeholder="https://openproject.example.com" />
                    <p className="text-[11px] text-muted-foreground">Root URL only, e.g. <code className="bg-accent px-1 rounded">https://openproject.roaa.tech</code></p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="op-project-id">Project Identifier (slug)</Label>
                    <Input id="op-project-id" value={op.openProjectProjectIdentifier}
                      onChange={(e) => setOp((p) => ({ ...p, openProjectProjectIdentifier: e.target.value }))}
                      placeholder="shd" />
                    <p className="text-[11px] text-muted-foreground">The slug from <code className="bg-accent px-1 rounded">/projects/<strong>shd</strong></code></p>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="op-token">API Token</Label>
                    <Input id="op-token" type="password" value={op.apiToken}
                      onChange={(e) => setOp((p) => ({ ...p, apiToken: e.target.value }))}
                      placeholder={op.hasToken ? "•••••••••••••••• (Leave blank to keep saved)" : "Enter API token"} />
                    <p className="text-[11px] text-muted-foreground">
                      Generate from <strong>My Account → Access Tokens → API token</strong>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button type="button" variant="outline" onClick={handleTestConnection}
                    disabled={testing || !op.baseUrl || !op.openProjectProjectIdentifier}>
                    {testing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Testing...</> : "Test Connection"}
                  </Button>
                  {op.lastConnectionStatus && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      op.lastConnectionStatus === "connected"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    }`}>
                      {op.lastConnectionStatus === "connected" ? "✓ Connected" : "⚠ " + op.lastConnectionStatus}
                    </span>
                  )}
                </div>
                <ResultBanner result={testResult} />
              </div>
            )}
          </div>

          {/* B. Type Mapping Panel */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4"><PanelHeader id="types" title="📦 Work Package Type Mapping" subtitle="Map local entities to OpenProject WP types" /></div>
            {expandedPanels.types && (
              <div className="px-4 pb-4 space-y-3 border-t bg-accent/5 pt-3">
                {opTypes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Test connection first to load available types.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Test Case Type</Label>
                      <select value={op.testCaseTypeId} onChange={(e) => setOp((p) => ({ ...p, testCaseTypeId: e.target.value }))} className={selectClass}>
                        <option value="">— Select type —</option>
                        {opTypes.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Bug Type</Label>
                      <select value={op.bugTypeId} onChange={(e) => setOp((p) => ({ ...p, bugTypeId: e.target.value }))} className={selectClass}>
                        <option value="">— Select type —</option>
                        {opTypes.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* C. Status Mapping Panel */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4"><PanelHeader id="statuses" title="🎯 Status Mapping" subtitle="Map local execution statuses to OpenProject statuses" /></div>
            {expandedPanels.statuses && (
              <div className="px-4 pb-4 space-y-3 border-t bg-accent/5 pt-3">
                {opStatuses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Test connection first to load available statuses.</p>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {([
                        { key: "defaultStatusId", label: "Default (New TCs)" },
                        { key: "notExecutedStatusId", label: "Not Executed" },
                        { key: "runningStatusId", label: "Running" },
                        { key: "passedStatusId", label: "Passed" },
                        { key: "failedStatusId", label: "Failed" },
                        { key: "blockedStatusId", label: "Blocked" },
                      ] as const).map(({ key, label }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs">{label}</Label>
                          <select value={op[key]} onChange={(e) => setOp((p) => ({ ...p, [key]: e.target.value }))} className={selectClass}>
                            <option value="">— Not mapped —</option>
                            {opStatuses.map((s) => <option key={s.id} value={String(s.id)}>{s.name}{s.isClosed ? " (closed)" : ""}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-2.5">
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        💡 If no status mapping exists for a result, it will sync as a comment only — no status will be updated.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* D. Parent Mapping Panel */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4"><PanelHeader id="parent" title="🔗 Parent Work Package" subtitle="Link test cases under a parent in OpenProject" /></div>
            {expandedPanels.parent && (
              <div className="px-4 pb-4 space-y-3 border-t bg-accent/5 pt-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Parent Strategy</Label>
                    <select value={op.parentStrategy} onChange={(e) => setOp((p) => ({ ...p, parentStrategy: e.target.value }))} className={selectClass}>
                      <option value="None">No parent</option>
                      <option value="SingleParent">Single parent for all test cases</option>
                      <option value="ByModule" disabled>By Module (Phase 2)</option>
                      <option value="ByFeature" disabled>By Feature (Phase 2)</option>
                      <option value="ByRequirement" disabled>By Requirement (Phase 2)</option>
                    </select>
                  </div>
                  {op.parentStrategy !== "None" && (
                    <div className="space-y-1.5">
                      <Label>Default Parent WP ID</Label>
                      <div className="flex gap-2">
                        <Input value={op.defaultParentWorkPackageId}
                          onChange={(e) => setOp((p) => ({ ...p, defaultParentWorkPackageId: e.target.value }))}
                          placeholder="e.g. 123" className="flex-1" />
                        <Button type="button" variant="outline" size="sm" onClick={handleValidateParent} disabled={validatingParent}>
                          {validatingParent ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validate"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <ResultBanner result={parentResult} />
              </div>
            )}
          </div>

          {/* E. Board Visibility Panel */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4"><PanelHeader id="board" title="📋 Board & Version" subtitle="Select which board and sprint synced items go to" /></div>
            {expandedPanels.board && (
              <div className="px-4 pb-4 space-y-4 border-t bg-accent/5 pt-3">

                {/* Board selector */}
                <div className="space-y-1.5">
                  <Label>Target Board</Label>
                  {opBoards.length > 0 ? (
                    <select
                      value={op.targetBoardId}
                      onChange={(e) => {
                        const id = e.target.value
                        setOp((p) => ({ ...p, targetBoardId: id }))
                        setOpBoardColumns([])
                        loadBoardColumns(id)
                      }}
                      className={selectClass}
                    >
                      <option value="">— No board selected —</option>
                      {opBoards.map((b) => (
                        <option key={b.id} value={String(b.id)}>
                          {b.name}
                          {b.type ? ` (${b.type === "version" ? "Version/Sprint" : b.type === "status" ? "Status" : b.type === "assignee" ? "Assignee" : b.type})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                      {op.targetBoardId
                        ? `Board ID ${op.targetBoardId} saved — click Test Connection to reload board list`
                        : "Click Test Connection above to load available boards from OpenProject"}
                    </div>
                  )}
                </div>

                {/* Create a bug-workflow board. Status columns rather than a free
                    board: a work package holds one status, so a card can only
                    render in one column — no id filters, no duplicate cards. */}
                <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold">Bug workflow board</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Creates a board in OpenProject with one column per bug status, and points
                        this project&apos;s bug sync at it. Cards follow the bug&apos;s status, so one
                        bug can never show in two columns.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={creatingBugBoard}
                      onClick={handleCreateBugBoard}
                      className="shrink-0"
                    >
                      {creatingBugBoard ? "Creating…" : "Create board"}
                    </Button>
                  </div>
                  {bugBoardResult && (
                    <p className={`text-xs font-medium ${bugBoardResult.success ? "text-emerald-700" : "text-red-700"}`}>
                      {bugBoardResult.message}
                      {bugBoardResult.url && (
                        <>
                          {" "}
                          <a href={bugBoardResult.url} target="_blank" rel="noreferrer" className="underline">
                            Open it
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </div>

                {/* Board column selector — shown once a board is selected */}
                {op.targetBoardId && (
                  <div className="space-y-1.5">
                    <Label>Target Column <span className="text-muted-foreground font-normal">(which column to place items in)</span></Label>
                    {loadingColumns ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading columns…
                      </div>
                    ) : opBoardColumns.length > 0 ? (
                      <select
                        value={op.targetColumnStatusId}
                        onChange={(e) => setOp((p) => ({ ...p, targetColumnStatusId: e.target.value }))}
                        className={selectClass}
                      >
                        <option value="">— No column selected —</option>
                        {opBoardColumns.map((col) => (
                          <option key={col.widgetId} value={String(col.widgetId)}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                        {op.targetColumnStatusId
                          ? `Column saved — click Test Connection to reload`
                          : "Click Test Connection above to load board columns"}
                      </div>
                    )}
                    {op.targetColumnStatusId && opBoardColumns.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Synced work packages will be placed in the <strong>
                          {opBoardColumns.find(c => String(c.widgetId) === op.targetColumnStatusId)?.name || op.targetColumnStatusId}
                        </strong> column on the board.
                      </p>
                    )}
                  </div>
                )}

                {/* Version / Sprint selector */}
                <div className="space-y-1.5">
                  <Label>Sprint / Version <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  {opVersions.length > 0 ? (
                    <select
                      value={op.targetVersionId}
                      onChange={(e) => setOp((p) => ({ ...p, targetVersionId: e.target.value }))}
                      className={selectClass}
                    >
                      <option value="">— No sprint / version —</option>
                      {opVersions.map((v) => (
                        <option key={v.id} value={String(v.id)}>
                          {v.name}{v.status !== "open" ? ` (${v.status})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                      {op.targetVersionId
                        ? `Version ID ${op.targetVersionId} saved — click Test Connection to reload list`
                        : "Click Test Connection above to load versions / sprints"}
                    </div>
                  )}
                  {op.targetVersionId && (
                    <p className="text-xs text-muted-foreground">All synced work packages will be assigned to this sprint/version.</p>
                  )}
                </div>

                {/* Board strategy (advanced) */}
                <div className="space-y-1.5">
                  <Label>Board Visibility Strategy <span className="text-muted-foreground font-normal">(advanced)</span></Label>
                  <select value={op.boardStrategy} onChange={(e) => setOp((p) => ({ ...p, boardStrategy: e.target.value }))} className={selectClass}>
                    <option value="StatusBased">Status-Based</option>
                    <option value="ParentChildBased">Parent-Child</option>
                    <option value="VersionBased">Version/Sprint</option>
                  </select>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-2.5">
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    💡 Select a board to track where synced test cases and bugs should appear. For version boards, pick the sprint. Click <strong>Test Connection</strong> to populate the lists.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* F. Auto-Sync Toggles */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4"><PanelHeader id="autoSync" title="⚡ Auto-Sync Settings" subtitle="Automatic sync on test run completion" /></div>
            {expandedPanels.autoSync && (
              <div className="px-4 pb-4 space-y-3 border-t bg-accent/5 pt-3">
                {([
                  { key: "autoSyncTestCases" as const, label: "Auto-sync new test cases to OpenProject", desc: "Automatically create WPs for unsynced test cases" },
                  { key: "autoSyncResults" as const, label: "Auto-sync test run results", desc: "Post results as comments and update status after each run" },
                  { key: "autoCreateBugOnFailure" as const, label: "Auto-create bug on failed test", desc: "Automatically create a local bug report when a test fails" },
                  { key: "autoSyncBugToOpenProject" as const, label: "Auto-sync bugs to OpenProject", desc: "Create bug work packages in OpenProject for auto-created bugs" },
                ]).map(({ key, label, desc }) => (
                  <div key={key} className="flex items-start space-x-3 p-2 rounded hover:bg-accent/10">
                    <input type="checkbox" id={`op-${key}`} checked={op[key]}
                      onChange={(e) => setOp((p) => ({ ...p, [key]: e.target.checked }))}
                      className="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary" />
                    <div>
                      <Label htmlFor={`op-${key}`} className="cursor-pointer font-medium text-sm">{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* G. Actions Panel */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4"><PanelHeader id="actions" title="🚀 Sync Actions" subtitle="Manual sync operations" /></div>
            {expandedPanels.actions && (
              <div className="px-4 pb-4 space-y-3 border-t bg-accent/5 pt-3">
                <div className="flex gap-2 flex-wrap">
                  <Button type="button" onClick={handleSyncTestCases} disabled={syncing || !op.hasToken}
                    className="bg-blue-600 hover:bg-blue-700 text-white">
                    {syncing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Syncing...</> : <><CloudUpload className="h-4 w-4 mr-1.5" />Sync Test Cases</>}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleApplyParent}
                    disabled={applyingParent || !op.hasToken || op.parentStrategy === "None"}>
                    {applyingParent ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Applying...</> : <><Link2 className="h-4 w-4 mr-1.5" />Apply Parent</>}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleSyncToBoard} disabled={syncingBoard || !op.hasToken}>
                    {syncingBoard ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Syncing...</> : <><CloudUpload className="h-4 w-4 mr-1.5" />Sync to Board</>}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCheckBoard} disabled={checkingBoard || !op.hasToken}>
                    {checkingBoard ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Checking...</> : <><Eye className="h-4 w-4 mr-1.5" />Check Board Visibility</>}
                  </Button>
                </div>
                <ResultBanner result={syncResult} />
                <ResultBanner result={boardResult} />
              </div>
            )}
          </div>

          {/* H. Sync History Panel */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4"><PanelHeader id="history" title="📊 Sync History" subtitle="Recent sync operations" /></div>
            {expandedPanels.history && (
              <div className="px-4 pb-4 border-t bg-accent/5 pt-3">
                {syncRuns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No sync operations yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {syncRuns.map((run) => (
                      <div key={run.id} className="flex items-center justify-between text-xs border rounded px-3 py-2 bg-background">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${
                            run.status === "Completed" ? "bg-emerald-500" :
                            run.status === "Failed" ? "bg-red-500" :
                            run.status === "Running" ? "bg-blue-500 animate-pulse" : "bg-amber-500"
                          }`} />
                          <span className="font-medium">{run.operation}</span>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          {run.createdCount > 0 && <span className="text-emerald-600">+{run.createdCount}</span>}
                          {run.updatedCount > 0 && <span className="text-blue-600">↻{run.updatedCount}</span>}
                          {run.failedCount > 0 && <span className="text-red-600">✕{run.failedCount}</span>}
                          {run.skippedCount > 0 && <span className="text-amber-600">⊘{run.skippedCount}</span>}
                          <span>{new Date(run.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={loadSyncRuns} className="mt-2">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />Refresh
                </Button>
              </div>
            )}
          </div>

          {/* Save Button */}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
          <div className="pt-2 border-t">
            <Button onClick={handleSaveOpenProject} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving...</> : "Save OpenProject Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          LEGACY INTEGRATION (Jira / Azure DevOps)
          ═══════════════════════════════════════════════════════════════════════ */}
      {provider !== "none" && provider !== "openproject" && (
        <div className="space-y-4 pt-2 border-t border-dashed">
          <div className="flex items-center space-x-2">
            <input id="legacy-enable" type="checkbox" checked={legacy.enabled}
              onChange={(e) => setLegacy((p) => ({ ...p, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
            <Label htmlFor="legacy-enable" className="cursor-pointer font-medium">Enable this integration</Label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{provider === "jira" ? "Jira Domain / Host URL" : "Azure DevOps Organization"}</Label>
              <Input value={legacy.host} onChange={(e) => setLegacy((p) => ({ ...p, host: e.target.value }))}
                placeholder={provider === "jira" ? "your-subdomain.atlassian.net" : "dev.azure.com/your-org"} />
            </div>
            <div className="space-y-2">
              <Label>{provider === "jira" ? "Project Key" : "Project Name / Key"}</Label>
              <Input value={legacy.projectKey} onChange={(e) => setLegacy((p) => ({ ...p, projectKey: e.target.value }))}
                placeholder={provider === "jira" ? "PROJ" : "MyProject"} />
            </div>
            {provider === "jira" && (
              <div className="space-y-2">
                <Label>Atlassian Account Email</Label>
                <Input value={legacy.username} onChange={(e) => setLegacy((p) => ({ ...p, username: e.target.value }))} placeholder="qa-team@example.com" />
              </div>
            )}
            <div className="space-y-2">
              <Label>{provider === "jira" ? "API Token" : "Personal Access Token (PAT)"}</Label>
              <Input type="password" value={legacy.token} onChange={(e) => setLegacy((p) => ({ ...p, token: e.target.value }))}
                placeholder={legacy.hasToken ? "•••••••••••••• (Leave blank to keep)" : "Enter token"} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Trigger On</Label>
              <select value={legacy.triggerOn} onChange={(e) => setLegacy((p) => ({ ...p, triggerOn: e.target.value }))} className={selectClass}>
                <option value="Failed">Failed test runs only</option>
                <option value="All">All test runs</option>
              </select>
            </div>
          </div>
          <ResultBanner result={testResult} />
          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="outline" onClick={handleLegacyTest} disabled={testing || !legacy.host || !legacy.projectKey}>
              {testing ? "Testing..." : "Test Connection"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
          <div className="pt-2 border-t">
            <Button onClick={handleSaveLegacy} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
