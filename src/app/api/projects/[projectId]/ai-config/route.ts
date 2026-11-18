/**
 * GET/PUT/DELETE /api/projects/[projectId]/ai-config
 *
 * The project's own AI provider (key, model). Resolution for any AI call is
 * this row -> the workspace-wide AiProviderConfig -> the provider's key env var,
 * so clearing it here falls back rather than turning AI off.
 *
 * The key is encrypted at rest and never returned.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import {
  requireProjectMember,
  requireProjectOwner,
} from "@/lib/api-guards"
import {
  deleteProjectAiConfig,
  getProjectAiSettings,
  saveProjectAiConfig,
} from "@/lib/ai/project-ai-config"
import { resolveProvider } from "@/lib/ai/provider-chat"
import { AI_PROVIDERS, PROVIDER_CATALOG, ollamaBaseUrl, ollamaUrlError, type AiProvider } from "@/lib/hub-ai-providers"
import { prisma } from "@/lib/db"

const schema = z.object({
  provider: z.enum(AI_PROVIDERS),
  enabled: z.boolean().optional(),
  model: z.string().max(200).optional(),
  // Omitted keeps the stored key; "" clears it.
  apiKey: z.string().max(500).optional(),
  // Ollama only. "" = use the workspace / server default.
  baseUrl: z.string().max(300).optional(),
})

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  // Member-level: testers need to see whether AI is on for this project.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const config = await getProjectAiSettings(params.projectId)
  // What an AI call in this project would actually use right now, including
  // anything inherited — so the page can say "using the workspace key".
  const effective = await resolveProvider(params.projectId)
  // The Ollama address used when this project doesn't set its own.
  const workspaceOllama = await prisma.aiProviderConfig
    .findUnique({ where: { provider: "Ollama" }, select: { baseUrl: true } })
    .catch(() => null)

  return NextResponse.json({
    config,
    effective: effective
      ? {
          provider: effective.provider,
          model: effective.model,
          // Ollama needs no key, so "has a project row" is what makes it the project's own.
          inherited: effective.provider === "Ollama" ? !(config?.enabled && config.provider === "Ollama") : !config?.hasKey,
        }
      : null,
    ollamaDefaultUrl: ollamaBaseUrl(workspaceOllama?.baseUrl),
    catalog: AI_PROVIDERS.map((p) => ({
      provider: p,
      label: PROVIDER_CATALOG[p].label,
      models: PROVIDER_CATALOG[p].models,
      local: PROVIDER_CATALOG[p].local,
      docsHint: PROVIDER_CATALOG[p].docsHint,
    })),
  })
}

export async function PUT(req: Request, { params }: { params: { projectId: string } }) {
  // Owner-level: storing a billable credential is not a tester's call.
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const provider = parsed.data.provider as AiProvider
  const meta = PROVIDER_CATALOG[provider]

  if (parsed.data.baseUrl !== undefined) {
    const urlError = ollamaUrlError(parsed.data.baseUrl)
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })
  }

  // A cloud provider with no key here and none in the environment would save a
  // config that can never run — say so instead of failing later at generation.
  if (!meta.local && parsed.data.apiKey === "" ) {
    const envKey = meta.keyEnv ? process.env[meta.keyEnv] : ""
    if (!envKey) {
      return NextResponse.json(
        { error: `${meta.label} needs an API key (or ${meta.keyEnv} set on the server).` },
        { status: 400 }
      )
    }
  }

  const config = await saveProjectAiConfig(params.projectId, parsed.data)
  return NextResponse.json({ config })
}

export async function DELETE(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  await deleteProjectAiConfig(params.projectId)
  return NextResponse.json({ success: true })
}
