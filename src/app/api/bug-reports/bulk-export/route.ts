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
    const { bugIds } = body

    if (!bugIds || !Array.isArray(bugIds) || bugIds.length === 0) {
      return NextResponse.json({ error: "No bug IDs provided" }, { status: 400 })
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
