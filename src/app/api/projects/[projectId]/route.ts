import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const project = await prisma.project.findFirst({
    where: { id: params.projectId, userId: session.user.id },
    include: {
      credentials: {
        select: {
          id: true,
          roleName: true,
          username: true,
          loginUrl: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      figmaConfig: true,
      _count: {
        select: {
          testCases: true,
          testRuns: true,
        },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  return NextResponse.json({ project })
}

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const project = await prisma.project.findFirst({
    where: { id: params.projectId, userId: session.user.id },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const body = await request.json()
  const updated = await prisma.project.update({
    where: { id: params.projectId },
    data: body,
  })

  return NextResponse.json({ project: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const project = await prisma.project.findFirst({
    where: { id: params.projectId, userId: session.user.id },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  await prisma.project.delete({ where: { id: params.projectId } })

  return NextResponse.json({ success: true })
}
