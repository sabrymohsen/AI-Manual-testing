import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"

const bulkExportSchema = z.object({
  bugIds: z.array(z.string()).min(1)
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  const session = auth.session!

  try {
    const body = await request.json()
    const parsed = bulkExportSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { bugIds } = parsed.data

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

    const bugReports = await prisma.bugReport.findMany({
      where: { id: { in: bugIds } },
      include: {
        project: { select: { name: true } },
        moduleRelation: { select: { name: true } },
        feature: { select: { name: true } },
        component: { select: { name: true } },
        testCase: { select: { title: true } },
        requirements: { include: { requirement: true } },
        testRun: { select: { id: true } }
      }
    })

    const exported = bugReports.map(b => ({
      id: b.id,
      bugKey: b.bugKey || "",
      title: b.title,
      project: b.project?.name || "",
      module: b.moduleRelation?.name || "",
      feature: b.feature?.name || "",
      component: b.component?.name || "",
      severity: b.severity,
      priority: b.priority,
      status: b.status,
      environment: b.environment || "Staging",
      assignedTo: b.assignedTo || "Unassigned",
      stepsToReproduce: b.stepsToReproduce,
      expectedResult: b.expectedResult,
      actualResult: b.actualResult,
      screenshotPath: b.screenshotPath || "",
      consoleLogs: b.consoleLogs || "",
      networkErrors: b.networkErrors || "",
      linkedTestCase: b.testCase?.title || "",
      linkedRequirements: b.requirements.map(r => r.requirement.requirementKey).join(", "),
      linkedTestRun: b.testRun?.id || "",
      createdAt: b.createdAt
    }))

    return NextResponse.json({
      success: true,
      bugReports: exported
    })
  } catch (error: any) {
    console.error("Bulk export error:", error)
    return NextResponse.json({ error: error.message || "Failed to export bug reports" }, { status: 500 })
  }
}
