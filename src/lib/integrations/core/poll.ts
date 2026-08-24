/**
 * Inbound polling — the fallback for providers without webhooks (OpenProject) or
 * instances where webhooks aren't registered. Re-reads each mapped external item's
 * current state and reconciles it locally via reconcileInboundEvent.
 *
 * Intended to be called on an interval by the worker (npm run worker) and also
 * exposed as a manual "Pull changes now" action.
 */
import { prisma } from "@/lib/db"
import { loadIntegration } from "./load-integration"
import { reconcileInboundEvent } from "./inbound"
import { readBugStatusMapping } from "./bug-status-mapping"
import type { NormalizedInboundEvent } from "./types"

export interface PollResult {
  checked: number
  applied: number
}

/** Poll one project's mapped items and reconcile any external changes. */
export async function pollInboundForProject(projectId: string): Promise<PollResult> {
  const loaded = await loadIntegration(projectId)
  if (!loaded || !loaded.inboundSyncEnabled) return { checked: 0, applied: 0 }

  const provider = loaded.getClient()
  const mappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: loaded.provider as any },
  })

  // Read the project's bug status mapping once and hand it to every reconcile,
  // rather than letting each of them re-query it per work package.
  const ctx = { bugStatusMapping: readBugStatusMapping(loaded.statusMapping) }

  let checked = 0
  let applied = 0
  for (const m of mappings) {
    try {
      const item = await provider.getWorkItem(m.externalId)
      checked++
      const event: NormalizedInboundEvent = {
        externalId: m.externalId,
        changed: {
          statusId: item.statusId || undefined,
          statusName: item.statusName || undefined,
          title: item.title || undefined,
          assigneeId: item.assigneeId || undefined,
          priorityId: item.priorityId || undefined,
        },
        occurredAt: new Date(),
        action: "updated",
      }
      const did = await reconcileInboundEvent(projectId, loaded.provider, provider, event, ctx)
      if (did) applied++
    } catch (err: any) {
      console.warn(`[poll] ${loaded.provider} item ${m.externalId} failed: ${err?.message}`)
    }
  }
  return { checked, applied }
}

/** Poll every project that has inbound sync enabled (unified model). */
export async function pollAllInbound(): Promise<{ projects: number; applied: number }> {
  const integrations = await prisma.projectIntegration.findMany({
    where: { inboundSyncEnabled: true, enabled: true },
    select: { projectId: true },
  })
  let applied = 0
  for (const { projectId } of integrations) {
    try {
      const r = await pollInboundForProject(projectId)
      applied += r.applied
    } catch (err: any) {
      console.warn(`[poll] project ${projectId} failed: ${err?.message}`)
    }
  }
  return { projects: integrations.length, applied }
}
