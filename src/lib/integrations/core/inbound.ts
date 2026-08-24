/**
 * Inbound reconciliation — applies a normalized external change onto the local
 * entity it maps to. Shared by the webhook endpoint and the polling worker.
 *
 * Status is the interesting case. It is recorded twice, on purpose:
 *
 *   1. The tracker's own status (id + name) is stored raw on ExternalSyncMapping.
 *      This is what the mirrored board groups by, so a bug shows up in the same
 *      column it occupies in OpenProject — including columns the app has no word
 *      for, like "Specified" or "To be scheduled".
 *   2. The local BugStatus is derived from it through the project's saved bug
 *      status mapping, so reports, filters and the workflow keep working in the
 *      app's own vocabulary.
 *
 * Previously only (2) existed, and only as a closed/not-closed guess: every
 * OpenProject status that wasn't "closed" became "Open", so moving a card from
 * New to In progress to Developed changed nothing on this side. That is the
 * behaviour this module replaces.
 *
 * Ordering: local fields use last-writer-wins against the local row's updatedAt.
 * The tracker's own status is ordered on the tracker's timeline instead
 * (externalStatusAt), since it is a fact about the tracker, not about us.
 */
import { prisma } from "@/lib/db"
import type { WorkItemProvider } from "./provider"
import type { NormalizedInboundEvent, ProviderId } from "./types"
import {
  appStatusForTrackerStatus,
  readBugStatusMapping,
  type BugStatusMapping,
} from "./bug-status-mapping"

/** Local bug statuses considered "closed" so we don't reopen a manually-closed bug needlessly. */
const CLOSED_BUG_STATUSES = new Set(["Closed", "Resolved", "Rejected", "Done"])

export interface ReconcileContext {
  /** app status -> tracker status id, loaded once per batch by the caller. */
  bugStatusMapping?: BugStatusMapping
}

/** Cached status list per provider, for name→id resolution and isClosed lookups. */
let statusCache: {
  key: string
  at: number
  byId: Map<string, { id: string; name: string; isClosed: boolean }>
  byName: Map<string, { id: string; name: string; isClosed: boolean }>
} | null = null

const STATUS_CACHE_TTL_MS = 5 * 60 * 1000

async function loadStatuses(provider: WorkItemProvider) {
  const key = provider.provider
  if (statusCache && statusCache.key === key && Date.now() - statusCache.at < STATUS_CACHE_TTL_MS) {
    return statusCache
  }
  const statuses = await provider.getStatuses()
  statusCache = {
    key,
    at: Date.now(),
    byId: new Map(statuses.map((s) => [String(s.id), { ...s, id: String(s.id) }])),
    byName: new Map(
      statuses.map((s) => [s.name.trim().toLowerCase(), { ...s, id: String(s.id) }])
    ),
  }
  return statusCache
}

/**
 * Resolve an event's status to the tracker's canonical { id, name, isClosed }.
 *
 * Webhooks carry a name for some providers and an id for others, and a poll
 * carries both, so neither can be assumed. Returns null when the tracker cannot
 * be reached — the caller then leaves the status alone rather than guessing.
 */
async function resolveExternalStatus(
  provider: WorkItemProvider,
  statusId?: string,
  statusName?: string
): Promise<{ id: string; name: string; isClosed: boolean } | null> {
  if (!statusId && !statusName) return null
  try {
    const cache = await loadStatuses(provider)
    if (statusId) {
      const byId = cache.byId.get(String(statusId))
      if (byId) return byId
    }
    if (statusName) {
      const byName = cache.byName.get(statusName.trim().toLowerCase())
      if (byName) return byName
    }
  } catch {
    // Status list unreachable — fall through to the raw values below.
  }
  // The tracker told us something we could not look up (a status added since
  // the cache, or a provider that only sends names). Keep what we were given so
  // the board can still show it; isClosed is unknown, so treat it as open.
  if (statusId || statusName) {
    return { id: String(statusId || statusName), name: statusName || String(statusId), isClosed: false }
  }
  return null
}

async function bugMappingFor(projectId: string, ctx?: ReconcileContext): Promise<BugStatusMapping> {
  if (ctx?.bugStatusMapping) return ctx.bugStatusMapping
  const row = await prisma.projectIntegration
    .findUnique({ where: { projectId }, select: { statusMapping: true } })
    .catch(() => null)
  return readBugStatusMapping(row?.statusMapping)
}

