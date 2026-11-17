import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, badRequestResponse, canUseProject } from "@/lib/api-guards"
import { z } from "zod"

const bodySchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  reason: z.string().optional(),
  appliesToViewport: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: { mappingId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const mapping = await prisma.visualCheckMapping.findUnique({
      where: { id: params.mappingId },
      include: {
        project: { select: { userId: true } }
      }
    })

    if (!mapping) {
      return notFoundResponse("Visual mapping not found")
    }

    if (!(await canUseProject(mapping.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    const rawBody = await request.json()
    const parseResult = bodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
    }
    const body = rawBody
    const { x, y, width, height, reason, appliesToViewport } = body

    if (x === undefined || y === undefined || width === undefined || height === undefined) {
      return NextResponse.json({ error: "Coordinates are incomplete" }, { status: 400 })
    }

    const ignoredRegion = await prisma.visualIgnoredRegion.create({
      data: {
        mappingId: params.mappingId,
        x: Math.round(Number(x)),
        y: Math.round(Number(y)),
        width: Math.round(Number(width)),
        height: Math.round(Number(height)),
        reason: reason || "Ignored dynamic zone",
        appliesToViewport: appliesToViewport || null
      }
    })

    return NextResponse.json({ success: true, ignoredRegion })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to add ignored region" }, { status: 500 })
  }
}
