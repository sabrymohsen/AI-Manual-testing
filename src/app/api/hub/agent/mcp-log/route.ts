import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

// GET /api/hub/agent/mcp-log — the agent's real tool-call audit log
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const calls = await prisma.agentToolCall.findMany({
      orderBy: { createdAt: "desc" },
      take: 50
    })
    return NextResponse.json({ calls })
  } catch (err: any) {
    console.error("GET agent mcp-log error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
