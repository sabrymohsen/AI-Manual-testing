import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"


export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const items = await prisma.evidenceFile.findMany({
      orderBy: { createdAt: "desc" }
    })

    // No invented sample rows: an empty table means nothing has been recorded yet.

    return NextResponse.json({ evidence: items })
  } catch (err: any) {
    console.error("GET evidence files error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { testExecutionId, fileType, filePath, stepNumber, pageUrl, elementLocator, status, tags } = body

    if (!testExecutionId || !fileType || !filePath || stepNumber === undefined || !pageUrl || !elementLocator) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const file = await prisma.evidenceFile.create({
      data: {
        testExecutionId,
        fileType,
        filePath,
        stepNumber,
        pageUrl,
        elementLocator,
        status: status || "info",
        tags: tags || []
      }
    })

    return NextResponse.json({ file }, { status: 201 })
  } catch (err: any) {
    console.error("POST evidence file error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
