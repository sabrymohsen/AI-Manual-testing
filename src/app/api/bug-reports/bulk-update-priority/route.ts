import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"

const bulkUpdatePrioritySchema = z.object({
  bugIds: z.array(z.string()).min(1),
  priority: z.string().min(1)
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  try {
    const body = await request.json()
    const parsed = bulkUpdatePrioritySchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { bugIds, priority } = parsed.data

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
