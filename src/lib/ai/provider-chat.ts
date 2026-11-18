/**
 * One chat call against whichever AI provider the workspace has configured.
 *
 * The generators (test cases, user stories, bug drafts) each had their own
 * private Ollama → HuggingFace → rule-based chain, which ignored the provider
 * management in Section 11 entirely. On a deployed box there is no Ollama and
 * no HF token, so every generator silently fell back to templates no matter
 * what was configured in the hub. This module is the single place they now ask
 * for a completion, so configuring a provider once lights up all of them.
 *
 * Kimi/OpenAI/Gemini/Ollama all speak the OpenAI chat-completions shape;
 * Anthropic gets its own branch. Usage is recorded per call, so the hub's
 * Usage tab reflects generator traffic and not just agent chat.
 */
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"
import {
  PROVIDER_CATALOG,
  estimateCost,
  openAiCompatBaseUrl,
  ollamaBaseUrl,
  defaultOllamaModel,
  type AiProvider,
} from "@/lib/hub-ai-providers"
import { getProjectAiCredentials } from "@/lib/ai/project-ai-config"
import { withQaSkills } from "@/lib/ai/qa-skills"

export interface ResolvedProvider {
  provider: AiProvider
  apiKey: string
  model: string
  /**
   * Endpoint override. Set only by the legacy OPENAI_COMPATIBLE_* fallback, so
   * a deployment pointing at a proxy or a self-hosted gateway keeps working;
   * every other provider resolves its URL from the catalog as before.
   */
  baseUrl?: string
  /** Ollama only: the server to call (project → workspace → OLLAMA_URL → localhost). */
  ollamaUrl?: string
}

/**
 * The pre-catalog way of configuring AI, still the only thing many deployments
 * set. Half the AI features in this app read these two variables directly and
 * knew nothing about the provider catalog or a project's own key.
 *
 * Kept as the LAST resort in resolveProvider so those deployments keep working
 * untouched, while a project that saves its own key now overrides them.
 */
function legacyEnvProvider(): ResolvedProvider | null {
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY
  if (!apiKey) return null
  return {
    provider: "OpenAI",
    apiKey,
    model: process.env.OPENAI_COMPATIBLE_MODEL || "gpt-4o-mini",
    baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1",
  }
}

export interface ChatOptions {
  /** System instruction; sent as a system message / Anthropic system param. */
  system?: string
  prompt: string
  /** Base64 image (no data: prefix) for vision-capable models. */
  imageBase64?: string
  imageMediaType?: string
  maxTokens?: number
  temperature?: number
  /** Label recorded on the usage event, e.g. "generate-test-cases". */
  command?: string
  timeoutMs?: number
  /** Prefer this project's own provider config when it has one. */
  projectId?: string
  /**
   * Ask the provider for strict JSON. Sent as response_format on the
   * OpenAI-compatible branch; Anthropic has no equivalent, so callers must
   * still say "return only JSON" in the prompt and parse defensively.
   */
  json?: boolean
}

/**
 * The provider a call should use, most specific first:
 *   1. the project's own config (its AI Provider tab),
 *   2. the workspace-wide AiProviderConfig — default+enabled, else any enabled,
 *   3. any provider whose key env var is set,
 *   4. the legacy OPENAI_COMPATIBLE_API_KEY / _BASE_URL pair.
 *
 * The env fallbacks mean a deployment can supply the key (e.g. KIMI_API_KEY)
 * without writing it into AiProviderConfig.apiKey, a plaintext column — and
 * that a box configured only the old way keeps working after every AI feature
 * was moved onto this resolver.
 */