/**
 * Reconcile a single inbound event. Returns true when a local change was applied.
 */
export async function reconcileInboundEvent(
  projectId: string,
  providerId: ProviderId,
  provider: WorkItemProvider,
  event: NormalizedInboundEvent,
  ctx?: ReconcileContext
): Promise<boolean> {
  const mapping = await prisma.externalSyncMapping.findFirst({
    where: { projectId, provider: providerId as any, externalId: event.externalId },
  })
  if (!mapping) return false

  const occurredAt = event.occurredAt || new Date()

  if (mapping.localEntityType === "BugReport") {
    const bug = await prisma.bugReport.findUnique({ where: { id: mapping.localEntityId } })
    if (!bug) return false

    const external = await resolveExternalStatus(
      provider,
      event.changed.statusId,
      event.changed.statusName
    )

    // ── 1. The tracker's own status, on the tracker's timeline ────────────────
    // Recorded even when the local row is fresher: it is what the tracker says,
    // and the mirrored board needs it to place the card. Skipped only when we
    // already hold a reading from at or after this event.
    let mirrored = false
    if (external) {
      const stale = mapping.externalStatusAt && mapping.externalStatusAt > occurredAt
      const changed =
        mapping.externalStatusId !== external.id || mapping.externalStatusName !== external.name
      if (!stale && changed) {
        await prisma.externalSyncMapping.update({
          where: { id: mapping.id },
          data: {
            externalStatusId: external.id,
            externalStatusName: external.name,
            externalStatusAt: occurredAt,
            lastSyncedAt: new Date(),
            lastSyncStatus: "success",
          },
        })
        mirrored = true
      }
    }

    // ── 2. The local status, via the project's saved mapping ──────────────────
    // Last-writer-wins: a fresher local edit is not overwritten.
    if (bug.updatedAt && bug.updatedAt > occurredAt) return mirrored

    const data: Record<string, any> = {}
    if (event.changed.title && event.changed.title !== bug.title) {
      data.title = event.changed.title.replace(/^\[BUG\]\s*/, "")
    }

    if (external) {
      const bugMapping = await bugMappingFor(projectId, ctx)
      const mapped = appStatusForTrackerStatus(bugMapping, external.id)
      if (mapped) {
        // The user said what this tracker status means here. Honour it exactly.
        if (mapped !== bug.status) data.status = mapped
      } else if (external.isClosed && !CLOSED_BUG_STATUSES.has(bug.status)) {
        // Unmapped but the tracker calls it closed — the one inference worth
        // making, so a bug closed over there doesn't sit open in reports forever.
        data.status = "Closed"
      }
      // Unmapped and open: leave the local status alone. The mirrored board
      // already shows the real column; inventing a local status here would
      // sync back out and move the card in the tracker.
    }

    if (Object.keys(data).length === 0) return mirrored
    await prisma.bugReport.update({ where: { id: bug.id }, data })
    await prisma.externalSyncMapping.update({
      where: { id: mapping.id },
      data: { lastSyncedAt: new Date(), lastSyncStatus: "success" },
    })
    return true
  }

  if (mapping.localEntityType === "Requirement") {
    const req = await prisma.requirement.findUnique({ where: { id: mapping.localEntityId } })
    if (!req) return false
    if (req.updatedAt && req.updatedAt > occurredAt) return false
    const data: Record<string, any> = {}
    if (event.changed.title && event.changed.title !== req.title) {
      data.title = event.changed.title.replace(/^\[STORY\]\s*/, "")
    }
    if (Object.keys(data).length === 0) return false
    await prisma.requirement.update({ where: { id: req.id }, data })
    return true
  }

  if (mapping.localEntityType === "TestCase") {
    const tc = await prisma.testCase.findUnique({ where: { id: mapping.localEntityId } })
    if (!tc) return false
    if (tc.updatedAt && tc.updatedAt > occurredAt) return false
    const data: Record<string, any> = {}
    if (event.changed.title && event.changed.title !== tc.title) data.title = event.changed.title
    if (Object.keys(data).length === 0) return false
    await prisma.testCase.update({ where: { id: tc.id }, data })
    return true
  }

  return false
}
