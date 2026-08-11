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
  type AiProvider,
} from "@/lib/hub-ai-providers"
import { getProjectAiCredentials } from "@/lib/ai/project-ai-config"

export interface ResolvedProvider {
  provider: AiProvider
  apiKey: string
  model: string
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
}

/**
 * The provider a call should use, most specific first:
 *   1. the project's own config (its AI Provider tab),
 *   2. the workspace-wide AiProviderConfig — default+enabled, else any enabled,
 *   3. any provider whose key env var is set.
 *
 * The env fallback means a deployment can supply the key (e.g. KIMI_API_KEY)
 * without writing it into AiProviderConfig.apiKey, a plaintext column.
 */
export async function resolveProvider(projectId?: string): Promise<ResolvedProvider | null> {
  if (projectId) {
    const own = await getProjectAiCredentials(projectId).catch(() => null)
    if (own) return own
  }

  const rows = await prisma.aiProviderConfig
    .findMany({ where: { enabled: true }, orderBy: { isDefault: "desc" } })
    .catch(() => [])

  for (const row of rows) {
    const meta = PROVIDER_CATALOG[row.provider as AiProvider]
    if (!meta) continue
    const key = row.apiKey || (meta.keyEnv ? process.env[meta.keyEnv] || "" : "")
    if (!key && !meta.local) continue
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

  return null
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
  const client = new Anthropic({ apiKey: resolved.apiKey })
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

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()
}

async function callOpenAiCompatible(
  resolved: ResolvedProvider,
  opts: ChatOptions
): Promise<string> {
  const baseUrl = openAiCompatBaseUrl(resolved.provider)
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

  return String(data.choices?.[0]?.message?.content || "").trim()
}

/**
 * Run a completion on the configured provider.
 * Throws when nothing is configured, so callers can fall back to their own
 * offline path rather than surfacing an error to the tester.
 */
export async function chatWithConfiguredProvider(opts: ChatOptions): Promise<string> {
  const resolved = await resolveProvider(opts.projectId)
  if (!resolved) throw new Error("No AI provider is configured")

  return resolved.provider === "Anthropic"
    ? callAnthropic(resolved, opts)
    : callOpenAiCompatible(resolved, opts)
}
