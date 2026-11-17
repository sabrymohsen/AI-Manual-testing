import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { COMMAND_LABELS, QA_SKILLS } from "@/lib/ai/qa-skills"

export const dynamic = "force-dynamic"

// GET /api/hub/agent/skills — the QA skills the app's AI always applies, read-only.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  return NextResponse.json({
    skills: QA_SKILLS.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      instructions: s.instructions,
      usedBy: s.commands.map((c) => COMMAND_LABELS[c] || c),
    })),
  })
}
