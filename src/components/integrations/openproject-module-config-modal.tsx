"use client"

import { useState, useEffect, useCallback } from "react"
import {
  X, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, ChevronDown, ChevronRight, LayoutDashboard
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface OpType { id: number; name: string }
interface OpStatus { id: number; name: string; isDefault: boolean; isClosed: boolean }
interface OpVersion { id: number; name: string; status: string }
interface OpBoard { id: number; name: string; type: string }
interface OpBoardColumn { widgetId: number; name: string; queryId: string | null; columnType: string; attributeId: string | null }

interface ModuleConfig {
  baseUrl: string | null
  openProjectProjectIdentifier: string | null
  hasOwnToken: boolean
  testCaseTypeId: string | null
  passedStatusId: string | null
  failedStatusId: string | null
  blockedStatusId: string | null
  defaultStatusId: string | null
  targetBoardId: string | null
  targetColumnStatusId: string | null
  targetBoardType: string | null
  targetVersionId: string | null
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncError: string | null
}

interface EffectiveConfig {
  baseUrl: string | null
  openProjectProjectIdentifier: string | null
  hasToken: boolean
  testCaseTypeId: string | null
  passedStatusId: string | null
  failedStatusId: string | null
  blockedStatusId: string | null
  defaultStatusId: string | null
}

interface Props {
  projectId: string
  moduleId: string
  moduleName: string
  onClose: () => void
  onSaved: () => void
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"

const BOARD_TYPE_LABELS: Record<string, string> = {
  status: "Status board",
  version: "Version/Sprint board",
  assignee: "Assignee board",
  basic: "Basic board",
}

export function OpenProjectModuleConfigModal({ projectId, moduleId, moduleName, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const [config, setConfig] = useState<ModuleConfig | null>(null)
  const [effective, setEffective] = useState<EffectiveConfig | null>(null)
  const [projectHasIntegration, setProjectHasIntegration] = useState(false)

  // Form state — connection
  const [baseUrl, setBaseUrl] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [apiToken, setApiToken] = useState("")
  const [showToken, setShowToken] = useState(false)

  // Form state — type/status mapping
  const [testCaseTypeId, setTestCaseTypeId] = useState("")
  const [passedStatusId, setPassedStatusId] = useState("")
  const [failedStatusId, setFailedStatusId] = useState("")
  const [blockedStatusId, setBlockedStatusId] = useState("")
  const [defaultStatusId, setDefaultStatusId] = useState("")

  // Form state — board & version
  const [targetBoardId, setTargetBoardId] = useState("")
  const [targetColumnStatusId, setTargetColumnStatusId] = useState("")
  const [targetVersionId, setTargetVersionId] = useState("")

  // Metadata from OpenProject (populated after Test Connection)
  const [types, setTypes] = useState<OpType[]>([])
  const [statuses, setStatuses] = useState<OpStatus[]>([])
  const [versions, setVersions] = useState<OpVersion[]>([])
  const [boards, setBoards] = useState<OpBoard[]>([])
  const [boardColumns, setBoardColumns] = useState<OpBoardColumn[]>([])
  const [loadingColumns, setLoadingColumns] = useState(false)

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showBoardSection, setShowBoardSection] = useState(false)

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/features/${moduleId}/config`)
      const data = await res.json()
      setConfig(data.config)
      setEffective(data.effective)
      setProjectHasIntegration(data.projectHasIntegration)

      const cfg: ModuleConfig = data.config || {}
      setBaseUrl(cfg.baseUrl || "")
      setIdentifier(cfg.openProjectProjectIdentifier || "")
      setTestCaseTypeId(cfg.testCaseTypeId || "")
      setPassedStatusId(cfg.passedStatusId || "")
      setFailedStatusId(cfg.failedStatusId || "")
      setBlockedStatusId(cfg.blockedStatusId || "")
      setDefaultStatusId(cfg.defaultStatusId || "")
      setTargetBoardId(cfg.targetBoardId || "")
      setTargetColumnStatusId(cfg.targetColumnStatusId || "")
      setTargetVersionId(cfg.targetVersionId || "")

      // Auto-expand board section if a board is already selected
      if (cfg.targetBoardId || cfg.targetVersionId) setShowBoardSection(true)
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId, moduleId])

  useEffect(() => { load() }, [load])

  // Auto-load OpenProject metadata (boards, types, statuses, versions) when the
  // modal opens so the dropdowns are populated without the user first having to
  // click "Test Connection". Uses the module's test-connection endpoint (empty
  // body → server resolves saved module override → project-level creds and
  // normalizes the identifier), which is the same path the button uses. Silent:
  // it never surfaces a success/error banner. No-ops if creds aren't configured.
  const loadMetadata = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/integrations/openproject/features/${moduleId}/test-connection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      )
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data.types) && data.types.length) setTypes(data.types)
      if (Array.isArray(data.statuses) && data.statuses.length) setStatuses(data.statuses)
      if (Array.isArray(data.versions) && data.versions.length) setVersions(data.versions)
      if (Array.isArray(data.boards) && data.boards.length) {
        setBoards(data.boards)
        setShowBoardSection(true)
      }
    } catch { /* non-critical — Test Connection remains as a manual fallback */ }
  }, [projectId, moduleId])

  useEffect(() => { loadMetadata() }, [loadMetadata])

  const loadBoardColumns = useCallback(async (boardId: string) => {
    if (!boardId) { setBoardColumns([]); return }
    setLoadingColumns(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/openproject/board-columns?boardId=${boardId}`)
      if (res.ok) {
        const data = await res.json()
        setBoardColumns(data.columns || [])
      }
    } catch {}
    finally { setLoadingColumns(false) }
  }, [projectId])

  // When config loads with a saved board, fetch its columns
  useEffect(() => {
    if (config?.targetBoardId) loadBoardColumns(config.targetBoardId)
  }, [config?.targetBoardId, loadBoardColumns])

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/integrations/openproject/features/${moduleId}/test-connection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: baseUrl || undefined,
            openProjectProjectIdentifier: identifier || undefined,
            apiToken: apiToken || undefined,
          }),
        }
      )
      const data = await res.json()
      setTestResult({ success: data.success, message: data.message })
      if (data.types?.length) setTypes(data.types)
      if (data.statuses?.length) setStatuses(data.statuses)
      if (data.versions?.length) setVersions(data.versions)
      if (data.boards?.length) {
        setBoards(data.boards)
        setShowBoardSection(true)
        if (targetBoardId) loadBoardColumns(targetBoardId)
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Connection test failed" })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      const payload: Record<string, any> = {}
      payload.baseUrl = baseUrl.trim() || null
      payload.openProjectProjectIdentifier = identifier.trim() || null
      if (apiToken.trim()) payload.apiToken = apiToken.trim()
      else if (!config?.hasOwnToken) payload.apiToken = null

      payload.testCaseTypeId = testCaseTypeId || null
      payload.passedStatusId = passedStatusId || null
      payload.failedStatusId = failedStatusId || null
      payload.blockedStatusId = blockedStatusId || null
      payload.defaultStatusId = defaultStatusId || null

      // Board & version
      const selectedBoard = boards.find(b => String(b.id) === targetBoardId)
      payload.targetBoardId = targetBoardId || null
      payload.targetBoardType = selectedBoard?.type || (targetBoardId ? config?.targetBoardType : null) || null
      payload.targetColumnStatusId = targetColumnStatusId || null
      payload.targetVersionId = targetVersionId || null

      const res = await fetch(
        `/api/projects/${projectId}/integrations/openproject/features/${moduleId}/config`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error || "Failed to save")
      } else {
        setSaveOk(true)
        await load()
        onSaved()
      }
    } catch (err: any) {
      setSaveError(err.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const canTestConnection = !!(
    (baseUrl || effective?.baseUrl) &&
    (identifier || effective?.openProjectProjectIdentifier) &&
    (apiToken || config?.hasOwnToken || effective?.hasToken)
  )

  // Derive selected board type for showing version picker
  const selectedBoardType =
    boards.find(b => String(b.id) === targetBoardId)?.type ||
    (targetBoardId === config?.targetBoardId ? config?.targetBoardType : null) ||
    null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-base">OpenProject Config</h2>
            <p className="text-xs text-muted-foreground mt-0.5" dir="auto">{moduleName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Inheritance notice */}
            {projectHasIntegration && (
              <div className="text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-blue-50/50 dark:bg-blue-950/20 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                <span>Fields left blank will inherit from the project-level OpenProject config.</span>
              </div>
            )}

            {/* Base URL */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Base URL
                {effective?.baseUrl && !baseUrl && (
                  <span className="ml-1.5 text-muted-foreground font-normal">(inherited: {effective.baseUrl})</span>
                )}
              </Label>
              <Input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder={effective?.baseUrl || "https://openproject.yourcompany.com"}
                className="h-9 text-sm"
              />
            </div>

            {/* Project Identifier */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Project Identifier
                {effective?.openProjectProjectIdentifier && !identifier && (
                  <span className="ml-1.5 text-muted-foreground font-normal">(inherited: {effective.openProjectProjectIdentifier})</span>
                )}
              </Label>
              <Input
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder={effective?.openProjectProjectIdentifier || "my-project-slug"}
                className="h-9 text-sm"
              />
            </div>

            {/* API Token */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                API Token
                {!config?.hasOwnToken && effective?.hasToken && (
                  <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-normal">(inherited from project)</span>
                )}
                {config?.hasOwnToken && (
                  <span className="ml-1.5 text-muted-foreground font-normal">(own token saved)</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={apiToken}
                  onChange={e => setApiToken(e.target.value)}
                  placeholder={config?.hasOwnToken ? "Enter new token to replace" : effective?.hasToken ? "Leave blank to keep project token" : "Your OpenProject API token"}
                  className="h-9 text-sm pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Test Connection */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testing || !canTestConnection}
                className="h-8 text-xs font-semibold"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {testing ? "Testing..." : "Test Connection"}
              </Button>
              {testing && (
                <p className="text-[11px] text-muted-foreground">Loading boards, versions, types &amp; statuses…</p>
              )}

              {testResult && (
                <div className={`text-xs rounded-lg px-3 py-2 border flex items-start gap-2 ${
                  testResult.success
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
                    : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400"
                }`}>
                  {testResult.success
                    ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            {/* ── Board & Version Selection ─────────────────────────────── */}
            <div>
              <button
                onClick={() => setShowBoardSection(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-2"
              >
                {showBoardSection ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <LayoutDashboard className="h-3.5 w-3.5" />
                Board & Version
                {targetBoardId && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-normal">
                    (board selected)
                  </span>
                )}
                {!targetBoardId && boards.length === 0 && (
                  <span className="text-muted-foreground font-normal">(test connection to load boards)</span>
                )}
              </button>

              {showBoardSection && (
                <div className="space-y-3 border rounded-lg p-4 bg-accent/5">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Select the OpenProject board where synced test cases will appear.
                    For <strong>Version/Sprint</strong> boards, also select the sprint below.
                    Click <em>Test Connection</em> first to load available boards.
                  </p>

                  {/* Board selector */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Target Board</Label>
                    {boards.length > 0 ? (
                      <select
                        value={targetBoardId}
                        onChange={e => {
                          const id = e.target.value
                          setTargetBoardId(id)
                          setBoardColumns([])
                          loadBoardColumns(id)
                          if (id && targetBoardId !== id) setTargetVersionId("")
                        }}
                        className={selectClass}
                      >
                        <option value="">— no board selected —</option>
                        {boards.map(b => (
                          <option key={b.id} value={String(b.id)}>
                            {b.name}
                            {b.type ? ` (${BOARD_TYPE_LABELS[b.type] || b.type})` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-muted/30">
                        {config?.targetBoardId
                          ? `Board ID ${config.targetBoardId} saved (${config.targetBoardType || "unknown type"}) — test connection to reload list`
                          : "No boards loaded. Click Test Connection to fetch boards from OpenProject."}
                      </div>
                    )}
                  </div>

                  {/* Board column selector */}
                  {targetBoardId && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Target Column <span className="text-muted-foreground font-normal">(which column to place items in)</span></Label>
                      {loadingColumns ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-muted/30">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading columns…
                        </div>
                      ) : boardColumns.length > 0 ? (
                        <select
                          value={targetColumnStatusId}
                          onChange={e => setTargetColumnStatusId(e.target.value)}
                          className={selectClass}
                        >
                          <option value="">— no column selected —</option>
                          {boardColumns.map(col => (
                            <option key={col.widgetId} value={String(col.widgetId)}>
                              {col.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-muted/30">
                          {targetColumnStatusId
                            ? `Column saved — click Test Connection to reload`
                            : "Click Test Connection to load board columns"}
                        </div>
                      )}
                      {targetColumnStatusId && boardColumns.length > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Synced work packages will be placed in the <strong>
                            {boardColumns.find(c => String(c.widgetId) === targetColumnStatusId)?.name || targetColumnStatusId}
                          </strong> column on sync.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Version / Sprint selector — shown for version boards or when versions are loaded */}
                  {(selectedBoardType === "version" || versions.length > 0 || targetVersionId) && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">
                        Sprint / Version
                        {selectedBoardType !== "version" && (
                          <span className="ml-1 text-muted-foreground font-normal">(optional)</span>
                        )}
                      </Label>
                      {versions.length > 0 ? (
                        <select
                          value={targetVersionId}
                          onChange={e => setTargetVersionId(e.target.value)}
                          className={selectClass}
                        >
                          <option value="">— no version / sprint —</option>
                          {versions.map(v => (
                            <option key={v.id} value={String(v.id)}>
                              {v.name}
                              {v.status !== "open" ? ` (${v.status})` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={targetVersionId}
                          onChange={e => setTargetVersionId(e.target.value)}
                          placeholder="Version / Sprint ID (test connection to load list)"
                          className="h-9 text-sm"
                        />
                      )}
                      {targetVersionId && (
                        <p className="text-[11px] text-muted-foreground">
                          All synced work packages will be assigned to this sprint/version.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Type & Status Mapping ────────────────────────────────── */}
            <div>
              <button
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-2"
              >
                {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Type & Status Mapping
                {testResult?.success && types.length > 0 && !showAdvanced && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-normal">(loaded from OpenProject)</span>
                )}
              </button>

              {showAdvanced && (
                <div className="space-y-3 border rounded-lg p-4 bg-accent/5">
                  {/* Test Case Type */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">
                      Test Case Type
                      {effective?.testCaseTypeId && !testCaseTypeId && (
                        <span className="ml-1 text-muted-foreground font-normal">(inherited)</span>
                      )}
                    </Label>
                    {types.length > 0 ? (
                      <select
                        value={testCaseTypeId}
                        onChange={e => setTestCaseTypeId(e.target.value)}
                        className={selectClass}
                      >
                        <option value="">— inherit from project —</option>
                        {types.map(t => (
                          <option key={t.id} value={String(t.id)}>{t.name}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={testCaseTypeId}
                        onChange={e => setTestCaseTypeId(e.target.value)}
                        placeholder="Type ID (test connection to load options)"
                        className="h-9 text-sm"
                      />
                    )}
                  </div>

                  {/* Status mappings */}
                  {(["passedStatusId", "failedStatusId", "blockedStatusId", "defaultStatusId"] as const).map(field => {
                    const labels: Record<string, string> = {
                      passedStatusId: "Passed → OP Status",
                      failedStatusId: "Failed → OP Status",
                      blockedStatusId: "Blocked → OP Status",
                      defaultStatusId: "Not Executed → OP Status",
                    }
                    const vals: Record<string, string> = {
                      passedStatusId,
                      failedStatusId,
                      blockedStatusId,
                      defaultStatusId,
                    }
                    const setters: Record<string, (v: string) => void> = {
                      passedStatusId: setPassedStatusId,
                      failedStatusId: setFailedStatusId,
                      blockedStatusId: setBlockedStatusId,
                      defaultStatusId: setDefaultStatusId,
                    }
                    return (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs font-semibold">
                          {labels[field]}
                          {(effective as any)?.[field] && !vals[field] && (
                            <span className="ml-1 text-muted-foreground font-normal">(inherited)</span>
                          )}
                        </Label>
                        {statuses.length > 0 ? (
                          <select
                            value={vals[field]}
                            onChange={e => setters[field](e.target.value)}
                            className={selectClass}
                          >
                            <option value="">— inherit from project —</option>
                            {statuses.map(s => (
                              <option key={s.id} value={String(s.id)}>{s.name}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            value={vals[field]}
                            onChange={e => setters[field](e.target.value)}
                            placeholder="Status ID (test connection to load)"
                            className="h-9 text-sm"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Last sync info */}
            {config?.lastSyncAt && (
              <div className={`text-xs border rounded-lg px-3 py-2 flex items-start gap-2 ${
                config.lastSyncStatus === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300"
                  : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400"
              }`}>
                {config.lastSyncStatus === "success"
                  ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                <div>
                  <span className="font-semibold">Last sync: {config.lastSyncStatus}</span>
                  <span className="ml-1 text-[10px] opacity-70">{new Date(config.lastSyncAt).toLocaleString()}</span>
                  {config.lastSyncError && <div className="mt-0.5 text-[10px]">{config.lastSyncError}</div>}
                </div>
              </div>
            )}

            {/* Save feedback */}
            {saveError && (
              <div className="text-xs bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {saveError}
              </div>
            )}
            {saveOk && (
              <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300 rounded-lg px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Settings saved for this module.
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-1 border-t">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className="h-8 px-4 text-xs font-semibold"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {saving ? "Saving..." : "Save Feature Config"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
