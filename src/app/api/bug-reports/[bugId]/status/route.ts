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
    const { status } = body

    if (!status) {
      return NextResponse.json({ error: "Status value is required" }, { status: 400 })
    }

    const existingBug = await prisma.bugReport.findUnique({
      where: { id: params.bugId }
    })

    if (!existingBug) {
      return NextResponse.json({ error: "Bug report not found" }, { status: 404 })
    }

    const updatedBug = await prisma.$transaction(async (tx) => {
      const bug = await tx.bugReport.update({
        where: { id: params.bugId },
        data: {
          status: status as any
        }
      })

      await tx.bugActivity.create({
        data: {
          bugId: params.bugId,
          action: "Status Changed",
          details: `Status transitioned from ${existingBug.status} to ${status}.`
        }
      })

      return bug
    })

    return NextResponse.json({ bug: updatedBug })
  } catch (error: any) {
    console.error("POST /api/bug-reports/[bugId]/status error:", error)
    return NextResponse.json({ error: error.message || "Failed to update status" }, { status: 500 })
  }
}
