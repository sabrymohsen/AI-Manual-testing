import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const credentials = await prisma.projectCredential.findMany({
    where: { projectId: params.projectId },
    select: {
      id: true,
      roleName: true,
      username: true,
      loginUrl: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ credentials })
}
