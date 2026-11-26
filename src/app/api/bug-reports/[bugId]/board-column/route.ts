/**
 * POST /api/bug-reports/[bugId]/board-column   { statusId, resolution? }
 *
 * Drop handler for the mirrored board: moves a bug into a TRACKER column.
 *
 * Order matters here. The tracker is the thing being mirrored, so its status is
 * written first and recorded as the card's position; the local BugStatus is then
 * brought along only when the project's saved mapping says what that column
 * means AND the app's own workflow permits the move. A column with no local
 * meaning ("Specified", "To be scheduled") moves the card and leaves the local
 * status alone rather than inventing one — which would immediately sync back out
 * and move the card again in the tracker.
 *
 * Resolution is checked BEFORE anything is written, so a drop onto Closed asks
 * for a reason instead of half-applying: the UI already handles the
 * RESOLUTION_REQUIRED code from the ordinary status route and reuses it here.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { notifyBugStatus, notifyBugsBulk } from "@/lib/work-notifications"
import { loadIntegration } from "@/lib/integrations/core/load-integration"
import {
  appStatusForTrackerStatus,
  readBugStatusMapping,
} from "@/lib/integrations/core/bug-status-mapping"
import { checkTransition, isReopen } from "@/lib/bug-reports/workflow"

export async function POST(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const bug = await prisma.bugReport.findUnique({
    where: { id: params.bugId },
    select: { id: true, projectId: true, status: true, resolution: true, title: true },
  })
  if (!bug) return notFoundResponse("Bug not found")
  // A bug with no project has no integration and so no board to move a card on.
  if (!bug.projectId) return badRequestResponse("This bug does not belong to a project")
  const projectId = bug.projectId

  const auth = await requireProjectMember(projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json().catch(() => ({}))
  const statusId = typeof body?.statusId === "string" ? body.statusId.trim() : ""
  if (!statusId) return badRequestResponse("statusId is required")

  const loaded = await loadIntegration(projectId)
  if (!loaded) {
    return badRequestResponse("No project-management integration is configured for this project")
  }

  const syncMapping = await prisma.externalSyncMapping.findFirst({
    where: {
      projectId,
      provider: loaded.provider as any,
      localEntityType: "BugReport",
      localEntityId: bug.id,
    },
  })
  if (!syncMapping) {
    return NextResponse.json(
      {
        error: `This bug has not been synced to ${loaded.provider} yet, so it has no card to move. Sync it first.`,
        code: "NOT_SYNCED",
      },
      { status: 409 }
    )
  }

  // ── Decide the local consequence before writing anything ────────────────────
  const bugStatusMapping = readBugStatusMapping(loaded.statusMapping)
  const targetAppStatus = appStatusForTrackerStatus(bugStatusMapping, statusId)

  let localUpdate: Record<string, any> | null = null
  let localSkipReason: string | null = null

  if (!targetAppStatus) {
    localSkipReason = "unmapped"
  } else if (targetAppStatus === bug.status) {
    localSkipReason = "already"
  } else {
    const check = checkTransition(bug.status, targetAppStatus, body?.resolution, bug.resolution)
    if (!check.ok) {
      // A missing reason is a question for the user, not a failure — ask before
      // touching the tracker, so the card doesn't move on a half-done change.
      if (check.code === "RESOLUTION_REQUIRED") {
        return NextResponse.json({ error: check.error, code: check.code }, { status: 400 })
      }
      // The tracker allows this move and the app's workflow doesn't. The tracker
      // is what the board mirrors, so the card still moves; the local status
      // stays put and the response says why.
      localSkipReason = "workflow"
    } else {
      localUpdate = { status: targetAppStatus, resolution: check.resolution ?? null }
      if (check.isReopen || isReopen(bug.status, targetAppStatus)) {
        localUpdate.reopenCount = { increment: 1 }
      }
    }
  }

  // ── 1. Move the card in the tracker ─────────────────────────────────────────
  let statusName: string | null = null
  try {
    const provider = loaded.getClient()
    const updated = await provider.updateWorkItem(syncMapping.externalId, { statusId })
    statusName = updated.statusName || null
    if (!statusName) {
      statusName =
        (await provider.getStatuses().catch(() => [])).find((s) => String(s.id) === statusId)?.name ||
        null
    }
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `${loaded.provider} refused the move: ${err?.message || "unknown error"}`,
        code: "TRACKER_REJECTED",
      },
      { status: 502 }
    )
  }

  // ── 2. Record where the tracker now has it ──────────────────────────────────
  const now = new Date()
  await prisma.externalSyncMapping.update({
    where: { id: syncMapping.id },
    data: {
      externalStatusId: statusId,
      externalStatusName: statusName,
      externalStatusAt: now,
      lastSyncedAt: now,
      lastSyncStatus: "success",
      lastSyncError: null,
    },
  })

  // ── 3. Bring the local status along, when it has a meaning here ─────────────
  if (localUpdate) {
    const moved = await prisma.bugReport.update({ where: { id: bug.id }, data: localUpdate })
    if (localUpdate.status && localUpdate.status !== bug.status) {
      const me = auth.session!.user
      notifyBugStatus({
        projectId,
        bug: { id: moved.id, title: moved.title, key: moved.bugKey, reporterId: moved.reporterId, assignedTo: moved.assignedTo },
        to: String(localUpdate.status),
        actorId: me.id,
        actorName: me.name || me.email,
      }).catch(() => {})
    }
  }

  return NextResponse.json({
    success: true,
    statusId,
    statusName,
    /** The local status now, whether or not it moved. */
    appStatus: localUpdate?.status ?? bug.status,
    localStatusChanged: !!localUpdate,
    /**
     * Why the local status stayed put, when it did:
     *   "unmapped" — no app status is mapped to this tracker column
     *   "workflow" — the app's bug workflow doesn't allow that transition
     *   "already"  — it already matched
     */
    localSkipReason,
  })
}
