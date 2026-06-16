import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function POST(
  request: Request,
  { params }: { params: { testCaseId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { flowId, insertAtStepNumber } = body // 1-indexed

    if (!flowId) {
      return NextResponse.json({ error: "flowId is required" }, { status: 400 })
    }

    const flow = await prisma.reusableStepFlow.findUnique({
      where: { id: flowId },
      include: {
        steps: { orderBy: { stepNumber: "asc" } }
      }
    })

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 })
    }

    const testCase = await prisma.testCase.findUnique({
      where: { id: params.testCaseId },
      include: {
        steps: { orderBy: { stepNumber: "asc" } }
      }
    })

    if (!testCase) {
      return NextResponse.json({ error: "Test case not found" }, { status: 404 })
    }

    const targetStepNumber = insertAtStepNumber || (testCase.steps.length + 1)
    const shiftCount = flow.steps.length

    await prisma.$transaction(async (tx) => {
      // Shift existing steps
      await tx.testStep.updateMany({
        where: {
          testCaseId: params.testCaseId,
          stepNumber: { gte: targetStepNumber }
        },
        data: {
          stepNumber: {
            increment: shiftCount
          }
        }
      })

      // Create new steps
      for (let i = 0; i < flow.steps.length; i++) {
        const flowStep = flow.steps[i]
        await tx.testStep.create({
          data: {
            testCaseId: params.testCaseId,
            stepNumber: targetStepNumber + i,
            actionDescription: flowStep.actionDescription,
            expectedResult: flowStep.expectedResult || "",
            actionType: flowStep.actionType,
            targetType: flowStep.targetType,
            targetValue: flowStep.targetValue,
            inputValue: flowStep.inputValue,
            assertions: flowStep.assertions || {},
          }
        })
      }
    })

    // Return the updated test case steps
    const updatedSteps = await prisma.testStep.findMany({
      where: { testCaseId: params.testCaseId },
      orderBy: { stepNumber: "asc" }
    })

    return NextResponse.json({ success: true, steps: updatedSteps })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to insert flow" }, { status: 500 })
  }
}
