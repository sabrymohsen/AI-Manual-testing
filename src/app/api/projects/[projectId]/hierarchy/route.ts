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
