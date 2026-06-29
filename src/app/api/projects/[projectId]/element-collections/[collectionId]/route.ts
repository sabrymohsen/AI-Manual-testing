import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string; collectionId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const collection = await prisma.elementCollection.findFirst({
    where: { id: params.collectionId, projectId: params.projectId },
    include: { elements: { orderBy: { createdAt: "asc" } } },
  })
  if (!collection) return notFoundResponse("Collection not found")
  return NextResponse.json({ collection })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string; collectionId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const collection = await prisma.elementCollection.findFirst({
    where: { id: params.collectionId, projectId: params.projectId },
  })
  if (!collection) return notFoundResponse("Collection not found")

  // Detach locators (collectionId is SetNull-on-delete) then remove the collection.
  await prisma.elementCollection.delete({ where: { id: params.collectionId } })
  return NextResponse.json({ success: true })
}
