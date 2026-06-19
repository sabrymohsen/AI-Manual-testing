import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { featureId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const feature = await prisma.projectFeature.findFirst({
      where: { id: params.featureId, project: { userId: auth.session!.user.id } }
    })
    if (!feature) {
      return notFoundResponse("Feature not found")
    }

    const components = await prisma.projectComponent.findMany({
      where: { featureId: params.featureId },
      include: {
        _count: {
          select: {
            testCases: true
          }
        }
      },
      orderBy: { orderIndex: "asc" }
    })
    return NextResponse.json({ components })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch components" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { featureId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const parentFeature = await prisma.projectFeature.findFirst({
      where: { id: params.featureId, project: { userId: auth.session!.user.id } }
    })
    if (!parentFeature) {
      return notFoundResponse("Feature not found")
    }

    const body = await request.json()
    if (!body.name) {
      return badRequestResponse("Component name is required")
    }

    const newComponent = await prisma.projectComponent.create({
      data: {
        featureId: params.featureId,
        moduleId: parentFeature.moduleId,
        projectId: parentFeature.projectId,
        name: body.name,
        description: body.description || null,
        orderIndex: typeof body.orderIndex === "number" ? body.orderIndex : 0
      }
    })
    return NextResponse.json({ component: newComponent }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create component" }, { status: 500 })
  }
}
