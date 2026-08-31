import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"
import { authorizeBugsWrite } from "@/lib/bug-reports/guards"
import { buildAssigneeNameMap, assigneeName } from "@/lib/bug-reports/assignees"

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

    // Authorised through the RBAC engine, not project ownership: an Admin,

    // a Member or a Global Admin working on the board was previously refused

    // every bulk action, because only the project creator passed.

    const access = await authorizeBugsWrite(bugIds, "canAccessReports")

    if (!access.ok) return access.response

    const bugReports = await prisma.bugReport.findMany({
      where: { id: { in: bugIds } },
      include: {
        project: { select: { name: true } },
        testCase: { select: { title: true } },
        requirements: { include: { requirement: true } },
        testRun: { select: { id: true } }
      }
    })

    // assignedTo holds the tracker's user id, which is meaningless in an export.
    // One map per project involved, then every bug reads its name from there.
    const nameMaps = new Map<string, Map<string, string>>()
    for (const pid of access.projectIds) {
      nameMaps.set(pid, await buildAssigneeNameMap(pid))
    }

    const exported = bugReports.map(b => ({
      id: b.id,
      bugKey: b.bugKey || "",
      title: b.title,
      project: b.project?.name || "",
      severity: b.severity,
      priority: b.priority,
      status: b.status,
      environment: b.environment || "Staging",
      assignedTo:
        assigneeName(b.assignedTo, nameMaps.get(b.projectId || "") ?? new Map()) || "Unassigned",
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
