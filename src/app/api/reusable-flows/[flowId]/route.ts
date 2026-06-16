import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function PUT(
  request: Request,
  { params }: { params: { flowId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, description, category, steps } = body

    if (!name) {
      return NextResponse.json({ error: "Flow name is required" }, { status: 400 })
    }

    const flow = await prisma.$transaction(async (tx) => {
      // Update flow details
      await tx.reusableStepFlow.update({
        where: { id: params.flowId },
        data: {
          name,
          description,
          category,
        }
      })

      // Delete existing steps
      await tx.reusableStep.deleteMany({
        where: { flowId: params.flowId }
      })

      // Insert new steps
      if (steps && Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]
          await tx.reusableStep.create({
            data: {
              flowId: params.flowId,
              stepNumber: step.stepNumber || i + 1,
              actionDescription: step.actionDescription || "Perform action",
              expectedResult: step.expectedResult || "",
              actionType: step.actionType || "custom_instruction",
              targetType: step.targetType || "none",
              targetValue: step.targetValue || "",
              inputValue: step.inputValue || "",
              assertions: step.assertions || {},
            }
          })
        }
      }

      return tx.reusableStepFlow.findUnique({
        where: { id: params.flowId },
        include: {
          steps: {
            orderBy: { stepNumber: "asc" }
          }
        }
      })
    })

    return NextResponse.json(flow)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update flow" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { flowId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    await prisma.reusableStepFlow.delete({
      where: { id: params.flowId }
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete flow" }, { status: 500 })
  }
}
