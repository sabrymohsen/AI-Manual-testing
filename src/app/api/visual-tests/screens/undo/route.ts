import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { errorResponse, guardProject } from "@/lib/visual-tests/access"
import { undoAutoResolutions } from "@/lib/visual-tests/review"

const schema = z.object({ screenIds: z.array(z.string()).min(1).max(2000) })

/** Undo decisions made by auto-maintenance. All screens must belong to one project the caller can see. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Choose the screens to undo" }, { status: 400 })
  try {
    const rows = await prisma.visualScreen.findMany({
      where: { id: { in: parsed.data.screenIds } },
      select: { id: true, run: { select: { projectId: true } } },
    })
    const projectIds = [...new Set(rows.map(r => r.run.projectId))]
    if (projectIds.length !== 1) return NextResponse.json({ error: "Screens not found" }, { status: 404 })
    const g = await guardProject(projectIds[0])
    if (!g.ok) return g.response
    const result = await undoAutoResolutions(rows.map(r => r.id))
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err, "Could not undo")
  }
}
