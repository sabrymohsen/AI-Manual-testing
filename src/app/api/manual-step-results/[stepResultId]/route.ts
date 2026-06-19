import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"

const bodySchema = z.object({
  actualResult: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  bugReportId: z.string().optional(),
  screenshotPath: z.string().optional(),
})

export async function PUT(
  request: Request,
  { params }: { params: { stepResultId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const rawBody = await request.json()
    const parseResult = bodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.errors.map(e => e.message).join(", ") }, { status: 400 })
    }
    const body = rawBody
    const { actualResult, status, notes, bugReportId, screenshotPath } = body

    const stepResult = await prisma.manualStepResult.findUnique({
      where: { id: params.stepResultId },
      include: {
        sessionCase: {
          include: {
            session: {
              include: {
                project: { select: { userId: true } }
              }
            }
          }
        }
      }
    })

    if (!stepResult || !stepResult.sessionCase) {
      return notFoundResponse("Manual step result not found")
    }

    if (stepResult.sessionCase.session.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    const updated = await prisma.manualStepResult.update({
      where: { id: params.stepResultId },
      data: {
        actualResult,
        status: status as any,
        notes,
        bugReportId,
        screenshotPath
      }
    })

    // Propagate status failures to parent ManualSessionCase
    if (status === "Failed" || status === "Blocked" || status === "Warning") {
      const stepResult = await prisma.manualStepResult.findUnique({
        where: { id: params.stepResultId },
        include: {
          sessionCase: {
            include: {
              session: true
            }
          }
        }
      })

      if (stepResult?.sessionCase) {
        await prisma.manualSessionCase.update({
          where: { id: stepResult.sessionCase.id },
          data: {
            status: status as any
          }
        })
      }
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update step result" }, { status: 500 })
  }
}
