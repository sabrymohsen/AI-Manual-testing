import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, canUseProject } from "@/lib/api-guards"
import { saveFile } from "@/lib/storage"
import { z } from "zod"

const bodySchema = z.object({
  imageBase64: z.string().min(1, "imageBase64 is required"),
})

export async function POST(
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
    const { imageBase64 } = body

    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 })
    }

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

    if (!(await canUseProject(stepResult.sessionCase.session.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "")
    const buffer = Buffer.from(base64Data, "base64")

    const filePath = await saveFile("screenshots", `manual-step-${params.stepResultId}.png`, buffer)

    const updated = await prisma.manualStepResult.update({
      where: { id: params.stepResultId },
      data: {
        screenshotPath: filePath
      }
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to upload screenshot" }, { status: 500 })
  }
}
