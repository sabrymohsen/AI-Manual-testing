/**
 * POST /api/projects/[projectId]/ai-config/test
 *
 * Probes a provider key before it is saved (or re-tests the stored one) and
 * returns the account's real model list, so the picker only offers models the
 * key can actually call.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { getProjectAiCredentials } from "@/lib/ai/project-ai-config"
import { AI_PROVIDERS, testProviderConnection, type AiProvider } from "@/lib/hub-ai-providers"

const schema = z.object({
  provider: z.enum(AI_PROVIDERS),
  // Omit to test whatever is already stored for the project.
  apiKey: z.string().max(500).optional(),
})

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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

  const result = await testProviderConnection(provider, key)
  return NextResponse.json(result)
}
