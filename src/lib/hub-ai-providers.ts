// Section 11 (enhanced): AI provider management — model catalog, pricing,
// redaction, connection testing and Ollama model auto-detection. Kept separate
// from hub-agent.ts (the tool loop) so the settings UI and the agent share one
// source of truth for provider metadata.
import { prisma } from "@/lib/db"

export const AI_PROVIDERS = ["Kimi", "OpenAI", "Anthropic", "Gemini", "Ollama"] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

// Kimi (Moonshot) is OpenAI-compatible. The .ai and .cn consoles issue separate,
// non-interchangeable keys, so the host is overridable for a key minted on the
// China console.
export const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1"

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
  Kimi: {
    provider: "Kimi",
    label: "Kimi (Moonshot)",
    local: false,
    // Fallback only — the real list is read from the account's /models endpoint
    // when the key is tested, so a renamed or newly released model still shows up.
    models: ["kimi-k2-0711-preview", "moonshot-v1-32k", "moonshot-v1-8k"],
    keyEnv: "KIMI_API_KEY",
    docsHint: "OpenAI-compatible endpoint. Set KIMI_API_KEY (KIMI_BASE_URL for the .cn console)."
  },
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
    // Only a last resort: the real list is read from the Ollama server.
    models: ["qwen3:8b", "llama3.2"],
    docsHint: "Free models that run on your own computer. No API key needed."
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
  // Kimi/Moonshot models are deliberately absent: their list price is published
  // in CNY and varies by model tier, and a wrong number here would show up as a
  // confident-looking dollar figure in the Usage tab. Unpriced models record
  // real token counts with costUsd 0 — add entries here to enable cost estimates.
}

// ---------- Ollama ----------

export const DEFAULT_OLLAMA_URL = "http://localhost:11434"

/**
 * Where to reach Ollama: an explicit URL (project or workspace setting), then
 * the OLLAMA_URL server variable, then localhost. "localhost" means the
 * machine this app runs on — on a hosted deployment that is the server, not
 * the tester's computer.
 */
export function ollamaBaseUrl(override?: string | null): string {
  const raw = (override || "").trim() || process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL
  return raw.replace(/\/+$/, "").replace(/\/(v1|api)$/, "")
}

/** Validate a user-entered Ollama URL. Returns an error message, or null when fine. */
export function ollamaUrlError(raw: string): string | null {
  if (!raw.trim()) return null
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return "Enter a full URL, e.g. http://localhost:11434"
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "The Ollama URL must start with http:// or https://"
  if (u.username || u.password) return "Don't put a username or password in the Ollama URL"
  if (raw.length > 300) return "That URL is too long"
  return null
}

export interface OllamaProbe {
  reachable: boolean
  models: string[]
  baseUrl: string
}

/** Ask an Ollama server which models it has installed. Never throws. */
export async function probeOllama(override?: string | null, timeoutMs = 3000): Promise<OllamaProbe> {
  const baseUrl = ollamaBaseUrl(override)
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return { reachable: false, models: [], baseUrl }
    const data = await res.json().catch(() => null)
    if (!data || !Array.isArray(data.models)) return { reachable: false, models: [], baseUrl }
    const models = data.models.map((m: any) => String(m?.name || "").replace(/:latest$/, "")).filter(Boolean)
    return { reachable: true, models, baseUrl }
  } catch {
    return { reachable: false, models: [], baseUrl }
  }
}

/** Plain-language next step for an Ollama server that can't be used yet. */
export function ollamaHelp(probe: OllamaProbe): string {
  if (!probe.reachable) {
    return (
      `Can't reach Ollama at ${probe.baseUrl}. Install it from ollama.com, start it, ` +
      `then download a model with "ollama pull qwen3:8b". ` +
      `If this app runs on a server, Ollama on your own computer isn't reachable as "localhost" — ` +
      `enter an address the server can reach instead.`
    )
  }
  return `Ollama is running at ${probe.baseUrl} but has no models yet. Download one with "ollama pull qwen3:8b", then test again.`
}

/** Base URL for the providers that speak the OpenAI chat-completions shape. */
export function openAiCompatBaseUrl(provider: AiProvider, ollamaUrl?: string | null): string {
  switch (provider) {
    case "Kimi":
      return KIMI_BASE_URL
    case "Gemini":
      return "https://generativelanguage.googleapis.com/v1beta/openai"
    case "Ollama":
      return `${ollamaBaseUrl(ollamaUrl)}/v1`
    default:
      return "https://api.openai.com/v1"
  }
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
export async function testProviderConnection(
  provider: AiProvider,
  apiKey: string,
  opts: { ollamaUrl?: string | null } = {}
): Promise<ConnectionResult> {
  const started = Date.now()
  const key = apiKey || process.env[PROVIDER_CATALOG[provider].keyEnv || ""] || ""
  try {
    if (provider === "Ollama") {
      const probe = await probeOllama(opts.ollamaUrl)
      if (!probe.reachable || probe.models.length === 0) return { ok: false, detail: ollamaHelp(probe) }
      return {
        ok: true,
        detail: `Connected to Ollama at ${probe.baseUrl} · ${probe.models.length} model(s) installed`,
        latencyMs: Date.now() - started,
        models: probe.models,
      }
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

    const base = openAiCompatBaseUrl(provider)
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000)
    })
    if (res.ok) {
      // Report the account's real model list so the picker never offers a model
      // the key can't call (Kimi renames these more often than the others).
      const data = await res.json().catch(() => null)
      const models = Array.isArray(data?.data)
        ? data.data.map((m: any) => String(m.id)).filter(Boolean)
        : undefined
      return {
        ok: true,
        detail: models?.length
          ? `${provider} key valid · ${models.length} model(s) available`
          : `${provider} key valid`,
        latencyMs: Date.now() - started,
        models
      }
    }
    return { ok: false, detail: `${provider} responded ${res.status} (${res.status === 401 ? "invalid key" : "error"})` }
  } catch (err: any) {
    return { ok: false, detail: err.name === "TimeoutError" ? "Connection timed out" : err.message }
  }
}

/**
 * Installed Ollama models. Empty when Ollama is down or has none — never a
 * made-up list, which used to offer models that weren't installed.
 */
export async function detectOllamaModels(ollamaUrl?: string | null): Promise<string[]> {
  return (await probeOllama(ollamaUrl, 2500)).models
}

/**
 * With no model chosen, use one that is actually installed: the catalog
 * default (qwen3:8b) may not be, and Ollama answers "model not found".
 */
export async function defaultOllamaModel(ollamaUrl?: string | null): Promise<string> {
  const installed = await detectOllamaModels(ollamaUrl)
  const preferred = PROVIDER_CATALOG.Ollama.models.find((m) => installed.includes(m))
  return preferred || installed[0] || PROVIDER_CATALOG.Ollama.models[0]
}

