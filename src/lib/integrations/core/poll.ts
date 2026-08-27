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
  /** Items the tracker refused or could not return, and the first reason why. */
  failed: number
  error?: string
  /**
   * Why nothing was checked, when nothing was. Without this the caller cannot
   * tell "the tracker had no news" from "this project has no integration", and
   * a manual pull that did nothing reported success either way.
   */
  skipped?: "no-integration" | "inbound-disabled" | "no-mappings"
}

export interface PollOptions {
  /**
   * Run even when the project's `inboundSyncEnabled` flag is off.
   *
   * That flag governs the UNATTENDED path — the worker and webhooks — where
   * reading a tracker nobody asked about is a surprise. A person clicking
   * "Pull changes" has asked, so the flag is not their answer. It also
   * defaults to false, and is hardcoded false for legacy OpenProject rows,
   * which is why the button silently did nothing on most projects.
   */
  force?: boolean
}

/** Poll one project's mapped items and reconcile any external changes. */
export async function pollInboundForProject(
  projectId: string,
  opts: PollOptions = {}
): Promise<PollResult> {
  const loaded = await loadIntegration(projectId)
  if (!loaded) return { checked: 0, applied: 0, failed: 0, skipped: "no-integration" }
  if (!loaded.inboundSyncEnabled && !opts.force) {
    return { checked: 0, applied: 0, failed: 0, skipped: "inbound-disabled" }
  }

  const provider = loaded.getClient()
  const mappings = await prisma.externalSyncMapping.findMany({
    where: { projectId, provider: loaded.provider as any },
  })

  // Read the project's bug status mapping once and hand it to every reconcile,
  // rather than letting each of them re-query it per work package.
  const ctx = { bugStatusMapping: readBugStatusMapping(loaded.statusMapping) }

  if (mappings.length === 0) {
    return { checked: 0, applied: 0, failed: 0, skipped: "no-mappings" }
  }

  let checked = 0
  let applied = 0
  let failed = 0
  let firstError: string | undefined
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
      // Swallowed per item so one deleted work package cannot end the pull —
      // but counted and reported, because a pull where every item failed used
      // to be indistinguishable from a pull where nothing had changed.
      failed++
      if (!firstError) firstError = err?.message || "Unknown error"
      console.warn(`[poll] ${loaded.provider} item ${m.externalId} failed: ${err?.message}`)
    }
  }
  return { checked, applied, failed, error: firstError }
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
