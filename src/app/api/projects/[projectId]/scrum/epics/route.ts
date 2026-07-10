import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner } from "@/lib/api-guards"
import { z } from "zod"

const schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const epics = await prisma.scrumEpic.findMany({
    where: { projectId: params.projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { tasks: true } } },
  })
  return NextResponse.json({ epics })
}

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const epic = await prisma.scrumEpic.create({
    data: {
      projectId: params.projectId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      color: parsed.data.color ?? "#3B82F6",
    },
    include: { _count: { select: { tasks: true } } },
  })
  return NextResponse.json({ epic }, { status: 201 })
}
