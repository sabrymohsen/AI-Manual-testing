import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireBrdAccess, brdAudit } from "@/lib/brd/server"

// GET /api/brds/:brdId/annotations -> all annotations (visible to any viewer)
export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const annotations = await prisma.brdAnnotation.findMany({
    where: { brdId: params.brdId },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json({ annotations })
}

const schema = z.object({
  type: z.enum(["highlight", "comment", "rect", "sticky", "note"]),
  page: z.number().int().min(1).optional().nullable(),
  x: z.number().optional().nullable(),
  y: z.number().optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  text: z.string().max(2000).optional().nullable(),
})

// POST /api/brds/:brdId/annotations -> add an annotation (any project member)
export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const user = access.session!.user

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })

  const annotation = await prisma.brdAnnotation.create({
    data: {
      brdId: params.brdId,
      type: parsed.data.type,
      page: parsed.data.page ?? null,
      x: parsed.data.x ?? null,
      y: parsed.data.y ?? null,
      color: parsed.data.color ?? null,
      text: parsed.data.text ?? null,
      authorId: user.id,
      authorName: user.name || user.email,
    },
  })
  await brdAudit(params.brdId, "annotation_added", parsed.data.text?.slice(0, 80) || parsed.data.type, user)

  return NextResponse.json({ annotation }, { status: 201 })
}
