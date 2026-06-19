import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { createModuleSchema } from "@/schemas"
import { z } from "zod"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const createModuleBodySchema = createModuleSchema.extend({
      orderIndex: z.number().optional(),
    })
    const parsed = createModuleBodySchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const newModule = await prisma.projectModule.create({
      data: {
        projectId: params.projectId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        orderIndex: parsed.data.orderIndex ?? 0
      }
    })
    return NextResponse.json({ module: newModule }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create module" }, { status: 500 })
  }
}
