import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { updateProjectSchema } from "@/schemas"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse, badRequestResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)

  const project = await prisma.project.findFirst({
    where: { id: params.projectId, userId: auth.session!.user.id },
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
          credentials: true,
          requirements: true,
          bugReports: true,
        },
      },
    },
  })

  if (!project) {
    return notFoundResponse("Project not found")
  }

  return NextResponse.json({ project })
}

export async function PUT(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)

  const body = await request.json()
  const parsed = updateProjectSchema.safeParse(body)

  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }

  const updated = await prisma.project.update({
    where: { id: params.projectId },
    data: parsed.data,
  })

  return NextResponse.json({ project: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return auth.status === 404 ? notFoundResponse(auth.error) : unauthorizedResponse(auth.error)

  await prisma.project.delete({ where: { id: params.projectId } })

  return NextResponse.json({ success: true })
}
