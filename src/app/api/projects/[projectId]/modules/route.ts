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

  try {
    const modules = await prisma.projectModule.findMany({
      where: { projectId: params.projectId },
      include: {
        _count: {
          select: {
            features: true,
            components: true,
            testCases: true
          }
        }
      },
      orderBy: { orderIndex: "asc" }
    })
    return NextResponse.json({ modules })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch modules" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: "Module name is required" }, { status: 400 })
    }

    const newModule = await prisma.projectModule.create({
      data: {
        projectId: params.projectId,
        name: body.name,
        description: body.description || null,
        orderIndex: typeof body.orderIndex === "number" ? body.orderIndex : 0
      }
    })
    return NextResponse.json({ module: newModule }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create module" }, { status: 500 })
  }
}
