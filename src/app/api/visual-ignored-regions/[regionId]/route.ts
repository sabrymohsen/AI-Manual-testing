import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, canUseProject } from "@/lib/api-guards"

export async function DELETE(
  request: Request,
  { params }: { params: { regionId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const region = await prisma.visualIgnoredRegion.findUnique({
      where: { id: params.regionId },
      include: {
        mapping: {
          include: {
            project: { select: { userId: true } }
          }
        }
      }
    })

    if (!region) {
      return notFoundResponse("Ignored region not found")
    }

    if (!(await canUseProject(region.mapping.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    await prisma.visualIgnoredRegion.delete({
      where: { id: params.regionId }
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete ignored region" }, { status: 500 })
  }
}
