import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"

const bodySchema = z.object({
  testCaseIds: z.array(z.string().min(1)).min(1, "No test case IDs provided"),
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) {
    return unauthorizedResponse(auth.error)
  }
  const session = auth.session!

  try {
    const body = await request.json()
    const parse = bodySchema.safeParse(body)
    if (!parse.success) {
      return badRequestResponse(parse.error.errors[0].message)
    }
    const { testCaseIds } = parse.data

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
