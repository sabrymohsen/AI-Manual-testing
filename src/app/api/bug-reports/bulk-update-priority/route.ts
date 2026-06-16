import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { bugIds, priority } = body

    if (!bugIds || !Array.isArray(bugIds) || bugIds.length === 0) {
      return NextResponse.json({ error: "No bug IDs provided" }, { status: 400 })
    }

    if (!priority) {
      return NextResponse.json({ error: "priority is required" }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.bugReport.updateMany({
        where: { id: { in: bugIds } },
        data: { priority: priority as any }
      })

      // Add activity logs for each bug
      for (const bugId of bugIds) {
        await tx.bugActivity.create({
          data: {
            bugId,
            action: "Bulk Priority Updated",
            details: `Priority set in bulk to ${priority}.`
          }
        })
      }
    })

    return NextResponse.json({ success: true, count: bugIds.length })
  } catch (error: any) {
    console.error("Bulk priority update error:", error)
    return NextResponse.json({ error: error.message || "Failed to update bug priorities" }, { status: 500 })
  }
}
