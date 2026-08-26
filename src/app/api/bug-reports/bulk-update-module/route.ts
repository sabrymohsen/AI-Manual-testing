import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"

/**
 * File a batch of bugs under one module/service, or clear the module on them.
 *
 * Filing defects module by module is how a backlog of already-reported bugs
 * gets organised for a release report — doing it one drawer at a time is the
 * reason it never happens.
 */
const bulkUpdateModuleSchema = z.object({
  bugIds: z.array(z.string()).min(1),
  // null / "" means Unfiled — an explicit choice, not a missing value.
  suiteId: z.string().nullable().optional()
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  try {
    const body = await request.json()
    const parsed = bulkUpdateModuleSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { bugIds } = parsed.data
    const requestedSuiteId = parsed.data.suiteId || null

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

    // A suite belongs to exactly one project, so a mixed-project selection can
    // never all be filed under the same module. Refusing beats half-applying.
    let suiteName = "Unfiled"
    if (requestedSuiteId) {
      const suite = await prisma.testSuite.findUnique({
        where: { id: requestedSuiteId },
        select: { id: true, name: true, projectId: true }
      })
      if (!suite) return badRequestResponse("Module not found")
      if (bugProjectIds.some(pid => pid !== suite.projectId)) {
        return badRequestResponse("That module belongs to a different project than one or more of the selected bugs")
      }
      suiteName = suite.name
    }

    await prisma.$transaction(async (tx) => {
      await tx.bugReport.updateMany({
        where: { id: { in: bugIds } },
        data: { suiteId: requestedSuiteId }
      })

      for (const bugId of bugIds) {
        await tx.bugActivity.create({
          data: {
            bugId,
            action: "Bulk Module Updated",
            details: `Module set in bulk to ${suiteName}.`
          }
        })
      }
    })

    return NextResponse.json({ success: true, count: bugIds.length, suiteName })
  } catch (error: any) {
    console.error("Bulk module update error:", error)
    return NextResponse.json({ error: error.message || "Failed to update bug modules" }, { status: 500 })
  }
}
