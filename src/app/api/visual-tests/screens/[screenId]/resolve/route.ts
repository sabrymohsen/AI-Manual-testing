import { NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, guardVisualScreen } from "@/lib/visual-tests/access"
import { resolveScreen } from "@/lib/visual-tests/review"

const schema = z.object({
  action: z.enum(["accept", "reject"]),
  // Which other screens showing the same change get the same decision.
  scope: z.enum(["none", "run", "test"]).default("run"),
})

export async function POST(req: Request, { params }: { params: { screenId: string } }) {
  const g = await guardVisualScreen(params.screenId)
  if (!g.ok) return g.response
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Choose accept or reject" }, { status: 400 })
  try {
    const result = await resolveScreen({ screenId: params.screenId, action: parsed.data.action, scope: parsed.data.scope, userId: g.session.user.id })
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err, "Could not save the decision")
  }
}
