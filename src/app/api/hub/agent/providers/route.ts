import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"
import { AI_PROVIDERS, PROVIDER_CATALOG, AiProvider } from "@/lib/hub-ai-providers"

export const dynamic = "force-dynamic"

function maskKey(key: string): string {
  if (!key) return ""
  if (key.length <= 8) return "••••••••"
  return `${key.slice(0, 4)}${"•".repeat(12)}${key.slice(-4)}`
}

// GET /api/hub/agent/providers — provider cards: catalog metadata merged with
// each provider's saved config (key masked). hasKey folds in the env fallback.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const rows = await prisma.aiProviderConfig.findMany()
  const byProvider = new Map(rows.map((r) => [r.provider, r]))

  const providers = AI_PROVIDERS.map((p) => {
    const meta = PROVIDER_CATALOG[p]
    const cfg = byProvider.get(p)
    const envKey = meta.keyEnv ? !!process.env[meta.keyEnv] : false
    return {
      provider: p,
      label: meta.label,
      local: meta.local,
      docsHint: meta.docsHint,
      models: meta.models,
      enabled: cfg?.enabled ?? false,
      model: cfg?.model || meta.models[0] || "",
      isDefault: cfg?.isDefault ?? false,
      apiKeyMasked: maskKey(cfg?.apiKey || ""),
      hasKey: !!cfg?.apiKey || envKey || meta.local,
      envKey
    }
  })

  return NextResponse.json({ providers })
}

// PUT /api/hub/agent/providers — upsert one provider's config.
// { provider, enabled?, apiKey?, model? }  (mask-only apiKey means "keep")
export async function PUT(request: NextRequest) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const provider = String(body.provider || "") as AiProvider
    if (!AI_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: `provider must be one of: ${AI_PROVIDERS.join(", ")}` }, { status: 400 })
    }

    const data: Record<string, any> = {}
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled)
    if (body.model !== undefined) data.model = String(body.model).slice(0, 80)
    if (body.apiKey !== undefined && !String(body.apiKey).includes("•")) {
      data.apiKey = String(body.apiKey).trim().slice(0, 300)
    }

    await prisma.aiProviderConfig.upsert({
      where: { provider },
      update: data,
      create: { provider, ...data }
    })

    return NextResponse.json({ saved: true })
  } catch (err: any) {
    console.error("PUT providers error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/hub/agent/providers — set the default provider (exclusive).
// { provider }
export async function POST(request: NextRequest) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const provider = String(body.provider || "") as AiProvider
    if (!AI_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: "invalid provider" }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.aiProviderConfig.updateMany({ data: { isDefault: false } }),
      prisma.aiProviderConfig.upsert({
        where: { provider },
        update: { isDefault: true, enabled: true },
        create: { provider, isDefault: true, enabled: true }
      })
    ])

    return NextResponse.json({ saved: true })
  } catch (err: any) {
    console.error("POST providers default error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
