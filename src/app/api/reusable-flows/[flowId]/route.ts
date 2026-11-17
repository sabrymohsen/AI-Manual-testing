import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, canUseProject } from "@/lib/api-guards"
import { z } from "zod"

const putBodySchema = z.object({
  name: z.string().min(1, "Flow name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  steps: z.array(z.any()).optional(),
})

export async function PUT(
  request: Request,
  { params }: { params: { flowId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const flow = await prisma.reusableStepFlow.findUnique({
      where: { id: params.flowId },
      include: { project: { select: { userId: true } } }
    })

    if (!flow) {
      return notFoundResponse("Flow not found")
    }

    if (!(await canUseProject(flow.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    const rawBody = await request.json()
    const parseResult = putBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.errors.map(e => e.message).join(", ") }, { status: 400 })
    }
    const body = rawBody
    const { name, description, category, steps } = body

    if (!name) {
      return NextResponse.json({ error: "Flow name is required" }, { status: 400 })
    }

    const updatedFlow = await prisma.$transaction(async (tx) => {
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

    return NextResponse.json(updatedFlow)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update flow" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { flowId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const flow = await prisma.reusableStepFlow.findUnique({
      where: { id: params.flowId },
      include: { project: { select: { userId: true } } }
    })

    if (!flow) {
      return notFoundResponse("Flow not found")
    }

    if (!(await canUseProject(flow.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    await prisma.reusableStepFlow.delete({
      where: { id: params.flowId }
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete flow" }, { status: 500 })
  }
}