export async function resolveProvider(projectId?: string): Promise<ResolvedProvider | null> {
  if (projectId) {
    const own = await getProjectAiCredentials(projectId).catch(() => null)
    if (own) return own
  }

  // Wrapped whole: `.catch()` alone only covers a rejected query, not the table
  // being absent from the client at all — a database that has not been pushed
  // yet, or a caller that stubs @/lib/db. Provider resolution must degrade to
  // the env fallbacks in those cases, not throw and take the feature down.
  let rows: Array<{ provider: string; apiKey: string; model: string; baseUrl?: string }> = []
  try {
    rows = await prisma.aiProviderConfig.findMany({
      where: { enabled: true },
      orderBy: { isDefault: "desc" },
    })
  } catch {
    rows = []
  }

  for (const row of rows) {
    const meta = PROVIDER_CATALOG[row.provider as AiProvider]
    if (!meta) continue
    const key = row.apiKey || (meta.keyEnv ? process.env[meta.keyEnv] || "" : "")
    if (!key && !meta.local) continue
    if (row.provider === "Ollama") {
      const ollamaUrl = row.baseUrl || undefined
      return { provider: "Ollama", apiKey: "", model: row.model || (await defaultOllamaModel(ollamaUrl)), ollamaUrl }
    }
    return {
      provider: row.provider as AiProvider,
      apiKey: key,
      model: row.model || meta.models[0],
    }
  }

  // Nothing configured in the DB — fall back to any provider whose key is in
  // the environment, so setting KIMI_API_KEY alone is enough to work.
  for (const meta of Object.values(PROVIDER_CATALOG)) {
    if (meta.local || !meta.keyEnv) continue
    const key = process.env[meta.keyEnv]
    if (key) {
      return { provider: meta.provider, apiKey: key, model: meta.models[0] }
    }
  }

  // Last: the legacy OPENAI_COMPATIBLE_* pair.
  return legacyEnvProvider()
}

/** True when a real model is reachable, i.e. generators can skip the templates. */
export async function hasConfiguredProvider(projectId?: string): Promise<boolean> {
  return (await resolveProvider(projectId)) !== null
}

async function recordUsage(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  command?: string
): Promise<void> {
  try {
    await prisma.aiUsageEvent.create({
      data: {
        provider,
        model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costUsd: estimateCost(model, promptTokens, completionTokens),
        command: command || null,
      },
    })
  } catch {
    // Usage accounting must never fail a generation.
  }
}

async function callAnthropic(
  resolved: ResolvedProvider,
  opts: ChatOptions
): Promise<string> {
  // The SDK defaults to a 10-minute timeout and two silent retries, so a
  // hanging Anthropic call could hold a request for half an hour while the
  // caller's own timeout was ignored entirely. Honour opts.timeoutMs here the
  // way the OpenAI-compatible branch does.
  const client = new Anthropic({
    apiKey: resolved.apiKey,
    timeout: opts.timeoutMs ?? 120_000,
    maxRetries: 1,
  })
  const content: Anthropic.MessageParam["content"] = opts.imageBase64
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: (opts.imageMediaType || "image/png") as any,
            data: opts.imageBase64,
          },
        },
        { type: "text", text: opts.prompt },
      ]
    : opts.prompt

  const res = await client.messages.create({
    model: resolved.model,
    max_tokens: opts.maxTokens ?? 4000,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content }],
  })

  await recordUsage(
    resolved.provider,
    resolved.model,
    res.usage?.input_tokens || 0,
    res.usage?.output_tokens || 0,
    opts.command
  )

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()

  if (!text) {
    throw new Error(
      res.stop_reason === "max_tokens"
        ? `Anthropic (${resolved.model}) reached its ${opts.maxTokens ?? 4000}-token ceiling before writing any answer`
        : `Anthropic (${resolved.model}) returned an empty reply`
    )
  }
  if (res.stop_reason === "max_tokens") {
    console.warn(
      `[provider-chat] Anthropic (${resolved.model}) hit its token ceiling; the reply is cut off`
    )
  }

  return text
}

/**
 * Ollama through its native /api/chat instead of the /v1 OpenAI shim.
 *
 * Reasoning models (qwen3, deepseek-r1…) think before answering, and the /v1
 * endpoint gives no way to switch that off: on a 16 GB laptop a one-word
 * severity took 15s and a test case over a minute, sometimes running into the
 * token ceiling with nothing written. /api/chat takes `think: false` and
 * answered the same severity in under 3s. Set OLLAMA_THINK=true to keep it.
 */
