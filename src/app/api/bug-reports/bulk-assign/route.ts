import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"

const bulkAssignSchema = z.object({
  bugIds: z.array(z.string()).min(1),
  assignedTo: z.string().optional().nullable()
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  try {
    const body = await request.json()
    const parsed = bulkAssignSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { bugIds, assignedTo } = parsed.data

    // Verify ownership of all bug reports
    const bugs = await prisma.bugReport.findMany({
      where: { id: { in: bugIds } },
      select: { projectId: true }
    })
    const bugProjectIds = Array.from(new Set(bugs.map(b => b.projectId).filter(Boolean) as string[]))

    const userProjects = await prisma.project.findMany({
      where: { userId: session.user.id },
      select: { id: true }
    })
    const userProjectIds = userProjects.map(p => p.id)

    if (bugProjectIds.some(pid => pid && !userProjectIds.includes(pid))) {
      return unauthorizedResponse("Access denied to one or more bug reports")
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
