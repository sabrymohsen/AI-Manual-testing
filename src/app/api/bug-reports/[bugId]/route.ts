import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, notFoundResponse, unauthorizedResponse } from "@/lib/api-guards"
import { checkTransition } from "@/lib/bug-reports/workflow"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"

export async function GET(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  try {
    const bug = await prisma.bugReport.findUnique({
      where: { id: params.bugId },
      include: {
        project: { select: { id: true, name: true } },
        reporter: { select: { id: true, name: true, email: true } },
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

    if (!bug || !bug.project) {
      return notFoundResponse("Bug report not found")
    }

    const auth = await requireProjectOwner(bug.project.id)
    if (auth.error) return unauthorizedResponse(auth.error)

    const mapping = await prisma.externalSyncMapping.findUnique({
      where: {
        provider_localEntityType_localEntityId: {
          provider: "OpenProject",
          localEntityType: "BugReport",
          localEntityId: params.bugId
        }
      }
    })

    const bugWithSync = {
      ...bug,
      openProjectSyncStatus: mapping ? (mapping.lastSyncStatus === "success" ? "Synced" : "Failed") : "Not Synced",
      openProjectWorkPackageId: mapping?.externalId || null,
      openProjectWorkPackageUrl: mapping?.externalUrl || null
    }

    return NextResponse.json({ bug: bugWithSync })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch bug report details" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  try {
    const body = await request.json()
    const {
      title,
      severity,
      priority,
      status,
      resolution,
      resolutionNote,
      tags,
      assignedTo,
      source,
      openProjectParentId,
      openProjectBoardId,
      openProjectBoardColumnId,
      openProjectCustomFields,
      stepsToReproduce,
      expectedResult,
      actualResult,
      requirementIds,
      testCaseId,
      testRunId
    } = body

    const existingBug = await prisma.bugReport.findUnique({
      where: { id: params.bugId }
    })

    if (!existingBug) {
      return notFoundResponse("Bug report not found")
    }

    const auth = await requireProjectOwner(existingBug.projectId!)
    if (auth.error) return unauthorizedResponse(auth.error)

    // Enforce the status workflow. This route previously wrote `status as any`
    // with no checks, so Closed could jump straight back to InProgress and a bug
    // could reach Closed with no recorded resolution.
    //
    // `effectiveResolution` is what actually gets persisted: the transition may
    // imply one (Duplicate), carry the existing one forward, or clear a stale one
    // when a bug is reopened.
    let effectiveResolution: string | null | undefined = resolution
    let isReopenTransition = false
    if (status !== undefined) {
      const check = checkTransition(existingBug.status, status, resolution, existingBug.resolution)
      if (!check.ok) {
        return NextResponse.json(
          { error: check.error, code: check.code, currentStatus: existingBug.status },
          { status: 400 }
        )
      }
      effectiveResolution = check.resolution
      isReopenTransition = check.isReopen
    }

    // Capture log messages for changes
    const changes: string[] = []
    if (status && status !== existingBug.status) {
      changes.push(
        `Status changed from ${existingBug.status} to ${status}` +
          (effectiveResolution ? ` (resolution: ${effectiveResolution})` : "") +
          (isReopenTransition ? ` — reopen #${existingBug.reopenCount + 1}` : "")
      )
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
    if (effectiveResolution !== undefined && effectiveResolution !== existingBug.resolution && !status) {
      changes.push(`Resolution set to ${effectiveResolution || "None"}`)
    }
    if (tags !== undefined && JSON.stringify(tags) !== JSON.stringify(existingBug.tags)) {
      changes.push(`Tags updated to ${(tags && tags.length) ? tags.join(", ") : "None"}`)
    }
    if (source !== undefined && source !== existingBug.source) {
      changes.push(`Bug source updated to ${source || "None"}`)
    }
    if (title && title !== existingBug.title) {
      changes.push(`Title updated to "${title}"`)
    }
    if (testCaseId !== undefined && testCaseId !== existingBug.testCaseId) {
      changes.push(`Linked Test Case updated to ${testCaseId || "None"}`)
    }
    if (testRunId !== undefined && testRunId !== existingBug.testRunId) {
      changes.push(`Linked Test Run updated to ${testRunId || "None"}`)
    }

    const updatedBug = await prisma.$transaction(async (tx) => {
      const bug = await tx.bugReport.update({
        where: { id: params.bugId },
        data: {
          title: title !== undefined ? title : undefined,
          severity: severity !== undefined ? severity as any : undefined,
          priority: priority !== undefined ? priority as any : undefined,
          status: status !== undefined ? status as any : undefined,
          // The workflow-derived value, not the raw body field — so a Duplicate
          // gets its implied resolution and a Reopened bug loses the stale one.
          resolution: effectiveResolution !== undefined ? ((effectiveResolution || null) as any) : undefined,
          // Atomic increment rather than read-modify-write, so two concurrent
          // reopens can't both write the same number.
          ...(isReopenTransition ? { reopenCount: { increment: 1 } } : {}),
          resolutionNote: resolutionNote !== undefined ? (resolutionNote || null) : undefined,
          tags: tags !== undefined ? tags : undefined,
          assignedTo: assignedTo !== undefined ? assignedTo : undefined,
          source: source !== undefined ? (source || null) : undefined,
          openProjectParentId: openProjectParentId !== undefined ? (openProjectParentId || null) : undefined,
          openProjectBoardId: openProjectBoardId !== undefined ? (openProjectBoardId || null) : undefined,
          openProjectBoardColumnId: openProjectBoardColumnId !== undefined ? (openProjectBoardColumnId || null) : undefined,
          openProjectCustomFields: openProjectCustomFields !== undefined ? (openProjectCustomFields || null) : undefined,
          stepsToReproduce: stepsToReproduce !== undefined ? stepsToReproduce : undefined,
          expectedResult: expectedResult !== undefined ? expectedResult : undefined,
          actualResult: actualResult !== undefined ? actualResult : undefined,
          testCaseId: testCaseId !== undefined ? (testCaseId || null) : undefined,
          testRunId: testRunId !== undefined ? (testRunId || null) : undefined,
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
  try {
    const bug = await prisma.bugReport.findUnique({
      where: { id: params.bugId },
      select: { projectId: true }
    })

    if (!bug) {
      return notFoundResponse("Bug report not found")
    }

    const auth = await requireProjectOwner(bug.projectId!)
    if (auth.error) return unauthorizedResponse(auth.error)

    // Optionally also delete the mapped OpenProject work package (?deleteRemote=true).
    const { searchParams } = new URL(request.url)
    const deleteRemote = searchParams.get("deleteRemote") === "true"
    let remoteDeleted = false
    let remoteError: string | null = null

    if (deleteRemote && bug.projectId) {
      const mapping = await prisma.externalSyncMapping.findUnique({
        where: {
          provider_localEntityType_localEntityId: {
            provider: "OpenProject",
            localEntityType: "BugReport",
            localEntityId: params.bugId
          }
        }
      })
      // Whichever row owns the config (unified ProjectIntegration or legacy).
      const resolved = await resolveOpenProject(bug.projectId)

      // An empty externalId is a sync claim that never got a work package —
      // there is nothing to delete remotely.
      if (mapping?.externalId && resolved.ok) {
        try {
          await resolved.client.deleteWorkPackage(mapping.externalId)
          remoteDeleted = true
        } catch (err: any) {
          // Surface the failure but still allow the local delete to proceed.
          remoteError = err?.message || "Failed to delete OpenProject work package"
        }
      }
    }

    await prisma.bugReport.delete({
      where: { id: params.bugId }
    })
    return NextResponse.json({ success: true, remoteDeleted, remoteError })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete bug report" }, { status: 500 })
  }
}
