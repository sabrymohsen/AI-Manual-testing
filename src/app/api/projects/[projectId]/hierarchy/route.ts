import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

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
        features: {
          include: {
            components: {
              orderBy: { orderIndex: "asc" }
            }
          },
          orderBy: { orderIndex: "asc" }
        }
      },
      orderBy: { orderIndex: "asc" }
    })

    return NextResponse.json({ modules })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch project hierarchy" }, { status: 500 })
  }
}
