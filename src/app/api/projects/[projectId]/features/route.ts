import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"

const createFeatureSchema = z.object({
  featureKey: z.string().max(100).optional(),
  name: z.string().min(1, "Name is required").max(300),
  description: z.string().optional().nullable(),
  epicId: z.string().optional().nullable(),
  orderIndex: z.number().int().optional(),
})

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const features = await prisma.feature.findMany({
      where: { projectId: params.projectId },
      include: {
        epic: { select: { id: true, epicKey: true, title: true } },
        _count: { select: { requirements: true } }
      },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
    })
    return NextResponse.json({ features })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch features" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const parsed = createFeatureSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const { featureKey, name, description, epicId, orderIndex } = parsed.data

    if (epicId) {
      const epic = await prisma.epic.findFirst({ where: { id: epicId, projectId: params.projectId } })
      if (!epic) return badRequestResponse("Epic not found in this project")
    }

    let key = featureKey?.trim()
    if (key) {
      const existing = await prisma.feature.findFirst({
        where: { projectId: params.projectId, featureKey: key }
      })
      if (existing) {
        return NextResponse.json(
          { error: `Feature key '${key}' already exists in this project.` },
          { status: 400 }
        )
      }
    } else {
      const existingKeys = new Set(
        (await prisma.feature.findMany({
          where: { projectId: params.projectId },
          select: { featureKey: true }
        })).map(f => f.featureKey)
      )
      let n = existingKeys.size + 1
      while (existingKeys.has(`FT-${n}`)) n++
      key = `FT-${n}`
    }

    const feature = await prisma.feature.create({
      data: {
        projectId: params.projectId,
        featureKey: key,
        name: name.trim(),
        description: description || null,
        epicId: epicId || null,
        orderIndex: orderIndex ?? 0
      },
      include: {
        epic: { select: { id: true, epicKey: true, title: true } },
        _count: { select: { requirements: true } }
      }
    })

    return NextResponse.json({ feature }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create feature" },
      { status: 500 }
    )
  }
}
