import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"


export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let config = await prisma.mcpConfig.findFirst()
    if (!config) {
      config = await prisma.mcpConfig.create({
        data: {
          serverUrl: "http://localhost:4000",
          provider: "Gemini",
          apiKey: "••••••••••••••••••••",
          permissionLevel: "Can Execute Tests"
        }
      })
    }

    const activities = await prisma.mcpActivity.findMany({
      orderBy: { createdAt: "desc" }
    })

    // No invented sample rows: an empty table means nothing has been recorded yet.

    return NextResponse.json({
      config,
      activities
    })
  } catch (err: any) {
    console.error("GET mcp config and logs error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
