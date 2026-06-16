import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const flows = await prisma.reusableStepFlow.findMany({
      where: { projectId: params.projectId },
      include: {
        steps: {
          orderBy: { stepNumber: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    })
    return NextResponse.json(flows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch flows" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
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
      const createdFlow = await tx.reusableStepFlow.create({
        data: {
          projectId: params.projectId,
          name,
          description,
          category,
        }
      })

      if (steps && Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]
          await tx.reusableStep.create({
            data: {
              flowId: createdFlow.id,
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
        where: { id: createdFlow.id },
        include: {
          steps: {
            orderBy: { stepNumber: "asc" }
          }
        }
      })
    })

    return NextResponse.json(flow, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create flow" }, { status: 500 })
  }
}
