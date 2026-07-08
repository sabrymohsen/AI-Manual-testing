import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { AI_PROVIDERS, AiProvider, testProviderConnection } from "@/lib/hub-ai-providers"

export const dynamic = "force-dynamic"

// POST /api/hub/agent/providers/test  { provider, apiKey? }
// Real reachability + credential check. Uses the provided key, else the saved
// key, else the env fallback (handled inside testProviderConnection).
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

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

  const result = await testProviderConnection(provider, apiKey)
  return NextResponse.json(result)
}
