import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { desktopBridgeStatus } from "@/lib/ai/desktop-relay"

/**
 * "AI on this computer": the Ollama model on the user's own machine that their
 * AI requests use while their desktop app is open.
 *   GET -> { model, connected, models }   connected = desktop app bridge is online now
 *   PUT { model: string | null }          null turns it off
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const userId = auth.session!.user.id
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { localAiModel: true } })
  const bridge = await desktopBridgeStatus(userId)
  return NextResponse.json({ model: user?.localAiModel ?? null, connected: bridge.connected, models: bridge.models })
}

const body = z.object({ model: z.string().trim().min(1).max(200).nullable() })

export async function PUT(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "model must be a name or null" }, { status: 400 })
  await prisma.user.update({ where: { id: auth.session!.user.id }, data: { localAiModel: parsed.data.model } })
  return NextResponse.json({ model: parsed.data.model })
}
