import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"
import { AI_PROVIDERS, AiProvider, ollamaUrlError, testProviderConnection } from "@/lib/hub-ai-providers"

export const dynamic = "force-dynamic"

// POST /api/hub/agent/providers/test  { provider, apiKey? }
// Real reachability + credential check. Uses the provided key, else the saved
// key, else the env fallback (handled inside testProviderConnection).
export async function POST(request: NextRequest) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const provider = String(body.provider || "") as AiProvider
  if (!AI_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "invalid provider" }, { status: 400 })
  }

  let apiKey = String(body.apiKey || "")
  if (!apiKey || apiKey.includes("•")) {
    const cfg = await prisma.aiProviderConfig.findUnique({ where: { provider } })
    apiKey = cfg?.apiKey || ""
  }

  let ollamaUrl: string | undefined
  if (provider === "Ollama") {
    const typed = String(body.baseUrl || "").trim()
    if (typed) {
      const urlError = ollamaUrlError(typed)
      if (urlError) return NextResponse.json({ ok: false, detail: urlError })
      ollamaUrl = typed
    } else {
      ollamaUrl = (await prisma.aiProviderConfig.findUnique({ where: { provider: "Ollama" }, select: { baseUrl: true } }))?.baseUrl || undefined
    }
  }

  const result = await testProviderConnection(provider, apiKey, { ollamaUrl })
  return NextResponse.json(result)
}
