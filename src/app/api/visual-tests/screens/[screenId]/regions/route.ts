import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { errorResponse, guardVisualScreen } from "@/lib/visual-tests/access"
import { recompareScreens } from "@/lib/visual-tests/compare-service"

const schema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(2),
  height: z.number().int().min(2),
  allPages: z.boolean().default(false),
  allEnvironments: z.boolean().default(false),
  note: z.string().max(300).optional(),
})

/**
 * Add an ignore region drawn on this screen, then re-compare every screen of
 * this run it applies to, so the effect is visible at once (a banner ignored on
 * all pages clears all those screens in one go).
 */
export async function POST(req: Request, { params }: { params: { screenId: string } }) {
  const g = await guardVisualScreen(params.screenId)
  if (!g.ok) return g.response
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Draw a box on the screenshot first" }, { status: 400 })
  const s = g.record
  const body = parsed.data
  try {
    const region = await prisma.visualTestRegion.create({
      data: {
        visualTestId: s.visualTestId,
        screenKey: body.allPages ? null : s.screenKey,
        envKey: body.allEnvironments ? null : s.envKey,
        x: body.x,
        y: body.y,
        width: body.width,
        height: body.height,
        note: body.note || null,
        createdById: g.session.user.id,
      },
    })
    const affected = await prisma.visualScreen.findMany({
      where: {
        runId: s.runId,
        status: { in: ["Unresolved", "Passed"] },
        ...(body.allPages ? {} : { screenKey: s.screenKey }),
        ...(body.allEnvironments ? {} : { envKey: s.envKey }),
      },
      select: { id: true },
      take: 500,
    })
    const updated = await recompareScreens(affected.map(a => a.id))
    return NextResponse.json({ region, updated }, { status: 201 })
  } catch (err) {
    return errorResponse(err, "Could not add the region")
  }
}
