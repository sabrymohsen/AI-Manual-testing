import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export const dynamic = "force-dynamic"

// GET /api/hub/agent/history — chat history (oldest first)
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const messages = await prisma.agentChatMessage.findMany({
      orderBy: { createdAt: "asc" },
      take: 200
    })
    return NextResponse.json({ messages })
  } catch (err: any) {
    console.error("GET agent history error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/hub/agent/history — clear the conversation (the MCP tool-call
// audit log is intentionally preserved)
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    await prisma.agentChatMessage.deleteMany({})
    return NextResponse.json({ cleared: true })
  } catch (err: any) {
    console.error("DELETE agent history error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
