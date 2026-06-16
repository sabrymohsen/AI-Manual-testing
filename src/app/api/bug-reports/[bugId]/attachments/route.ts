import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function POST(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { fileName, filePath, fileType, fileSize } = body

    if (!fileName || !filePath) {
      return NextResponse.json({ error: "fileName and filePath are required" }, { status: 400 })
    }

    const attachment = await prisma.$transaction(async (tx) => {
      const att = await tx.bugAttachment.create({
        data: {
          bugId: params.bugId,
          fileName,
          filePath,
          fileType: fileType || "application/octet-stream",
          fileSize: fileSize || null
        }
      })

      await tx.bugActivity.create({
        data: {
          bugId: params.bugId,
          action: "Attachment Added",
          details: `Attached file: ${fileName} (${fileType || "unknown type"})`
        }
      })

      return att
    })

    return NextResponse.json({ attachment }, { status: 201 })
  } catch (error: any) {
    console.error("POST /api/bug-reports/[bugId]/attachments error:", error)
    return NextResponse.json({ error: error.message || "Failed to add attachment" }, { status: 500 })
  }
}
