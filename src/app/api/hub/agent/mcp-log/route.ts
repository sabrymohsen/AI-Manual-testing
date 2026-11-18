import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

// GET /api/hub/agent/mcp-log — the agent's real tool-call audit log
export async function GET(request: NextRequest) {
  // Logs across every user and project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

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
