import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"

// GET /api/requirements/[requirementId]/subtasks
export async function GET(_request: Request, { params }: { params: { requirementId: string } }) {
  const subtasks = await prisma.requirementSubtask.findMany({
    where: { requirementId: params.requirementId },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json({ subtasks })
}

// POST /api/requirements/[requirementId]/subtasks
export async function POST(request: Request, { params }: { params: { requirementId: string } }) {
  const req = await prisma.requirement.findUnique({ where: { id: params.requirementId }, select: { projectId: true } })
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const auth = await requireProjectOwner(req.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json().catch(() => ({}))
  const { title, assignee } = body
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 })

  const count = await prisma.requirementSubtask.count({ where: { requirementId: params.requirementId } })
  const subtask = await prisma.requirementSubtask.create({
    data: {
      requirementId: params.requirementId,
      title: title.trim(),
      assignee: assignee?.trim() || null,
      orderIndex: count,
    },
  })
  return NextResponse.json({ subtask }, { status: 201 })
}
