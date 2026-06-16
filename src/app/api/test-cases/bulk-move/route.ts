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
    const {
      testCaseIds,
      targetProjectId,
      targetModuleId,
      targetFeatureId,
      targetComponentId
    } = body

    if (!testCaseIds || !Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      return NextResponse.json({ error: "No test case IDs provided" }, { status: 400 })
    }

    if (!targetProjectId) {
      return NextResponse.json({ error: "targetProjectId is required" }, { status: 400 })
    }

    // Retrieve the target module's name to update the module string column in TestCase if needed
    let moduleName: string | null = null
    if (targetModuleId) {
      const mod = await prisma.projectModule.findUnique({
        where: { id: targetModuleId }
      })
      moduleName = mod?.name || null
    }

    // Update all test cases
    const result = await prisma.testCase.updateMany({
      where: {
        id: { in: testCaseIds },
        project: { userId: session.user.id }
      },
      data: {
        projectId: targetProjectId,
        moduleId: targetModuleId || null,
        featureId: targetFeatureId || null,
        componentId: targetComponentId || null,
        module: moduleName || null
      }
    })

    return NextResponse.json({
      success: true,
      count: result.count
    })
  } catch (error: any) {
    console.error("Bulk move error:", error)
    return NextResponse.json({ error: error.message || "Failed to bulk move test cases" }, { status: 500 })
  }
}
