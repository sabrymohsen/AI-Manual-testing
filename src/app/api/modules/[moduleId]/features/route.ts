import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { moduleId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const module = await prisma.projectModule.findFirst({
      where: { id: params.moduleId, project: { userId: auth.session!.user.id } }
    })
    if (!module) {
      return notFoundResponse("Module not found")
    }

    const features = await prisma.projectFeature.findMany({
      where: { moduleId: params.moduleId },
      include: {
        _count: {
          select: {
            components: true,
            testCases: true
          }
        }
      },
      orderBy: { orderIndex: "asc" }
    })
    return NextResponse.json({ features })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch features" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { moduleId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const parentModule = await prisma.projectModule.findFirst({
      where: { id: params.moduleId, project: { userId: auth.session!.user.id } }
    })
    if (!parentModule) {
      return notFoundResponse("Module not found")
    }

    const body = await request.json()
    if (!body.name) {
      return badRequestResponse("Feature name is required")
    }

    const newFeature = await prisma.projectFeature.create({
      data: {
        moduleId: params.moduleId,
        projectId: parentModule.projectId,
        name: body.name,
        description: body.description || null,
        orderIndex: typeof body.orderIndex === "number" ? body.orderIndex : 0
      }
    })
    return NextResponse.json({ feature: newFeature }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create feature" }, { status: 500 })
  }
}
