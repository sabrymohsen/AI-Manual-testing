import { NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, guardVisualScreen } from "@/lib/visual-tests/access"
import { fileBugFromScreen } from "@/lib/visual-tests/bug"

const schema = z.object({
  title: z.string().max(300).optional(),
  severity: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  notes: z.string().max(5000).optional(),
})

export async function POST(req: Request, { params }: { params: { screenId: string } }) {
  const g = await guardVisualScreen(params.screenId)
  if (!g.ok) return g.response
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map(e => e.message).join(", ") }, { status: 400 })
  try {
    const result = await fileBugFromScreen({ screenId: params.screenId, userId: g.session.user.id, ...parsed.data })
    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (err) {
    return errorResponse(err, "Could not file the bug")
  }
}
