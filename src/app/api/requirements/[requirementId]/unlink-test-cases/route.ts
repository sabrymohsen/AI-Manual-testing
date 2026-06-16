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
    const { testCaseIds } = body

    if (!testCaseIds || !Array.isArray(testCaseIds)) {
      return NextResponse.json({ error: "testCaseIds is required and must be an array" }, { status: 400 })
    }

    await prisma.testCaseRequirement.deleteMany({
      where: {
        requirementId: params.requirementId,
        testCaseId: { in: testCaseIds }
      }
    })

    return NextResponse.json({ message: "Test cases unlinked successfully" })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to unlink test cases" },
      { status: 500 }
    )
  }
}
