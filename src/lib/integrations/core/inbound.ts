/**
 * Inbound reconciliation — applies a normalized external change onto the local
 * entity it maps to. Shared by the webhook endpoint and the polling worker.
 *
 * Status is the interesting case: external status ids/names are provider-specific,
 * so we resolve whether the external status is "closed" via the provider's status
 * list and translate to the local entity's status vocabulary. Title/assignee are
 * copied directly. Last-writer-wins guards against clobbering fresher local edits.
 */
import { prisma } from "@/lib/db"
import type { WorkItemProvider } from "./provider"
import type { NormalizedInboundEvent, ProviderId } from "./types"

/** Local bug statuses considered "closed" so we don't reopen a manually-closed bug needlessly. */
const CLOSED_BUG_STATUSES = new Set(["Closed", "Resolved", "Rejected", "Done"])

let statusCache: { key: string; closedIds: Set<string> } | null = null

async function isExternalStatusClosed(
  provider: WorkItemProvider,
  statusId: string | undefined,
  statusName: string | undefined
): Promise<boolean | null> {
  if (!statusId && !statusName) return null
  try {
    const key = provider.provider
    if (!statusCache || statusCache.key !== key) {
      const statuses = await provider.getStatuses()
      statusCache = { key, closedIds: new Set(statuses.filter((s) => s.isClosed).map((s) => s.id)) }
      // Also index by name for providers whose events carry names not ids.
      for (const s of statuses) if (s.isClosed) statusCache.closedIds.add(s.name)
    }
    if (statusId && statusCache.closedIds.has(statusId)) return true
    if (statusName && statusCache.closedIds.has(statusName)) return true
    return false
  } catch {
    return null
  }
}

/**
 * Reconcile a single inbound event. Returns true when a local change was applied.
 */
export async function reconcileInboundEvent(
  projectId: string,
  providerId: ProviderId,
  provider: WorkItemProvider,
  event: NormalizedInboundEvent
): Promise<boolean> {
  const mapping = await prisma.externalSyncMapping.findFirst({
    where: { projectId, provider: providerId as any, externalId: event.externalId },
  })
  if (!mapping) return false

  const occurredAt = event.occurredAt || new Date()

  if (mapping.localEntityType === "BugReport") {
    const bug = await prisma.bugReport.findUnique({ where: { id: mapping.localEntityId } })
    if (!bug) return false
    // Last-writer-wins: don't overwrite a fresher local edit.
    if (bug.updatedAt && bug.updatedAt > occurredAt) return false

    const data: Record<string, any> = {}
    if (event.changed.title && event.changed.title !== bug.title) {
      data.title = event.changed.title.replace(/^\[BUG\]\s*/, "")
    }
    const closed = await isExternalStatusClosed(provider, event.changed.statusId, event.changed.statusName)
    if (closed === true && !CLOSED_BUG_STATUSES.has(bug.status)) data.status = "Closed"
    else if (closed === false && CLOSED_BUG_STATUSES.has(bug.status)) data.status = "Open"

    if (Object.keys(data).length === 0) return false
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
