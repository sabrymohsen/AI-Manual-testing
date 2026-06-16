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
    const { bugIds, assignedTo } = body

    if (!bugIds || !Array.isArray(bugIds) || bugIds.length === 0) {
      return NextResponse.json({ error: "No bug IDs provided" }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.bugReport.updateMany({
        where: { id: { in: bugIds } },
        data: { assignedTo: assignedTo || null }
      })

      // Add activity logs for each bug
      for (const bugId of bugIds) {
        await tx.bugActivity.create({
          data: {
            bugId,
            action: "Bulk Assignment Updated",
            details: `Bug assigned in bulk to ${assignedTo || "Unassigned"}.`
          }
        })
      }
    })

    return NextResponse.json({ success: true, count: bugIds.length })
  } catch (error: any) {
    console.error("Bulk assign error:", error)
    return NextResponse.json({ error: error.message || "Failed to assign bug reports" }, { status: 500 })
  }
}
