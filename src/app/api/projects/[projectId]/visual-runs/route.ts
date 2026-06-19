import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const runs = await prisma.visualCheckRun.findMany({
      where: {
        projectId: params.projectId,
      },
      include: {
        mapping: {
          include: {
            figmaFrame: true
          }
        }
      },
      orderBy: { startedAt: "desc" }
    })

    return NextResponse.json({ runs })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch runs history" }, { status: 500 })
  }
}
