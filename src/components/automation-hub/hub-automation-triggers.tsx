"use client"
/**
 * Runs that start without someone pressing Run:
 *   - Schedules — "every weekday at 02:00, run the regression folder"
 *   - CI tokens — a pipeline starts a run and polls its status
 */
import { useCallback, useEffect, useState } from "react"
import { CalendarClock, Check, Copy, KeyRound, Loader2, Play, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"

interface Schedule {
  id: string
  name: string
  scope: { folder?: string; tag?: string; scriptIds?: string[] }
  browser: string
  environment?: string | null
  frequency: "daily" | "weekdays" | "hourly"
  timeOfDay: string | null
  everyHours: number | null
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  lastStatus: string | null
}

interface Token {
  id: string
  name: string
  prefix: string
  createdByName: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || "Request failed")
  return d
}

const describe = (s: Schedule) =>
  s.frequency === "hourly"
    ? `Every ${s.everyHours} hour${s.everyHours === 1 ? "" : "s"}`
    : `${s.frequency === "weekdays" ? "Weekdays" : "Every day"} at ${s.timeOfDay}`

const scopeLabel = (s: Schedule["scope"]) =>
  s.folder ? `Folder “${s.folder}”` : s.tag ? `Tag “${s.tag}”` : s.scriptIds?.length ? `${s.scriptIds.length} tests` : "All tests"

