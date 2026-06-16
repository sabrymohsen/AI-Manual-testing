import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  _request: Request,
  { params }: { params: { featureId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
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
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const parentFeature = await prisma.projectFeature.findUnique({
      where: { id: params.featureId }
    })
    if (!parentFeature) {
      return NextResponse.json({ error: "Feature not found" }, { status: 404 })
    }

    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: "Component name is required" }, { status: 400 })
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
