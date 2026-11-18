import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, canUseProject } from "@/lib/api-guards"
import { runAgent, agentContext } from "@/lib/hub-agent"

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
    const userId = auth.session!.user.id
    const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null
    if (projectId && !(await canUseProject(projectId, userId, "read"))) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 })
    }

    // Each user has their own conversation.
    const historyRows = await prisma.agentChatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20
    })
    const history = historyRows.reverse().map((m) => ({ role: m.role, content: m.content }))

    await prisma.agentChatMessage.create({ data: { role: "user", content: message, userId } })

    const reply = await agentContext.run(
      { userId, userName: auth.session!.user.name || auth.session!.user.email, projectId },
      () => runAgent(history, message)
    )

    const assistantMessage = await prisma.agentChatMessage.create({
      data: {
        role: "assistant",
        content: reply.content,
        actions: reply.actions as any,
        userId
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
