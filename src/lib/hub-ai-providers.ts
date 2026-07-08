// Section 11 (enhanced): AI provider management — model catalog, pricing,
// redaction, connection testing and Ollama model auto-detection. Kept separate
// from hub-agent.ts (the tool loop) so the settings UI and the agent share one
// source of truth for provider metadata.
import { prisma } from "@/lib/db"

export const AI_PROVIDERS = ["OpenAI", "Anthropic", "Gemini", "Ollama"] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export interface ProviderMeta {
  provider: AiProvider
  label: string
  local: boolean // no API key required
  models: string[]
  keyEnv?: string // env var consulted as a fallback key
  docsHint: string
}

// Model lists per the spec. Ollama's list is a fallback; the real installed
// models are auto-detected from the local daemon when reachable.
export const PROVIDER_CATALOG: Record<AiProvider, ProviderMeta> = {
  OpenAI: {
    provider: "OpenAI",
    label: "OpenAI",
    local: false,
    models: ["gpt-4o", "gpt-4o-mini"],
    keyEnv: "OPENAI_API_KEY",
    docsHint: "Uses the OpenAI Chat Completions API."
  },
  Anthropic: {
    provider: "Anthropic",
    label: "Anthropic (Claude)",
    local: false,
    models: ["claude-3-5-sonnet-latest", "claude-3-haiku-20240307"],
    keyEnv: "ANTHROPIC_API_KEY",
    docsHint: "Uses the official Anthropic Messages API."
  },
  Gemini: {
    provider: "Gemini",
    label: "Google Gemini",
    local: false,
    models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    keyEnv: "GEMINI_API_KEY",
    docsHint: "Uses Gemini's OpenAI-compatible endpoint."
  },
  Ollama: {
    provider: "Ollama",
    label: "Ollama (local)",
    local: true,
    models: ["llama3", "mistral", "codellama"],
    docsHint: "Runs locally at http://localhost:11434 — no API key needed."
  }
}

// Price per 1M tokens (USD), input / output. Local models are free. Values are
// list prices used only for cost *estimates* in the usage dashboard.
export const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "claude-3-5-sonnet-latest": { in: 3, out: 15 },
  "claude-3-haiku-20240307": { in: 0.25, out: 1.25 },
  "gemini-1.5-pro": { in: 1.25, out: 5 },
  "gemini-1.5-flash": { in: 0.075, out: 0.3 }
}

/** Estimated USD cost for a call given token counts. Unknown/local models = 0. */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_PRICING[model]
  if (!p) return 0
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out
}

// --- Redaction: mask common secrets/PII before test data leaves the machine ---
const REDACTION_RULES: { re: RegExp; label: string }[] = [
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, label: "[email]" },
  { re: /\b(sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9]{16,}\b/g, label: "[token]" },
  { re: /\b[A-Za-z0-9]{32,}\b/g, label: "[key]" },
  { re: /("?(?:password|passwd|pwd|secret|apikey|api_key|token)"?\s*[:=]\s*)("?)[^"\s,}]+\2/gi, label: "$1[redacted]" },
  { re: /\b(?:\d[ -]*?){13,16}\b/g, label: "[card]" }
]

export function redactSensitive(text: string): { redacted: string; changed: boolean } {
  let out = text
  for (const rule of REDACTION_RULES) {
    out = out.replace(rule.re, rule.label)
  }
  return { redacted: out, changed: out !== text }
}

// --- Policy helpers ---
export interface AiPolicyData {
  allowDataAccess: boolean
  redactSensitive: boolean
  monthlyBudgetUsd: number
}

export async function getAiPolicy(): Promise<AiPolicyData> {
  const row = await prisma.aiPolicy.findUnique({ where: { id: "ai-policy" } })
  return {
    allowDataAccess: row?.allowDataAccess ?? true,
    redactSensitive: row?.redactSensitive ?? true,
    monthlyBudgetUsd: row?.monthlyBudgetUsd ?? 0
  }
}

/** Sum of estimated spend since the start of the current calendar month. */
export async function monthlySpend(): Promise<number> {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  const agg = await prisma.aiUsageEvent.aggregate({
    where: { createdAt: { gte: start } },
    _sum: { costUsd: true }
  })
  return agg._sum.costUsd || 0
}

// --- Connection testing ---
export interface ConnectionResult {
  ok: boolean
  detail: string
  latencyMs?: number
  models?: string[]
}

/** Probe a provider for reachability + credential validity. Real network call. */
export async function testProviderConnection(provider: AiProvider, apiKey: string): Promise<ConnectionResult> {
  const started = Date.now()
  const key = apiKey || process.env[PROVIDER_CATALOG[provider].keyEnv || ""] || ""
  try {
    if (provider === "Ollama") {
      const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2500) })
      if (!res.ok) return { ok: false, detail: `Ollama responded ${res.status}` }
      const data = await res.json()
      const models = (data.models || []).map((m: any) => String(m.name).replace(/:latest$/, ""))
      return { ok: true, detail: `Ollama reachable · ${models.length} model(s) installed`, latencyMs: Date.now() - started, models }
    }

    if (!key) return { ok: false, detail: "No API key configured" }

    if (provider === "Anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(6000)
      })
      if (res.ok) return { ok: true, detail: "Anthropic key valid", latencyMs: Date.now() - started }
      return { ok: false, detail: `Anthropic responded ${res.status} (${res.status === 401 ? "invalid key" : "error"})` }
    }

    const base = provider === "Gemini" ? "https://generativelanguage.googleapis.com/v1beta/openai" : "https://api.openai.com/v1"
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000)
    })
    if (res.ok) return { ok: true, detail: `${provider} key valid`, latencyMs: Date.now() - started }
    return { ok: false, detail: `${provider} responded ${res.status} (${res.status === 401 ? "invalid key" : "error"})` }
  } catch (err: any) {
    return { ok: false, detail: err.name === "TimeoutError" ? "Connection timed out" : err.message }
  }
}

/** Auto-detect installed Ollama models; returns catalog fallback on failure. */
export async function detectOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return PROVIDER_CATALOG.Ollama.models
    const data = await res.json()
    const models = (data.models || []).map((m: any) => String(m.name).replace(/:latest$/, ""))
    return models.length ? models : PROVIDER_CATALOG.Ollama.models
  } catch {
    return PROVIDER_CATALOG.Ollama.models
  }
}
