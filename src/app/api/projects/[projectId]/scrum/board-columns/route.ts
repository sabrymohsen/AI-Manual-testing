import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner } from "@/lib/api-guards"
import { z } from "zod"
import { ensureBoardColumns } from "@/lib/scrum/server"

const schema = z.object({
  name: z.string().min(1).max(100),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "REVIEW", "TESTING", "DEPLOYED"]),
  wipLimit: z.number().int().min(0).optional().nullable(),
})

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const columns = await ensureBoardColumns(params.projectId)
  return NextResponse.json({ columns })
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

  const last = await prisma.boardColumn.aggregate({
    where: { projectId: params.projectId },
    _max: { order: true },
  })
  const column = await prisma.boardColumn.create({
    data: {
      projectId: params.projectId,
      name: parsed.data.name,
      status: parsed.data.status,
      wipLimit: parsed.data.wipLimit ?? null,
      order: (last._max.order ?? -1) + 1,
    },
  })
  return NextResponse.json({ column }, { status: 201 })
}
