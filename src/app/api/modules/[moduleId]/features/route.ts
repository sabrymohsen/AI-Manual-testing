import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  _request: Request,
  { params }: { params: { moduleId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
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
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const parentModule = await prisma.projectModule.findUnique({
      where: { id: params.moduleId }
    })
    if (!parentModule) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 })
    }

    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: "Feature name is required" }, { status: 400 })
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
