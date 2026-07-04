import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { createEpicSchema } from "@/schemas"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const epics = await prisma.epic.findMany({
      where: { projectId: params.projectId },
      include: { _count: { select: { requirements: true } } },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
    })

    return NextResponse.json({ epics })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch epics" },
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
    const parsed = createEpicSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const { epicKey, title, description, priority, status, orderIndex } = parsed.data

    let key = epicKey?.trim()
    if (key) {
      const existing = await prisma.epic.findFirst({
        where: { projectId: params.projectId, epicKey: key }
      })
      if (existing) {
        return NextResponse.json(
          { error: `Epic key '${key}' already exists in this project.` },
          { status: 400 }
        )
      }
    } else {
      // Auto-generate EP-<n>, skipping keys already taken (incl. user-supplied ones)
      const existingKeys = new Set(
        (await prisma.epic.findMany({
          where: { projectId: params.projectId },
          select: { epicKey: true }
        })).map(e => e.epicKey)
      )
      let n = existingKeys.size + 1
      while (existingKeys.has(`EP-${n}`)) n++
      key = `EP-${n}`
    }

    const epic = await prisma.epic.create({
      data: {
        projectId: params.projectId,
        epicKey: key,
        title: title.trim(),
        description: description || null,
        priority: priority || "Medium",
        status: status || "Active",
        orderIndex: orderIndex ?? 0
      },
      include: { _count: { select: { requirements: true } } }
    })

    return NextResponse.json({ epic }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create epic" },
      { status: 500 }
    )
  }
}
