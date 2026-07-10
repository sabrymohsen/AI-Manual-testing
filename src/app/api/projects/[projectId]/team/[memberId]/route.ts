import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { z } from "zod"

const patchSchema = z.object({
  role: z.string().max(100).optional().nullable(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  active: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: { projectId: string; memberId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const existing = await prisma.projectTeamMember.findFirst({
    where: { id: params.memberId, projectId: params.projectId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })

  const member = await prisma.projectTeamMember.update({
    where: { id: params.memberId },
    data: parsed.data,
  })
  return NextResponse.json({ member })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { projectId: string; memberId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const existing = await prisma.projectTeamMember.findFirst({
    where: { id: params.memberId, projectId: params.projectId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  await prisma.projectTeamMember.delete({ where: { id: params.memberId } })
  return NextResponse.json({ success: true })
}
