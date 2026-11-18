import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"
import { getAgentSettings, DEFAULT_MODELS } from "@/lib/hub-agent"

export const dynamic = "force-dynamic"

const PROVIDERS = ["Anthropic", "OpenAI", "Gemini", "Ollama"]
const PERMISSIONS = ["Read-Only", "Execute Tests", "Full Control"]

function maskKey(key: string): string {
  if (!key) return ""
  if (key.length <= 8) return "••••••••"
  return `${key.slice(0, 4)}${"•".repeat(12)}${key.slice(-4)}`
}

// GET /api/hub/agent/settings — current settings (API key masked) + MCP status
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const settings = await getAgentSettings()

    // The MCP tool server is embedded in this app. For Ollama also probe the
    // local daemon so the settings modal can show provider reachability.
    let providerReachable: boolean | null = null
    if (settings.provider === "Ollama") {
      try {
        const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(1500) })
        providerReachable = res.ok
      } catch {
        providerReachable = false
      }
    }

    const hasKey =
      settings.apiKey.length > 0 ||
      (settings.provider === "Anthropic" && !!process.env.ANTHROPIC_API_KEY) ||
      settings.provider === "Ollama"

    return NextResponse.json({
      settings: {
        provider: settings.provider,
        model: settings.model,
        permission: settings.permission,
        apiKeyMasked: maskKey(settings.apiKey),
        hasKey
      },
      providers: PROVIDERS,
      permissions: PERMISSIONS,
      models: DEFAULT_MODELS,
      mcp: {
        status: "running",
        transport: "embedded",
        toolCount: 8,
        providerReachable
      }
    })
  } catch (err: any) {
    console.error("GET agent settings error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/hub/agent/settings — update settings
export async function PUT(request: NextRequest) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const data: Record<string, string> = {}

    if (body.provider !== undefined) {
      if (!PROVIDERS.includes(body.provider)) {
        return NextResponse.json({ error: `provider must be one of: ${PROVIDERS.join(", ")}` }, { status: 400 })
      }
      data.provider = body.provider
    }
    if (body.permission !== undefined) {
      if (!PERMISSIONS.includes(body.permission)) {
        return NextResponse.json({ error: `permission must be one of: ${PERMISSIONS.join(", ")}` }, { status: 400 })
      }
      data.permission = body.permission
    }
    if (body.model !== undefined) {
      data.model = String(body.model).slice(0, 80)
    }
    // A value that is only mask characters means "keep the existing key"
    if (body.apiKey !== undefined && !/^[•*]*$/.test(String(body.apiKey)) && !String(body.apiKey).includes("•")) {
      data.apiKey = String(body.apiKey).trim().slice(0, 300)
    }

    await prisma.agentSettings.upsert({
      where: { id: "agent-settings" },
      update: data,
      create: { id: "agent-settings", ...data }
    })

    return NextResponse.json({ saved: true })
  } catch (err: any) {
    console.error("PUT agent settings error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
