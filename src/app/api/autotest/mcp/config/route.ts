import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { serverUrl, provider, apiKey, permissionLevel } = body

    if (!serverUrl || !provider || !permissionLevel) {
      return NextResponse.json({ error: "Missing required config parameters" }, { status: 400 })
    }

    let config = await prisma.mcpConfig.findFirst()
    if (config) {
      config = await prisma.mcpConfig.update({
        where: { id: config.id },
        data: { serverUrl, provider, apiKey: apiKey || config.apiKey, permissionLevel }
      })
    } else {
      config = await prisma.mcpConfig.create({
        data: { serverUrl, provider, apiKey: apiKey || "", permissionLevel }
      })
    }

    return NextResponse.json({ config })
  } catch (err: any) {
    console.error("POST mcp config update error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
