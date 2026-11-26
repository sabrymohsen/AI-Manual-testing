"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bot,
  KeyRound,
  Loader2,
  Zap,
  CheckCircle2,
  XCircle,
  Star,
  Play,
  ShieldCheck,
  ShieldAlert,
  DollarSign,
  Activity,
  Server,
  Terminal,
  Wand2,
  Stethoscope,
  Wrench,
  BarChart3,
  Link2,
  Send,
  Save,
  GraduationCap,
  ChevronDown
} from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

// ============================================================
// PROVIDERS PANEL
// ============================================================
interface ProviderCard {
  provider: string
  label: string
  local: boolean
  docsHint: string
  models: string[]
  enabled: boolean
  model: string
  isDefault: boolean
  apiKeyMasked: string
  hasKey: boolean
  envKey: boolean
  /** Ollama only: saved server address ("" = default) and what the default is. */
  baseUrl?: string
  defaultBaseUrl?: string
}

interface TestState {
  loading: boolean
  ok?: boolean
  detail?: string
  latencyMs?: number
}

const PROVIDER_EMOJI: Record<string, string> = {
  OpenAI: "🟢",
  Anthropic: "🟣",
  Gemini: "🔵",
  Ollama: "🦙"
}

export function ProvidersPanel({ onDefaultChanged }: { onDefaultChanged?: () => void }) {
  const [cards, setCards] = useState<ProviderCard[]>([])
  const [loading, setLoading] = useState(true)
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [modelOptions, setModelOptions] = useState<Record<string, string[]>>({})
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/hub/agent/providers")
      const d = await res.json()
      const list: ProviderCard[] = d.providers || []
      setCards(list)
      const opts: Record<string, string[]> = {}
      list.forEach((c) => (opts[c.provider] = c.models))
      setModelOptions(opts)
      // Auto-detect Ollama models if that card exists.
      const ollama = list.find((c) => c.provider === "Ollama")
      if (ollama) {
        // Installed models only — an empty list means Ollama is down or has none.
        fetch("/api/hub/agent/providers/models?provider=Ollama")
          .then((r) => r.json())
          .then((m) => Array.isArray(m.models) && setModelOptions((prev) => ({ ...prev, Ollama: m.models })))
          .catch(() => {})
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = async (provider: string, body: Record<string, any>) => {
    const res = await fetch("/api/hub/agent/providers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, ...body })
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || "Couldn't save the provider settings")
      return false
    }
    await load()
    return true
  }

  const saveOllamaUrl = async (c: ProviderCard) => {
    if (urlInput === null) return
    if (await patch(c.provider, { baseUrl: urlInput.trim() })) {
      setUrlInput(null)
      runTest({ ...c, baseUrl: urlInput.trim() })
    }
  }

  const toggleEnabled = (c: ProviderCard) => patch(c.provider, { enabled: !c.enabled })
  const changeModel = (c: ProviderCard, model: string) => patch(c.provider, { model })

  const saveKey = async (c: ProviderCard) => {
    const key = keyInputs[c.provider]
    if (!key) return
    setSavingKey(c.provider)
    try {
      await patch(c.provider, { apiKey: key, enabled: true })
      setKeyInputs((p) => ({ ...p, [c.provider]: "" }))
    } finally {
      setSavingKey(null)
    }
  }

  const setDefault = async (provider: string) => {
    await fetch("/api/hub/agent/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider })
    })
    await load()
    onDefaultChanged?.()
  }

  const runTest = async (c: ProviderCard) => {
    setTests((p) => ({ ...p, [c.provider]: { loading: true } }))
    try {
      const res = await fetch("/api/hub/agent/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: c.provider,
          apiKey: keyInputs[c.provider] || "",
          ...(c.provider === "Ollama" ? { baseUrl: urlInput ?? c.baseUrl ?? "" } : {})
        })
      })
      const d = await res.json().catch(() => ({}))
      setTests((p) => ({ ...p, [c.provider]: { loading: false, ok: d.ok, detail: d.detail || d.error, latencyMs: d.latencyMs } }))
      // (The response has no provider field; this used to check d.provider and never matched.)
      if (c.provider === "Ollama") setModelOptions((prev) => ({ ...prev, Ollama: Array.isArray(d.models) ? d.models : [] }))
    } catch (err: any) {
      setTests((p) => ({ ...p, [c.provider]: { loading: false, ok: false, detail: err.message } }))
    }
  }

  if (loading) return <PanelLoader label="Loading AI providers..." />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bot size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">AI Providers</h3>
        <span className="text-xs text-muted-foreground font-semibold">
          Configure and enable providers. The <Star size={10} className="inline text-amber-500 fill-amber-400" /> default is what the agent uses.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((c) => {
          const t = tests[c.provider]
          // Ollama: only what's installed (never the catalog guess)
          const models = c.provider === "Ollama" ? modelOptions.Ollama || [] : modelOptions[c.provider] || c.models
          return (
            <div
              key={c.provider}
              className={`bg-card border rounded-2xl p-4 shadow-sm space-y-3 transition-all ${
                c.isDefault ? "border-primary/25 ring-2 ring-indigo-100" : "border-border"
              }`}
            >
              {/* header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">{PROVIDER_EMOJI[c.provider] || "🤖"}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">{c.label}</span>
                      {c.isDefault && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/25 flex items-center gap-0.5">
                          <Star size={8} className="fill-indigo-500" /> default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-semibold">{c.docsHint}</p>
                  </div>
                </div>
                {/* enable toggle */}
                <button
                  onClick={() => toggleEnabled(c)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${c.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
                  title={c.enabled ? "Enabled" : "Disabled"}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${c.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {/* key */}
              {!c.local && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <KeyRound size={10} /> API Key
                    {c.hasKey && (
                      <span className="text-emerald-600 normal-case ml-1">
                        · {c.envKey && !c.apiKeyMasked ? "from environment" : "configured"}
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={keyInputs[c.provider] || ""}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, [c.provider]: e.target.value }))}
                      placeholder={c.apiKeyMasked || "Paste API key..."}
                      className="flex-1 h-8 rounded-lg border px-3 text-xs bg-muted/50 font-mono outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <Button
                      onClick={() => saveKey(c)}
                      disabled={!keyInputs[c.provider] || savingKey === c.provider}
                      className="h-8 px-3 bg-primary text-white hover:bg-primary/90 rounded-lg text-xs font-semibold disabled:opacity-40"
                    >
                      {savingKey === c.provider ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    </Button>
                  </div>
                </div>
              )}

              {/* Ollama server address */}
              {c.provider === "Ollama" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Ollama address</label>
                  <div className="flex gap-2">
                    <input
                      value={urlInput ?? c.baseUrl ?? ""}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder={c.defaultBaseUrl || "http://localhost:11434"}
                      className="flex-1 h-8 rounded-lg border px-3 text-xs bg-muted/50 font-mono outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <Button
                      onClick={() => saveOllamaUrl(c)}
                      disabled={urlInput === null || urlInput.trim() === (c.baseUrl || "")}
                      className="h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-40"
                      title="Save address"
                    >
                      <Save size={12} />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be reachable from the machine this app runs on. Install Ollama from ollama.com, then run{" "}
                    <code className="font-mono">ollama pull qwen3:8b</code>.
                  </p>
                </div>
              )}

              {/* model */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                {c.provider === "Ollama" && models.length === 0 ? (
                  <p className="h-8 flex items-center text-xs text-muted-foreground">
                    No installed models found. Press Test for details.
                  </p>
                ) : (
                <select
                  value={c.model}
                  onChange={(e) => changeModel(c, e.target.value)}
                  className="h-8 w-full rounded-lg border px-3 text-xs font-semibold bg-card text-foreground outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {!models.includes(c.model) && c.model && <option value={c.model}>{c.model}</option>}
                </select>
                )}
              </div>

              {/* actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => runTest(c)}
                  disabled={t?.loading}
                  className="h-8 rounded-lg bg-card border-border text-muted-foreground text-xs font-semibold gap-1"
                >
                  {t?.loading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Test
                </Button>
                <button
                  onClick={() => setDefault(c.provider)}
                  disabled={c.isDefault}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1 border transition-colors ${
                    c.isDefault
                      ? "bg-primary/10 text-indigo-400 border-primary/25 cursor-default"
                      : "bg-card text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  <Star size={12} className={c.isDefault ? "fill-indigo-300" : ""} /> {c.isDefault ? "Default" : "Set default"}
                </button>

                {t && !t.loading && (
                  <span className={`ml-auto text-xs font-semibold flex items-center gap-1 ${t.ok ? "text-emerald-600" : "text-rose-600"}`}>
                    {t.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {t.ok ? `OK${t.latencyMs ? ` ${t.latencyMs}ms` : ""}` : "Failed"}
                  </span>
                )}
              </div>
              {t && !t.loading && t.detail && (
                <p className={`text-xs font-semibold ${t.ok ? "text-emerald-600" : "text-rose-500"}`}>{t.detail}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// COMMANDS LIBRARY PANEL
// ============================================================
interface CommandDef {
  label: string
  // Either a ready prompt, or a template with {param} + a param prompt label.
  prompt?: string
  template?: string
  paramLabel?: string
  native?: boolean // handled by a real agent tool / offline command
}
interface CommandCategory {
  title: string
  icon: any
  commands: CommandDef[]
}

const COMMAND_LIBRARY: CommandCategory[] = [
  {
    title: "Test Execution",
    icon: Play,
    commands: [
      { label: "Run all web tests", prompt: "Run all web tests", native: true },
      { label: "Run tests matching…", template: "Run tests matching {keyword}", paramLabel: "keyword", native: true },
      { label: "Run failed tests from last run", prompt: "Run the tests that failed in the last run", native: true },
      { label: "Run tests for requirement…", template: "Run the tests linked to requirement {REQ-ID}", paramLabel: "requirement id" }
    ]
  },
  {
    title: "Diagnosis",
    icon: Stethoscope,
    commands: [
      { label: "Why did a test fail?", template: "Why did {testName} fail?", paramLabel: "test name", native: true },
      { label: "Show recent failures", prompt: "Show me the recent test failures", native: true },
      { label: "Find similar failures", prompt: "Group the recent failures by error signature and find similar ones" },
      { label: "Predict which tests will fail", prompt: "Based on flakiness and recent trends, predict which tests are most likely to fail next", native: true }
    ]
  },
  {
    title: "Healing",
    icon: Wrench,
    commands: [
      { label: "Heal broken locators", prompt: "Heal broken locators", native: true },
      { label: "Show healing report", prompt: "Show me the self-healing locator report", native: true },
      { label: "Approve all healing recoveries", prompt: "Approve all pending healing recoveries" }
    ]
  },
  {
    title: "Code Generation",
    icon: Wand2,
    commands: [
      { label: "Generate a test for…", template: "Generate a web test for {feature}", paramLabel: "feature", native: true },
      { label: "Refactor to Smart Locators…", template: "Refactor {testName} to use Smart Locators", paramLabel: "test name" },
      { label: "Add assertions to…", template: "Add assertions and validation points to {testName}", paramLabel: "test name" }
    ]
  },
  {
    title: "Reporting",
    icon: BarChart3,
    commands: [
      { label: "Show coverage report", prompt: "Show me the coverage report", native: true },
      { label: "Show flaky test report", prompt: "Show me the flaky test report", native: true },
      { label: "Compare a test across browsers…", template: "Compare {testName} across browsers", paramLabel: "test name" },
      { label: "Generate weekly QA report", prompt: "Generate a comprehensive weekly QA report" }
    ]
  },
  {
    title: "Integration",
    icon: Link2,
    commands: [
      { label: "Create bug ticket for a failure…", template: "Create a bug ticket for the failure in {testName}", paramLabel: "test name" },
      { label: "Run tests for work package…", template: "Run the tests for work package {WP-ID}", paramLabel: "work package id" },
      { label: "Check requirement coverage", prompt: "Check the requirement coverage across the project" }
    ]
  }
]

export function CommandsPanel({ onRun, sending }: { onRun: (text: string) => void; sending: boolean }) {
  const [param, setParam] = useState<{ key: string; label: string; template: string } | null>(null)
  const [paramValue, setParamValue] = useState("")

  const fire = (c: CommandDef, catIndex: number, cmdIndex: number) => {
    if (c.template) {
      setParam({ key: `${catIndex}-${cmdIndex}`, label: c.paramLabel || "value", template: c.template })
      setParamValue("")
    } else if (c.prompt) {
      onRun(c.prompt)
    }
  }

  const submitParam = () => {
    if (!param || !paramValue.trim()) return
    const text = param.template.replace(/\{[^}]+\}/, paramValue.trim())
    onRun(text)
    setParam(null)
    setParamValue("")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Terminal size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Command Library</h3>
        <span className="text-xs text-muted-foreground font-semibold">
          One click sends the command to the assistant. <span className="text-emerald-600 font-semibold">●</span> = runs a real engine tool.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {COMMAND_LIBRARY.map((cat, ci) => (
          <div key={cat.title} className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b pb-2">
              <cat.icon size={14} className="text-primary" />
              <span className="text-xs font-semibold text-foreground">{cat.title}</span>
            </div>
            <div className="space-y-2">
              {cat.commands.map((c, cmi) => {
                const isActive = param?.key === `${ci}-${cmi}`
                return (
                  <div key={c.label}>
                    <button
                      onClick={() => fire(c, ci, cmi)}
                      disabled={sending}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50 group"
                    >
                      {c.native ? (
                        <span className="text-emerald-500 text-xs shrink-0" title="Runs a real engine tool">●</span>
                      ) : (
                        <span className="text-slate-300 text-xs shrink-0" title="Sent as a prompt">●</span>
                      )}
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.template ? (
                        <span className="text-xs text-slate-300 font-medium">param</span>
                      ) : (
                        <Send size={11} className="text-slate-300 group-hover:text-primary shrink-0" />
                      )}
                    </button>
                    {isActive && (
                      <div className="flex gap-2 mt-1 mb-1 pl-2">
                        <input
                          autoFocus
                          value={paramValue}
                          onChange={(e) => setParamValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && submitParam()}
                          placeholder={param!.label}
                          className="flex-1 h-8 rounded-lg border px-3 text-xs bg-muted/50 outline-none focus:ring-2 focus:ring-indigo-100"
                        />
                        <Button onClick={submitParam} disabled={!paramValue.trim()} className="h-8 px-3 bg-primary text-white hover:bg-primary/90 rounded-lg text-xs font-semibold disabled:opacity-40">
                          <Send size={12} />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// USAGE & PRIVACY PANEL
// ============================================================
interface UsageData {
  daily: { date: string; tokens: number; cost: number; calls: number }[]
  totals: { day: number; week: number; month: number }
  byProvider: { provider: string; tokens: number; cost: number; calls: number }[]
  grandTotal: { tokens: number; cost: number; calls: number }
  budget: { monthlyBudgetUsd: number; monthSpend: number }
}
interface PolicyData {
  allowDataAccess: boolean
  redactSensitive: boolean
  monthlyBudgetUsd: number
}
interface AccessLogRow {
  id: string
  provider: string
  dataSummary: string
  redacted: boolean
  withheld: boolean
  createdAt: string
}

export function UsagePrivacyPanel() {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [policy, setPolicy] = useState<PolicyData | null>(null)
  const [log, setLog] = useState<AccessLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [budgetInput, setBudgetInput] = useState("")
  const [savingPolicy, setSavingPolicy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [u, p, l] = await Promise.all([
        fetch("/api/hub/agent/usage").then((r) => r.json()),
        fetch("/api/hub/agent/policy").then((r) => r.json()),
        fetch("/api/hub/agent/data-access-log").then((r) => r.json())
      ])
      setUsage(u)
      setPolicy(p.policy)
      setBudgetInput(String(p.policy?.monthlyBudgetUsd ?? 0))
      setLog(l.log || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const savePolicy = async (patch: Partial<PolicyData>) => {
    setSavingPolicy(true)
    try {
      const res = await fetch("/api/hub/agent/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      })
      const d = await res.json()
      if (d.policy) setPolicy(d.policy)
      await load()
    } finally {
      setSavingPolicy(false)
    }
  }

  if (loading || !usage || !policy) return <PanelLoader label="Loading usage & privacy..." />

  const budget = usage.budget.monthlyBudgetUsd
  const spend = usage.budget.monthSpend
  const budgetPct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0

  return (
    <div className="space-y-4">
      {/* TOTALS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Activity} label="Total calls" value={usage.grandTotal.calls.toLocaleString()} hint="last 30 days" />
        <StatTile icon={Zap} label="Total tokens" value={formatTokens(usage.grandTotal.tokens)} hint="last 30 days" />
        <StatTile icon={DollarSign} label="Est. cost (mo.)" value={`$${spend.toFixed(2)}`} hint="this calendar month" />
        <StatTile icon={DollarSign} label="Today" value={`$${usage.totals.day.toFixed(2)}`} hint={`week $${usage.totals.week.toFixed(2)}`} />
      </div>

      {/* BUDGET BAR */}
      {budget > 0 && (
        <div className="bg-card border rounded-xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-muted-foreground flex items-center gap-2">
              <DollarSign size={13} className="text-primary" /> Monthly budget
            </span>
            <span className={budgetPct >= 100 ? "text-rose-600" : budgetPct >= 80 ? "text-amber-600" : "text-muted-foreground"}>
              ${spend.toFixed(2)} / ${budget.toFixed(2)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${budgetPct >= 100 ? "bg-rose-500" : budgetPct >= 80 ? "bg-amber-500" : "bg-primary"}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          {budgetPct >= 100 && (
            <p className="text-xs text-rose-600 font-semibold flex items-center gap-1">
              <ShieldAlert size={11} /> Budget reached — paid provider calls are paused until next month.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* USAGE CHART */}
        <div className="lg:col-span-2 bg-card border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-foreground">Daily token usage · 30 days</h3>
            <span className="text-xs text-muted-foreground font-semibold">tokens/day</span>
          </div>
          <UsageBarChart daily={usage.daily} />
        </div>

        {/* PER PROVIDER */}
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
            <Server size={13} className="text-primary" /> By provider
          </h3>
          {usage.byProvider.length === 0 ? (
            <p className="text-xs text-muted-foreground font-semibold py-8 text-center">No provider usage recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {usage.byProvider.map((p) => (
                <div key={p.provider} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">{PROVIDER_EMOJI[p.provider] || "🤖"} {p.provider}</span>
                  <span className="text-muted-foreground font-semibold">
                    {formatTokens(p.tokens)} · <span className="text-primary font-semibold">${p.cost.toFixed(2)}</span> · {p.calls} calls
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CONSENT & PRIVACY */}
      <div className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck size={14} className="text-primary" /> Consent & Privacy
        </h3>
        <ToggleRow
          label="Allow AI to access test data"
          hint="When off, tool results (test lists, logs, results) are withheld from the provider."
          on={policy.allowDataAccess}
          disabled={savingPolicy}
          onChange={(v) => savePolicy({ allowDataAccess: v })}
        />
        <ToggleRow
          label="Redact sensitive data before sending to AI"
          hint="Masks emails, API keys, tokens and passwords in tool output before it leaves the machine."
          on={policy.redactSensitive}
          disabled={savingPolicy}
          onChange={(v) => savePolicy({ redactSensitive: v })}
        />
        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-xs font-semibold text-foreground">Monthly budget limit (USD)</p>
            <p className="text-xs text-muted-foreground font-semibold">0 = unlimited. Paid calls pause when the month's estimated spend hits this.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">$</span>
              <input
                type="number"
                min={0}
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="w-28 h-8 rounded-lg border pl-6 pr-3 text-xs font-semibold bg-muted/50 outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <Button
              onClick={() => savePolicy({ monthlyBudgetUsd: Number(budgetInput) || 0 })}
              disabled={savingPolicy}
              className="h-8 px-3 bg-primary text-white hover:bg-primary/90 rounded-lg text-xs font-semibold"
            >
              Set
            </Button>
          </div>
        </div>
      </div>

      {/* DATA ACCESS AUDIT */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/50 text-xs font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck size={13} /> Data Access Audit
          <span className="text-xs text-muted-foreground font-semibold ml-1">what was sent to (or withheld from) a provider</span>
        </div>
        <div className="max-h-72 overflow-auto divide-y">
          {log.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground font-semibold">
              No AI data-access events yet. They appear here once the agent runs with a provider configured.
            </div>
          ) : (
            log.map((r) => (
              <div key={r.id} className="px-4 py-2 text-xs flex items-center gap-2">
                <span className="font-semibold text-foreground w-20 shrink-0">{r.provider}</span>
                <span className="font-mono text-muted-foreground truncate flex-1">{r.dataSummary}</span>
                {r.withheld ? (
                  <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">withheld</span>
                ) : r.redacted ? (
                  <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100">redacted</span>
                ) : (
                  <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">sent</span>
                )}
                <span className="text-muted-foreground font-semibold whitespace-nowrap">{new Date(r.createdAt).toLocaleTimeString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Single-series daily bar chart (dataviz: one indigo hue, baseline-anchored,
// 4px rounded tops, 2px gaps, per-bar hover; light-only to match the hub) ----
// ───────────────────────── Skills ─────────────────────────

interface SkillRow {
  id: string
  name: string
  description: string
  instructions: string
  usedBy: string[]
}

/**
 * The QA skills (src/lib/ai/qa-skills.ts) every AI feature applies: test
 * design, bug writing, severity, diagnosis… Always on; this tab only shows them.
 */
export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillRow[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/hub/agent/skills")
      .then((r) => r.json())
      .then((d) => (d.skills ? setSkills(d.skills) : setError(d.error || "Couldn't load skills")))
      .catch(() => setError("Couldn't load skills"))
  }, [])

  if (!skills) return error ? <p className="text-xs text-rose-600 font-semibold">{error}</p> : <PanelLoader label="Loading skills..." />

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <GraduationCap size={16} className="text-primary" /> QA skills
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
            {skills.length} always on
          </span>
        </h3>
        <p className="text-xs text-muted-foreground font-semibold mt-1">
          Testing know-how the AI applies to every feature: generating test cases, writing bug reports, rating severity,
          explaining failures and the chat. Each feature gets only the skills that fit it (up to 3), whichever provider is set up.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {skills.map((s) => (
          <div key={s.id} className="bg-card border rounded-xl p-4 shadow-sm space-y-2">
            <div>
              <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 size={12} className="text-emerald-600" /> {s.name}
              </p>
              <p className="text-xs text-muted-foreground font-semibold">{s.description}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {s.usedBy.map((u) => (
                <span key={u} className="text-xs font-semibold text-primary bg-primary/10 border border-primary/25 rounded-full px-2 py-0.5">
                  {u}
                </span>
              ))}
            </div>
            <button
              onClick={() => setOpen(open === s.id ? null : s.id)}
              className="text-xs font-semibold text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <ChevronDown size={12} className={`transition-transform ${open === s.id ? "rotate-180" : ""}`} />
              {open === s.id ? "Hide" : "Show"} what the AI is told
            </button>
            {open === s.id && (
              <p className="text-xs leading-relaxed text-muted-foreground bg-muted/50 border rounded-xl p-3">{s.instructions}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function UsageBarChart({ daily }: { daily: { date: string; tokens: number; cost: number; calls: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...daily.map((d) => d.tokens))
  const H = 140
  const gap = 2
  const n = daily.length

  if (daily.every((d) => d.tokens === 0)) {
    return (
      <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground font-semibold">
        No usage in the last 30 days — token usage appears here after the agent talks to a provider.
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-end gap-0.5 h-[140px]" style={{ ["--gap" as any]: `${gap}px` }}>
        {daily.map((d, i) => {
          const h = d.tokens > 0 ? Math.max(3, (d.tokens / max) * H) : 0
          return (
            <div
              key={d.date}
              className="flex-1 flex items-end h-full"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className={`w-full rounded-t transition-colors ${hover === i ? "bg-primary" : "bg-primary/85"}`}
                style={{ height: `${h}px`, minHeight: d.tokens > 0 ? 3 : 0 }}
              />
            </div>
          )
        })}
      </div>
      {/* baseline */}
      <div className="h-px bg-muted mt-0" />
      <div className="flex justify-between mt-1 text-xs text-muted-foreground font-semibold">
        <span>{daily[0]?.date.slice(5)}</span>
        <span>{daily[Math.floor(n / 2)]?.date.slice(5)}</span>
        <span>{daily[n - 1]?.date.slice(5)}</span>
      </div>
      {hover !== null && daily[hover] && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-semibold rounded-lg px-3 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.06)] pointer-events-none whitespace-nowrap">
          {daily[hover].date} · {formatTokens(daily[hover].tokens)} tok · ${daily[hover].cost.toFixed(3)} · {daily[hover].calls} calls
        </div>
      )}
    </div>
  )
}

// ---- shared bits ----
function StatTile({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border rounded-xl p-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon size={12} className="text-primary" /> {label}
      </div>
      <div className="text-xl font-semibold text-foreground mt-1">{value}</div>
      {hint && <div className="text-xs text-muted-foreground font-semibold">{hint}</div>}
    </div>
  )
}

function ToggleRow({ label, hint, on, disabled, onChange }: { label: string; hint: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground font-semibold">{hint}</p>
      </div>
      <button
        onClick={() => onChange(!on)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 disabled:opacity-50 ${on ? "bg-primary" : "bg-slate-300"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  )
}

function PanelLoader({ label }: { label: string }) {
  return (
    <div className="py-24 flex flex-col items-center justify-center gap-2 border bg-card rounded-xl shadow-sm">
      <Loader2 className="animate-spin text-primary" size={28} />
      <span className="font-semibold text-muted-foreground uppercase tracking-widest text-xs">{label}</span>
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
