import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { runAgent } from "@/lib/hub-agent"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // run_test can wait ~75s per test

// POST /api/hub/agent/chat — send a message, get the agent's reply.
// The agent runs a real tool loop (list/run/diagnose tests, etc.) against the
// configured provider, or a deterministic offline mode when no key is set.
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const message = String(body.message ?? body.content ?? "").trim()
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 })
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: "message too long (max 4000 chars)" }, { status: 400 })
    }

    // Conversation context: last 20 persisted messages
    const historyRows = await prisma.agentChatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 20
    })
    const history = historyRows.reverse().map((m) => ({ role: m.role, content: m.content }))

    await prisma.agentChatMessage.create({ data: { role: "user", content: message } })

    const reply = await runAgent(history, message)

    const assistantMessage = await prisma.agentChatMessage.create({
      data: {
        role: "assistant",
        content: reply.content,
        actions: reply.actions as any
      }
    })

    return NextResponse.json({
      message: {
        id: assistantMessage.id,
        role: "assistant",
        content: reply.content,
        actions: reply.actions,
        createdAt: assistantMessage.createdAt
      },
      toolsUsed: reply.toolsUsed
    })
  } catch (err: any) {
    console.error("POST agent chat error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
