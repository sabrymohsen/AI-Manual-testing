import { NextRequest, NextResponse } from "next/server"
import { requireProjectOwner, notFoundResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) {
    return notFoundResponse("Project not found or access denied")
  }

  try {
    const body = await request.json()
    const { testCases, importId, moduleId, featureId, componentId } = body

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return NextResponse.json(
        { error: "No test cases to save" },
        { status: 400 }
      )
    }

    const createdTestCases = []
    const createdRequirements = []

    for (const tc of testCases) {
      // Create the test case
      const createdTestCase = await prisma.testCase.create({
        data: {
          title: tc.title,
          priority: tc.priority || "Medium",
          preconditions: tc.preconditions || "",
          source: "AIGenerated",
          projectId: params.projectId,
          tags: tc.tags || ["ai-generated"],
          steps: {
            create: (tc.steps || []).map((step: any) => ({
              stepNumber: step.stepNumber || 1,
              actionDescription: step.actionDescription || "",
              expectedResult: step.expectedResult || "",
              actionType: step.actionType || "custom_instruction",
              targetType: step.targetType || "none",
              targetValue: step.targetValue || "",
              inputValue: step.inputValue || "",
              timeoutMs: 10000,
            })),
          },
        },
        include: {
          steps: { orderBy: { stepNumber: "asc" } },
        },
      })

      createdTestCases.push(createdTestCase)
    }

    // Update import status if importId provided
    if (importId) {
      await prisma.requirementImport.update({
        where: { id: importId },
        data: {
          status: "Saved",
          summary: {
            savedTestCases: createdTestCases.length,
            savedAt: new Date().toISOString(),
          } as any,
        },
      })

      // Create requirements linked to the generated test cases
      for (let i = 0; i < createdTestCases.length; i++) {
        const tc = createdTestCases[i]
        const reqTitle = tc.title.substring(0, 100)
        const requirement = await prisma.requirement.create({
          data: {
            projectId: params.projectId,
            requirementKey: `AI-REQ-${Date.now()}-${i}`,
            title: reqTitle,
            description: tc.preconditions || tc.title,
            priority: tc.priority as any,
            status: "ReadyForTesting",
            source: "AIGenerated",
            sourceImportId: importId,
            testCases: {
              create: {
                testCaseId: tc.id,
              },
            },
          },
        })
        createdRequirements.push(requirement)
      }
    }

    return NextResponse.json({
      testCases: createdTestCases,
      requirements: createdRequirements,
      count: createdTestCases.length,
    })
  } catch (error: any) {
    console.error("POST /api/projects/[projectId]/ai-testcases/save error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to save test cases" },
      { status: 500 }
    )
  }
}
