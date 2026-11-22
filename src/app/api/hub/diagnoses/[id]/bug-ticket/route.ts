import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { executionVisibleTo } from "@/lib/hub-access"
import { nextBugKey } from "@/lib/bug-reports/keys"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const item = await prisma.diagnosis.findUnique({
      where: { id: params.id }
    })

    if (!item) {
      return NextResponse.json({ error: "Diagnosis not found" }, { status: 404 })
    }
    // Only members of the run's project may see it.
    if (item && !(await executionVisibleTo(auth.session!.user.id, item.testExecutionId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Get the first active project as fallback
    const project = await prisma.project.findFirst()
    if (!project) {
      return NextResponse.json({ error: "No active project found to assign bug ticket to" }, { status: 400 })
    }

    // Sequential bug key e.g. BUG-0001
    const bugKey = await nextBugKey(project.id)

    const bugReport = await prisma.bugReport.create({
      data: {
        bugKey,
        title: `AI Diagnosis Failure: ${item.testName}`,
        projectId: project.id,
        severity: "High",
        priority: "High",
        status: "Open",
        stepsToReproduce: `Run automated suite: ${item.testName}\nCheck details in AI Diagnosis section.`,
        expectedResult: "Execution passes cleanly without locator or assertion failures.",
        actualResult: item.errorMessage
      }
    })

    return NextResponse.json({ bugReport })
  } catch (err: any) {
    console.error("POST create bug ticket from diagnosis error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
