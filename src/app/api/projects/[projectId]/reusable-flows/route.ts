import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, requireProjectMember } from "@/lib/api-guards"
import { z } from "zod"

const reusableFlowSchema = z.object({
  name: z.string().min(1, "Flow name is required"),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  steps: z.array(z.any()).optional(),
})

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

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
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const parsed = reusableFlowSchema.safeParse(body)

    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { name, description, category, steps } = parsed.data

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
