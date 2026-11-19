import { NextResponse } from "next/server"
import { unauthorizedResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { prisma } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const project = await prisma.project.findUnique({
    where: { id: params.projectId }
  })
  if (!project) return notFoundResponse("Project not found")

  const credentials = await prisma.projectCredential.findMany({
    where: { projectId: params.projectId },
    select: { id: true, roleName: true, username: true }
  })

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      baseUrl: project.webAppUrl
    },
    environments: ["Dev", "Staging", "UAT", "Production"],
    credentials
  })
}