export default function HubAutomationTriggers({ projectId, onRunStarted }: { projectId: string; onRunStarted?: () => void }) {
  const [schedules, setSchedules] = useState<Schedule[] | null>(null)
  const [tokens, setTokens] = useState<Token[]>([])
  const [canManageTokens, setCanManageTokens] = useState(false)
  const [folders, setFolders] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [form, setForm] = useState<{
    name: string
    frequency: Schedule["frequency"]
    timeOfDay: string
    everyHours: number
    scopeKind: "all" | "folder" | "tag"
    scopeValue: string
    browser: string
    environment: string
  } | null>(null)
  const [newTokenName, setNewTokenName] = useState("")
  const [shownToken, setShownToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState<{ kind: "schedule" | "token"; id: string; name: string } | null>(null)

  const load = useCallback(async () => {
    const [s, t, scripts] = await Promise.all([
      fetch(`/api/hub/schedules?projectId=${projectId}`).then((r) => r.json()),
      fetch(`/api/hub/ci-tokens?projectId=${projectId}`).then((r) => r.json()),
      fetch(`/api/hub/scripts?projectId=${projectId}`).then((r) => r.json()),
    ])
    setSchedules(s.schedules ?? [])
    setTokens(t.tokens ?? [])
    setCanManageTokens(!!t.canManage)
    const list: { folder: string; tags: string[] }[] = scripts.scripts ?? []
    setFolders([...new Set(list.map((x) => x.folder).filter(Boolean))].sort())
    setTags([...new Set(list.flatMap((x) => x.tags ?? []))].sort())
  }, [projectId])

  useEffect(() => {
    load().catch(() => setSchedules([]))
  }, [load])

  async function saveSchedule() {
    if (!form) return
    try {
      await send("/api/hub/schedules", "POST", {
        projectId,
        name: form.name,
        frequency: form.frequency,
        timeOfDay: form.timeOfDay,
        everyHours: form.everyHours,
        browser: form.browser,
        environment: form.environment || null,
        scope: form.scopeKind === "folder" ? { folder: form.scopeValue } : form.scopeKind === "tag" ? { tag: form.scopeValue } : {},
      })
      toast.success("Schedule created")
      setForm(null)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function act(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn()
      if (ok) toast.success(ok)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function createToken() {
    try {
      const d = await send("/api/hub/ci-tokens", "POST", { projectId, name: newTokenName })
      setShownToken(d.token.value)
      setNewTokenName("")
      setCopied(false)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-qa-engine"

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Schedules */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Schedules</h3>
          <button
            onClick={() =>
              setForm({ name: "", frequency: "weekdays", timeOfDay: "02:00", everyHours: 4, scopeKind: "all", scopeValue: "", browser: "Headless", environment: "" })
            }
            className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Times use the server&apos;s clock. A schedule skips a slot if its previous run is still going. When a scheduled run finishes, everyone in
          the project gets a notification with the result.
        </p>

        {form && (
          <div className="mb-3 space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Name, e.g. Nightly regression"
              className="h-8 w-full rounded-md border bg-card px-2.5 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as Schedule["frequency"] })}
                className="h-8 rounded-md border bg-card px-2 text-sm"
              >
                <option value="weekdays">Weekdays</option>
                <option value="daily">Every day</option>
                <option value="hourly">Every N hours</option>
              </select>
              {form.frequency === "hourly" ? (
                <label className="flex items-center gap-1 text-xs">
                  every
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={form.everyHours}
                    onChange={(e) => setForm({ ...form, everyHours: Number(e.target.value) })}
                    className="h-8 w-16 rounded-md border bg-card px-2 text-sm"
                  />
                  hours
                </label>
              ) : (
                <label className="flex items-center gap-1 text-xs">
                  at
                  <input
                    type="time"
                    value={form.timeOfDay}
                    onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })}
                    className="h-8 rounded-md border bg-card px-2 text-sm"
                  />
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={form.scopeKind}
                onChange={(e) => setForm({ ...form, scopeKind: e.target.value as "all" | "folder" | "tag", scopeValue: "" })}
                className="h-8 rounded-md border bg-card px-2 text-sm"
              >
                <option value="all">All tests</option>
                <option value="folder">A folder</option>
                <option value="tag">A tag</option>
              </select>
              {form.scopeKind !== "all" && (
                <select
                  value={form.scopeValue}
                  onChange={(e) => setForm({ ...form, scopeValue: e.target.value })}
                  className="h-8 rounded-md border bg-card px-2 text-sm"
                >
                  <option value="">Choose…</option>
                  {(form.scopeKind === "folder" ? folders : tags).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
              <select value={form.browser} onChange={(e) => setForm({ ...form, browser: e.target.value })} className="h-8 rounded-md border bg-card px-2 text-sm">
                {["Headless", "Chrome", "Firefox", "Edge", "Safari"].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
              <select
                value={form.environment}
                onChange={(e) => setForm({ ...form, environment: e.target.value })}
                aria-label="Environment"
                className="h-8 rounded-md border bg-card px-2 text-sm"
              >
                <option value="">No environment</option>
                {["Dev", "Staging", "UAT", "Production"].map((env) => (
                  <option key={env}>{env}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="rounded-md border px-3 py-1 text-xs font-medium">
                Cancel
              </button>
              <button
                onClick={saveSchedule}
                disabled={!form.name.trim() || (form.scopeKind !== "all" && !form.scopeValue)}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
              >
                Create schedule
              </button>
            </div>
          </div>
        )}

        {schedules === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : schedules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No schedules yet — add a nightly regression run.</p>
        ) : (
          <ul className="space-y-1.5">
            {schedules.map((s) => (
              <li key={s.id} className={cn("rounded-lg border px-3 py-2 text-xs", !s.enabled && "opacity-60")}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{s.name}</span>
                  {s.lastStatus && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        s.lastStatus === "Passed" && "bg-emerald-50 text-emerald-700",
                        s.lastStatus === "Failed" && "bg-rose-50 text-rose-700",
                        (s.lastStatus === "Running" || s.lastStatus === "Cancelled") && "bg-muted text-muted-foreground"
                      )}
                    >
                      last: {s.lastStatus}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => act(() => send(`/api/hub/schedules/${s.id}`, "PATCH", { runNow: true }).then(() => onRunStarted?.()), "Started")}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Run now"
                      aria-label={`Run ${s.name} now`}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground" title={s.enabled ? "Pause" : "Resume"}>
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={() => act(() => send(`/api/hub/schedules/${s.id}`, "PATCH", { enabled: !s.enabled }))}
                      />
                      On
                    </label>
                    <button
                      onClick={() => setPending({ kind: "schedule", id: s.id, name: s.name })}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-700"
                      aria-label={`Delete ${s.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  {describe(s)} · {scopeLabel(s.scope)} · {s.browser}
                  {s.environment ? ` · ${s.environment}` : ""}
                  {s.enabled && s.nextRunAt ? ` · next ${new Date(s.nextRunAt).toLocaleString()}` : " · paused"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* CI */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Run from CI</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          A pipeline starts a run with a project token, then polls until it finishes. Store the token as a CI secret.
        </p>

        {canManageTokens ? (
          <div className="mb-3 flex gap-2">
            <input
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder="Token name, e.g. GitHub Actions"
              className="h-8 flex-1 rounded-md border bg-card px-2.5 text-sm"
            />
            <button
              onClick={createToken}
              disabled={!newTokenName.trim()}
              className="rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              Create token
            </button>
          </div>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">Project Owners and Admins can create tokens.</p>
        )}

        {shownToken && (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
            <p className="font-medium text-amber-800 dark:text-amber-300">Copy this token now — it won&apos;t be shown again.</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-card px-2 py-1 font-mono">{shownToken}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shownToken).then(() => setCopied(true))
                }}
                className="inline-flex items-center gap-1 rounded border bg-card px-2 py-1"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {tokens.length > 0 && (
          <ul className="mb-3 space-y-1">
            {tokens.map((t) => (
              <li key={t.id} className={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs", t.revokedAt && "opacity-50")}>
                <code className="font-mono">{t.prefix}…</code>
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground">
                  {t.revokedAt ? "revoked" : t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "never used"}
                </span>
                {canManageTokens && !t.revokedAt && (
                  <button onClick={() => setPending({ kind: "token", id: t.id, name: t.name })} className="ml-auto text-muted-foreground hover:text-rose-700">
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-foreground">How to call it</summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{`# Start a run (body optional: {"folder":"Checkout"} or {"tag":"smoke"})
REF=$(curl -s -X POST ${origin}/api/hub/ci/run \\
  -H "Authorization: Bearer $QA_ENGINE_TOKEN" \\
  -H "Content-Type: application/json" -d '{"tag":"smoke"}' | jq -r .ref)

# Wait for it, then fail the job if it failed
while :; do
  STATE=$(curl -s "${origin}/api/hub/ci/status?ref=$REF" \\
    -H "Authorization: Bearer $QA_ENGINE_TOKEN" | jq -r .state)
  [ "$STATE" != "running" ] && break; sleep 15
done
[ "$STATE" = "passed" ]`}</pre>
        </details>
      </section>

      <ConfirmDialog
        open={pending !== null}
        variant="danger"
        title={pending?.kind === "token" ? `Revoke “${pending?.name}”?` : `Delete schedule “${pending?.name}”?`}
        description={
          pending?.kind === "token"
            ? "Pipelines using this token stop being able to start runs."
            : "Future runs stop. Past runs stay in the history."
        }
        confirmLabel={pending?.kind === "token" ? "Revoke token" : "Delete schedule"}
        onConfirm={async () => {
          if (pending) {
            await act(
              () => send(pending.kind === "token" ? `/api/hub/ci-tokens/${pending.id}` : `/api/hub/schedules/${pending.id}`, "DELETE"),
              pending.kind === "token" ? "Token revoked" : "Schedule deleted"
            )
          }
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
