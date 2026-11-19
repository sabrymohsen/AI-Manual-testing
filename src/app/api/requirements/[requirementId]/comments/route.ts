import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse } from "@/lib/api-guards"

async function guard(reqId: string) {
  const req = await prisma.requirement.findUnique({ where: { id: reqId }, select: { projectId: true } })
  if (!req) return { error: "Not found" }
  const auth = await requireProjectMember(req.projectId)
  if (auth.error) return { error: auth.error }
  return { ok: true }
}

// GET comments
export async function GET(_request: Request, { params }: { params: { requirementId: string } }) {
  const g = await guard(params.requirementId)
  if (g.error) return unauthorizedResponse(g.error)

  const comments = await prisma.requirementComment.findMany({
    where: { requirementId: params.requirementId },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json({ comments })
}

// POST comment
export async function POST(request: Request, { params }: { params: { requirementId: string } }) {
  const g = await guard(params.requirementId)
  if (g.error) return unauthorizedResponse(g.error)

  const body = await request.json().catch(() => ({}))
  const { author, content } = body
  if (!content?.trim() || !author?.trim()) {
    return NextResponse.json({ error: "Author and content required" }, { status: 400 })
  }

  const comment = await prisma.requirementComment.create({
    data: {
      requirementId: params.requirementId,
      author: author.trim(),
      content: content.trim(),
    },
  })
  return NextResponse.json({ comment }, { status: 201 })
}
