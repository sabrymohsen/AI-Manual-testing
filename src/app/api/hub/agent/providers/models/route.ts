import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { AI_PROVIDERS, PROVIDER_CATALOG, AiProvider, detectOllamaModels } from "@/lib/hub-ai-providers"

export const dynamic = "force-dynamic"

// GET /api/hub/agent/providers/models?provider=Ollama
// Returns the selectable models for a provider. Ollama is auto-detected from
// the local daemon; the rest come from the static catalog.
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const provider = String(request.nextUrl.searchParams.get("provider") || "") as AiProvider
  if (!AI_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "invalid provider" }, { status: 400 })
  }

  if (provider === "Ollama") {
    const saved = await prisma.aiProviderConfig.findUnique({ where: { provider: "Ollama" }, select: { baseUrl: true } })
    const models = await detectOllamaModels(saved?.baseUrl)
    // Empty means Ollama is down or has no models — the UI says so instead of
    // offering models that aren't installed.
    return NextResponse.json({ models, detected: true, reachable: models.length > 0 })
  }
  return NextResponse.json({ models: PROVIDER_CATALOG[provider].models, detected: false })
}
