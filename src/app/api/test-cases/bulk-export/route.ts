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
    const { testCaseIds } = body

    if (!testCaseIds || !Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      return NextResponse.json({ error: "No test case IDs provided" }, { status: 400 })
    }

    const testCases = await prisma.testCase.findMany({
      where: {
        id: { in: testCaseIds },
        project: { userId: session.user.id }
      },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
        requirements: {
          include: { requirement: true }
        },
        moduleRelation: true,
        feature: true,
        component: true,
        project: true
      }
    })

    const exported = testCases.map(tc => ({
      id: tc.id,
      title: tc.title,
      module: tc.module || "General",
      moduleName: tc.moduleRelation?.name || "",
      featureName: tc.feature?.name || "",
      componentName: tc.component?.name || "",
      priority: tc.priority,
      preconditions: tc.preconditions || "",
      source: tc.source,
      project: tc.project.name,
      steps: tc.steps.map(s => ({
        stepNumber: s.stepNumber,
        actionDescription: s.actionDescription,
        expectedResult: s.expectedResult,
        actionType: s.actionType,
        targetType: s.targetType,
        targetValue: s.targetValue || "",
        inputValue: s.inputValue || ""
      })),
      requirements: tc.requirements.map(r => r.requirement.requirementKey)
    }))

    return NextResponse.json({
      success: true,
      testCases: exported
    })
  } catch (error: any) {
    console.error("Bulk export error:", error)
    return NextResponse.json({ error: error.message || "Failed to export test cases" }, { status: 500 })
  }
}