async function callOllamaNative(
  resolved: ResolvedProvider,
  opts: ChatOptions
): Promise<string> {
  const base = ollamaBaseUrl(resolved.ollamaUrl)
  const messages: any[] = []
  if (opts.system) messages.push({ role: "system", content: opts.system })
  messages.push({
    role: "user",
    content: opts.prompt,
    ...(opts.imageBase64 ? { images: [opts.imageBase64] } : {}),
  })
  const limit = opts.maxTokens ?? 4000

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolved.model,
      messages,
      stream: false,
      think: process.env.OLLAMA_THINK === "true",
      ...(opts.json ? { format: "json" } : {}),
      options: {
        num_predict: limit,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  })

  if (!res.ok) {
    // Only Ollama's own {"error": "..."} message: the URL may be user-supplied,
    // so don't echo whatever some other server sent back.
    const data = await res.json().catch(() => null)
    const reason = typeof data?.error === "string" ? `: ${data.error.slice(0, 200)}` : ""
    throw new Error(`Ollama at ${base} returned ${res.status}${reason}`)
  }

  const data = await res.json()
  await recordUsage(
    resolved.provider,
    resolved.model,
    data.prompt_eval_count || 0,
    data.eval_count || 0,
    opts.command
  )

  const content = String(data.message?.content || "").trim()
  if (!content) {
    throw new Error(
      data.done_reason === "length"
        ? `Ollama (${resolved.model}) reached its ${limit}-token ceiling before writing any answer`
        : `Ollama (${resolved.model}) returned an empty reply`
    )
  }
  if (data.done_reason === "length") {
    console.warn(`[provider-chat] Ollama (${resolved.model}) hit the ${limit}-token ceiling; the reply is cut off`)
  }
  return content
}

async function callOpenAiCompatible(
  resolved: ResolvedProvider,
  opts: ChatOptions
): Promise<string> {
  const baseUrl = resolved.baseUrl || openAiCompatBaseUrl(resolved.provider, resolved.ollamaUrl)
  const userContent = opts.imageBase64
    ? [
        { type: "text", text: opts.prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${opts.imageMediaType || "image/png"};base64,${opts.imageBase64}`,
          },
        },
      ]
    : opts.prompt

  const messages: any[] = []
  if (opts.system) messages.push({ role: "system", content: opts.system })
  messages.push({ role: "user", content: userContent })

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: resolved.model,
      messages,
      max_tokens: opts.maxTokens ?? 4000,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(
      `${resolved.provider} API error ${res.status}: ${body.slice(0, 300)}`
    )
  }

  const data = await res.json()
  await recordUsage(
    resolved.provider,
    resolved.model,
    data.usage?.prompt_tokens || 0,
    data.usage?.completion_tokens || 0,
    opts.command
  )

  const choice = data.choices?.[0]
  const content = String(choice?.message?.content || "").trim()
  const limit = opts.maxTokens ?? 4000

  // An empty reply is a failure, and callers that fall back to a template need
  // to be able to say which one. Handing back "" made a reasoning model that
  // spent its whole budget thinking — kimi-k2.7, k3: they emit reasoning before
  // a character of content — indistinguishable from a chatty model answering in
  // prose, and the tester was told the wrong thing about both.
  if (!content) {
    throw new Error(
      choice?.finish_reason === "length"
        ? `${resolved.provider} (${resolved.model}) reached its ${limit}-token ceiling before writing any answer`
        : `${resolved.provider} (${resolved.model}) returned an empty reply`
    )
  }

  // Truncated but not empty: the caller can usually salvage it, so return it
  // and put the real reason in the logs rather than leaving a "bad JSON" trail.
  if (choice?.finish_reason === "length") {
    console.warn(
      `[provider-chat] ${resolved.provider} (${resolved.model}) hit the ${limit}-token ceiling; the reply is cut off`
    )
  }

  return content
}

/**
 * Run a completion on the configured provider.
 * Throws when nothing is configured, so callers can fall back to their own
 * offline path rather than surfacing an error to the tester.
 */
export async function chatWithConfiguredProvider(opts: ChatOptions): Promise<string> {
  const resolved = await resolveProvider(opts.projectId)
  if (!resolved) throw new Error("No AI provider is configured")

  // Attach the QA skills that match this call's command (always on; see qa-skills.ts).
  const withSkills: ChatOptions = {
    ...opts,
    system: withQaSkills(opts.system, opts.command),
  }

  if (resolved.provider === "Anthropic") return callAnthropic(resolved, withSkills)
  // A baseUrl override means a custom gateway that may only speak /v1.
  if (resolved.provider === "Ollama" && !resolved.baseUrl) return callOllamaNative(resolved, withSkills)
  return callOpenAiCompatible(resolved, withSkills)
}
