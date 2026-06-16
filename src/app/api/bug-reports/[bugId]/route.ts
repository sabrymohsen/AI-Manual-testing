import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function GET(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const bug = await prisma.bugReport.findUnique({
      where: { id: params.bugId },
      include: {
        project: { select: { id: true, name: true } },
        moduleRelation: { select: { id: true, name: true } },
        feature: { select: { id: true, name: true } },
        component: { select: { id: true, name: true } },
        testCase: { select: { id: true, title: true } },
        requirements: { include: { requirement: true } },
        testRun: {
          include: {
            testCase: { select: { id: true, title: true } }
          }
        },
        manualTestSession: true,
        testStepResult: true,
        comments: { orderBy: { createdAt: "desc" } },
        activities: { orderBy: { createdAt: "desc" } },
        bugAttachments: { orderBy: { createdAt: "desc" } },
        attachments: true
      }
    })

    if (!bug) {
      return NextResponse.json({ error: "Bug report not found" }, { status: 404 })
    }

    return NextResponse.json({ bug })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch bug report details" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      title,
      severity,
      priority,
      status,
      assignedTo,
      stepsToReproduce,
      expectedResult,
      actualResult,
      moduleId,
      featureId,
      componentId,
      requirementIds
    } = body

    const existingBug = await prisma.bugReport.findUnique({
      where: { id: params.bugId }
    })

    if (!existingBug) {
      return NextResponse.json({ error: "Bug report not found" }, { status: 404 })
    }

    // Capture log messages for changes
    const changes: string[] = []
    if (status && status !== existingBug.status) {
      changes.push(`Status changed from ${existingBug.status} to ${status}`)
    }
    if (assignedTo !== undefined && assignedTo !== existingBug.assignedTo) {
      changes.push(`Assigned developer updated to ${assignedTo || "Unassigned"}`)
    }
    if (priority && priority !== existingBug.priority) {
      changes.push(`Priority changed from ${existingBug.priority} to ${priority}`)
    }
    if (severity && severity !== existingBug.severity) {
      changes.push(`Severity changed from ${existingBug.severity} to ${severity}`)
    }
    if (title && title !== existingBug.title) {
      changes.push(`Title updated to "${title}"`)
    }

    const updatedBug = await prisma.$transaction(async (tx) => {
      const bug = await tx.bugReport.update({
        where: { id: params.bugId },
        data: {
          title: title !== undefined ? title : undefined,
          severity: severity !== undefined ? severity as any : undefined,
          priority: priority !== undefined ? priority as any : undefined,
          status: status !== undefined ? status as any : undefined,
          assignedTo: assignedTo !== undefined ? assignedTo : undefined,
          stepsToReproduce: stepsToReproduce !== undefined ? stepsToReproduce : undefined,
          expectedResult: expectedResult !== undefined ? expectedResult : undefined,
          actualResult: actualResult !== undefined ? actualResult : undefined,
          moduleId: moduleId !== undefined ? (moduleId || null) : undefined,
          featureId: featureId !== undefined ? (featureId || null) : undefined,
          componentId: componentId !== undefined ? (componentId || null) : undefined,
          requirements: requirementIds !== undefined
            ? {
                deleteMany: {},
                create: (requirementIds || []).map((reqId: string) => ({
                  requirementId: reqId
                }))
              }
            : undefined
        }
      })

      if (changes.length > 0) {
        await tx.bugActivity.create({
          data: {
            bugId: params.bugId,
            action: "Bug Updated",
            details: changes.join("; ")
          }
        })
      }

      return bug
    })

    return NextResponse.json({ bug: updatedBug })
  } catch (error: any) {
    console.error("PUT /api/bug-reports/[bugId] error:", error)
    return NextResponse.json({ error: error.message || "Failed to update bug report" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    await prisma.bugReport.delete({
      where: { id: params.bugId }
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete bug report" }, { status: 500 })
  }
}
