import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, notFoundResponse, unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { checkTransition } from "@/lib/bug-reports/workflow"
import { resolveBugSuiteId } from "@/lib/bug-reports/module"
import { resolveOpenProject } from "@/lib/integrations/openproject/resolve"
import { healBugProject } from "@/lib/bug-reports/keys"

/**
 * Bugs saved without a project (older manual-run bugs) could never be opened,
 * edited or deleted. Give them their project first when it can be inferred.
 */
async function ensureProject(bugId: string) {
  const row = await prisma.bugReport.findUnique({ where: { id: bugId }, select: { projectId: true } })
  if (row && !row.projectId) await healBugProject(bugId)
}

export async function GET(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  try {
    await ensureProject(params.bugId)
    const bug = await prisma.bugReport.findUnique({
      where: { id: params.bugId },
      include: {
        project: { select: { id: true, name: true } },
        reporter: { select: { id: true, name: true, email: true } },
        testCase: { select: { id: true, title: true } },
        suite: { select: { id: true, name: true } },
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
      return notFoundResponse("Bug report not found")
    }
    if (!bug.project) {
      return NextResponse.json(
        { error: "This bug isn't linked to any project, so it can't be opened. Ask an admin to link or remove it.", code: "NO_PROJECT" },
        { status: 409 }
      )
    }

    const auth = await requireProjectMember(bug.project.id)
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
      testRunId,
      suiteId
    } = body

    await ensureProject(params.bugId)
    const existingBug = await prisma.bugReport.findUnique({
      where: { id: params.bugId }
    })

    if (!existingBug) {
      return notFoundResponse("Bug report not found")
    }

    if (!existingBug.projectId) {
      return NextResponse.json({ error: "This bug isn't linked to any project.", code: "NO_PROJECT" }, { status: 409 })
    }
    const auth = await requireProjectMember(existingBug.projectId)
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

    // Module/service. Resolved through the same helper the create path uses, so
    // a suite id belonging to another project cannot be written here either.
    let resolvedSuiteId: string | null | undefined
    if (suiteId !== undefined) {
      resolvedSuiteId = await resolveBugSuiteId(existingBug.projectId!, { suiteId })
      if (resolvedSuiteId !== existingBug.suiteId) {
        const suiteName = resolvedSuiteId
          ? (await prisma.testSuite.findUnique({
              where: { id: resolvedSuiteId },
              select: { name: true }
            }))?.name
          : null
        changes.push(`Module updated to ${suiteName || "Unfiled"}`)
      }
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
          suiteId: resolvedSuiteId,
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
    await ensureProject(params.bugId)
    const bug = await prisma.bugReport.findUnique({
      where: { id: params.bugId },
      select: { projectId: true, reporterId: true }
    })

    if (!bug) {
      return notFoundResponse("Bug report not found")
    }

    if (!bug.projectId) {
      // An orphan nobody can reach through a project: only a global admin may remove it.
      const { getSession } = await import("@/lib/auth")
      const session = await getSession()
      const me = session ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }) : null
      if (me?.role !== "Admin") return unauthorizedResponse("Only an admin can delete a bug that has no project")
      await prisma.bugReport.delete({ where: { id: params.bugId } })
      return NextResponse.json({ success: true, remoteDeleted: false, remoteError: null })
    }

    const auth = await requireProjectOwner(bug.projectId)
    if (auth.error) {
      return NextResponse.json(
        { error: "Only the project's Owner or an Admin can delete bugs. Ask them, or close the bug instead.", code: "FORBIDDEN" },
        { status: 403 }
      )
    }

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
