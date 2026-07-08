import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
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
    const models = await detectOllamaModels()
    return NextResponse.json({ models, detected: true })
  }
  return NextResponse.json({ models: PROVIDER_CATALOG[provider].models, detected: false })
}
