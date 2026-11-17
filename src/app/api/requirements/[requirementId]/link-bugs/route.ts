import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, badRequestResponse, canUseProject } from "@/lib/api-guards"
import { z } from "zod"

const bodySchema = z.object({
  bugReportIds: z.array(z.string()).min(1, "bugReportIds is required"),
})

export async function POST(
  request: Request,
  { params }: { params: { requirementId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.requirementId },
      include: { project: { select: { userId: true } } }
    })

    if (!requirement) {
      return notFoundResponse("Requirement not found")
    }

    if (!(await canUseProject(requirement.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    const rawBody = await request.json()
    const parseResult = bodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
    }
    const body = rawBody
    const { bugReportIds } = body

    if (!bugReportIds || !Array.isArray(bugReportIds)) {
      return NextResponse.json({ error: "bugReportIds is required and must be an array" }, { status: 400 })
    }

    const dataToInsert = bugReportIds.map((bugId) => ({
      requirementId: params.requirementId,
      bugReportId: bugId
    }))

    await prisma.bugReportRequirement.createMany({
      data: dataToInsert,
      skipDuplicates: true
    })

    return NextResponse.json({ message: "Bugs linked successfully" })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to link bugs" },
      { status: 500 }
    )
  }
}
