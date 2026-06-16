import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { saveFile } from "@/lib/storage"

export async function POST(
  request: Request,
  { params }: { params: { stepResultId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { imageBase64 } = body

    if (!imageBase64) {
      return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 })
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
