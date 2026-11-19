/**
 * POST /api/projects/[projectId]/ai-config/test
 *
 * Probes a provider key before it is saved (or re-tests the stored one) and
 * returns the account's real model list, so the picker only offers models the
 * key can actually call.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireProjectMember } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { getProjectAiCredentials } from "@/lib/ai/project-ai-config"
import { AI_PROVIDERS, ollamaUrlError, testProviderConnection, type AiProvider } from "@/lib/hub-ai-providers"

const schema = z.object({
  provider: z.enum(AI_PROVIDERS),
  // Omit to test whatever is already stored for the project.
  apiKey: z.string().max(500).optional(),
  // Ollama only: test this address instead of the stored one.
  baseUrl: z.string().max(300).optional(),
})

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  }

  const provider = parsed.data.provider as AiProvider
  let key = parsed.data.apiKey || ""
  if (!key) {
    const stored = await getProjectAiCredentials(params.projectId)
    if (stored?.provider === provider) key = stored.apiKey
  }

  let ollamaUrl: string | undefined
  if (provider === "Ollama") {
    const typed = parsed.data.baseUrl?.trim()
    if (typed) {
      const urlError = ollamaUrlError(typed)
      if (urlError) return NextResponse.json({ ok: false, detail: urlError })
      ollamaUrl = typed
    } else {
      // Same order the real calls use: project URL, then the workspace's.
      const [own, workspace] = await Promise.all([
        prisma.projectAiConfig.findUnique({ where: { projectId: params.projectId }, select: { baseUrl: true } }),
        prisma.aiProviderConfig.findUnique({ where: { provider: "Ollama" }, select: { baseUrl: true } }),
      ])
      ollamaUrl = own?.baseUrl || workspace?.baseUrl || undefined
    }
  }

  const result = await testProviderConnection(provider, key, { ollamaUrl })
  return NextResponse.json(result)
}
