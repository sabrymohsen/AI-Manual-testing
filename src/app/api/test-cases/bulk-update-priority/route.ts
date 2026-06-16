import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { testCaseIds, priority } = body

    if (!testCaseIds || !Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      return NextResponse.json({ error: "No test case IDs provided" }, { status: 400 })
    }

    if (!priority) {
      return NextResponse.json({ error: "priority is required" }, { status: 400 })
    }

    const result = await prisma.testCase.updateMany({
      where: {
        id: { in: testCaseIds },
        project: { userId: session.user.id }
      },
      data: {
        priority: priority as any
      }
    })

    return NextResponse.json({
      success: true,
      count: result.count
    })
  } catch (error: any) {
    console.error("Bulk update priority error:", error)
    return NextResponse.json({ error: error.message || "Failed to update priorities" }, { status: 500 })
  }
}
