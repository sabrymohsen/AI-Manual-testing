import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function POST(
  request: Request,
  { params }: { params: { requirementId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { bugReportIds } = body

    if (!bugReportIds || !Array.isArray(bugReportIds)) {
      return NextResponse.json({ error: "bugReportIds is required and must be an array" }, { status: 400 })
    }

    await prisma.bugReportRequirement.deleteMany({
      where: {
        requirementId: params.requirementId,
        bugReportId: { in: bugReportIds }
      }
    })

    return NextResponse.json({ message: "Bugs unlinked successfully" })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to unlink bugs" },
      { status: 500 }
    )
  }
}
