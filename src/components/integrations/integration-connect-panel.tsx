"use client"

/**
 * IntegrationConnectPanel — provider-agnostic connect + mapping UI backed by the
 * unified ProjectIntegration model. Users pick their tool (Jira / Azure DevOps /
 * ClickUp / OpenProject); every label is resolved from the chosen provider, so
 * the whole panel reads as "Sync to Jira", "ClickUp List ID", etc.
 */
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, AlertCircle, Loader2, Plug, RefreshCw, Copy } from "lucide-react"
import { ALL_PROVIDERS, providerLabels } from "@/lib/integrations/labels"
import type { ProviderId } from "@/lib/integrations/core/types"

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"

interface MetaType { id: string; name: string }
interface MetaStatus { id: string; name: string; isClosed: boolean; isDefault: boolean }
interface MetaBoard { id: string; name: string; type: string }

interface TestResult {
  success: boolean
  message: string
  projectName?: string
  types?: MetaType[]
  statuses?: MetaStatus[]
  boards?: MetaBoard[]
}

export function IntegrationConnectPanel({ projectId }: { projectId: string }) {
  const [provider, setProvider] = useState<ProviderId>("Jira")
  const [baseUrl, setBaseUrl] = useState("")
  const [username, setUsername] = useState("")
  const [externalProjectKey, setExternalProjectKey] = useState("")
  const [apiToken, setApiToken] = useState("")
  const [hasToken, setHasToken] = useState(false)

  const [bugTypeId, setBugTypeId] = useState("")
  const [passedStatusId, setPassedStatusId] = useState("")
  const [failedStatusId, setFailedStatusId] = useState("")
  const [blockedStatusId, setBlockedStatusId] = useState("")
  const [boardId, setBoardId] = useState("")

  const [autoSyncResults, setAutoSyncResults] = useState(true)
  const [autoCreateBugOnFailure, setAutoCreateBugOnFailure] = useState(true)
  const [autoSyncBugToTracker, setAutoSyncBugToTracker] = useState(false)
  const [inboundSyncEnabled, setInboundSyncEnabled] = useState(false)
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null)

  const [meta, setMeta] = useState<TestResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null)

  const labels = providerLabels(provider)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/config`)
      const data = await res.json()
      const i = data.integration
      if (i) {
        setProvider(i.provider)
        setBaseUrl(i.baseUrl || "")
        setUsername(i.username || "")
        setExternalProjectKey(i.externalProjectKey || "")
        setHasToken(!!i.hasToken)
        setBugTypeId(i.typeMapping?.bug || "")
        setPassedStatusId(i.statusMapping?.passed || "")
        setFailedStatusId(i.statusMapping?.failed || "")
        setBlockedStatusId(i.statusMapping?.blocked || "")
        setBoardId(i.boardConfig?.boardId || "")
        setAutoSyncResults(i.autoSyncResults ?? true)
        setAutoCreateBugOnFailure(i.autoCreateBugOnFailure ?? true)
        setAutoSyncBugToTracker(i.autoSyncBugToTracker ?? false)
        setInboundSyncEnabled(i.inboundSyncEnabled ?? false)
        setWebhookSecret(i.webhookSecret || null)
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const body = () => ({
    provider,
    baseUrl,
    username: labels.needsUsername ? username : null,
    externalProjectKey,
    apiToken: apiToken || undefined,
  })

  const test = async () => {
    setTesting(true)
    setBanner(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/config/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body()),
      })
      const data: TestResult & { error?: string } = await res.json()
      if (data.error) {
        setBanner({ ok: false, msg: data.error })
        setMeta(null)
      } else {
        setMeta(data)
        setBanner({ ok: data.success, msg: data.message })
      }
    } catch (err: any) {
      setBanner({ ok: false, msg: err?.message || "Test failed" })
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setBanner(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body(),
          typeMapping: { bug: bugTypeId || null },
          statusMapping: { passed: passedStatusId || null, failed: failedStatusId || null, blocked: blockedStatusId || null },
          boardConfig: { boardId: boardId || null },
          autoSyncResults,
          autoCreateBugOnFailure,
          autoSyncBugToTracker,
          inboundSyncEnabled,
        }),
      })
      const data = await res.json()
      if (data.error) setBanner({ ok: false, msg: data.error })
      else {
        setBanner({ ok: true, msg: data.message || "Saved" })
        setApiToken("")
        await load()
      }
    } catch (err: any) {
      setBanner({ ok: false, msg: err?.message || "Save failed" })
    } finally {
      setSaving(false)
    }
  }

  const webhookUrl =
    typeof window !== "undefined" && inboundSyncEnabled && webhookSecret
      ? `${window.location.origin}/api/integrations/webhooks/${provider}?projectId=${projectId}&secret=${webhookSecret}`
      : null

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading integration…
      </div>
    )
  }

  const types = meta?.types || []
  const statuses = meta?.statuses || []
  const boards = meta?.boards || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Connect a project-management tool</h3>
      </div>

      {/* Provider picker */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ALL_PROVIDERS.map(({ id, labels: l }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setProvider(id); setMeta(null); setBanner(null) }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              provider === id ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      {/* Connection fields (labels resolved from the chosen provider) */}
      <div className="grid gap-4 sm:grid-cols-2">
        {labels.baseUrlLabel && (
          <div className="space-y-1">
            <Label>{labels.baseUrlLabel}</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={labels.baseUrlLabel} />
          </div>
        )}
        <div className="space-y-1">
          <Label>{labels.projectKeyLabel}</Label>
          <Input value={externalProjectKey} onChange={(e) => setExternalProjectKey(e.target.value)} placeholder={labels.projectKeyLabel} />
        </div>
        {labels.needsUsername && (
          <div className="space-y-1">
            <Label>Account email</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="you@company.com" />
          </div>
        )}
        <div className="space-y-1">
          <Label>{labels.tokenLabel}</Label>
          <Input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={hasToken ? "•••••••• (saved — leave blank to keep)" : labels.tokenLabel}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={test} disabled={testing || !externalProjectKey}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Test {labels.name} connection
        </Button>
        <Button onClick={save} disabled={saving || !externalProjectKey}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Save {labels.name} settings
        </Button>
      </div>

      {banner && (
        <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${banner.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {banner.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertCircle className="h-4 w-4 mt-0.5" />}
          <span>{banner.msg}</span>
        </div>
      )}

      {/* Mapping — populated by a successful Test */}
      {meta?.success && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Map to {labels.name}{meta.projectName ? ` · ${meta.projectName}` : ""}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Bug {labels.itemNoun} type</Label>
              <select className={selectClass} value={bugTypeId} onChange={(e) => setBugTypeId(e.target.value)}>
                <option value="">Auto-detect</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Board (optional)</Label>
              <select className={selectClass} value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                <option value="">None</option>
                {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Passed → status</Label>
              <select className={selectClass} value={passedStatusId} onChange={(e) => setPassedStatusId(e.target.value)}>
                <option value="">—</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Failed → status</Label>
              <select className={selectClass} value={failedStatusId} onChange={(e) => setFailedStatusId(e.target.value)}>
                <option value="">—</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Blocked → status</Label>
              <select className={selectClass} value={blockedStatusId} onChange={(e) => setBlockedStatusId(e.target.value)}>
                <option value="">—</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Automation toggles */}
      <div className="space-y-2 rounded-lg border p-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Automation</p>
        {[
          { label: `Sync test results to ${labels.name}`, val: autoSyncResults, set: setAutoSyncResults },
          { label: "Auto-create bug on failure", val: autoCreateBugOnFailure, set: setAutoCreateBugOnFailure },
          { label: `Auto-sync bugs to ${labels.name}`, val: autoSyncBugToTracker, set: setAutoSyncBugToTracker },
          { label: `Two-way sync (pull ${labels.name} changes back)`, val: inboundSyncEnabled, set: setInboundSyncEnabled },
        ].map((t) => (
          <label key={t.label} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={t.val} onChange={(e) => t.set(e.target.checked)} />
            {t.label}
          </label>
        ))}
      </div>

      {/* Webhook endpoint for two-way sync */}
      {webhookUrl && (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Webhook endpoint</p>
          <p className="text-xs text-muted-foreground">
            Register this URL in {labels.name} to push changes back into the app instantly.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{webhookUrl}</code>
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(webhookUrl)}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
