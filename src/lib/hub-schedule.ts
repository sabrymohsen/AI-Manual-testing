import { prisma } from "@/lib/db"
import { startScopedRun, type RunScope } from "@/lib/hub-runs"

/**
 * Scheduled Automation Hub runs ("every weekday at 02:00, run regression").
 * Times are the server's local time. A ticker (src/instrumentation.ts) calls
 * runDueSchedules every minute.
 */

export type Frequency = "daily" | "weekdays" | "hourly"

export interface ScheduleTiming {
  frequency: Frequency
  timeOfDay?: string | null
  everyHours?: number | null
}

export function validTiming(t: ScheduleTiming): string | null {
  if (!["daily", "weekdays", "hourly"].includes(t.frequency)) return "Pick how often it runs"
  if (t.frequency === "hourly") {
    if (!t.everyHours || t.everyHours < 1 || t.everyHours > 24) return "Every 1–24 hours"
  } else if (!t.timeOfDay || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.timeOfDay)) {
    return "Time must be HH:MM (24-hour)"
  }
  return null
}

/** Next run strictly after `from`. */
export function nextRunAfter(t: ScheduleTiming, from: Date): Date {
  if (t.frequency === "hourly") {
    const next = new Date(from)
    next.setMinutes(0, 0, 0)
    next.setHours(next.getHours() + (t.everyHours || 1))
    return next
  }
  const [h, m] = (t.timeOfDay || "00:00").split(":").map(Number)
  const next = new Date(from)
  next.setHours(h, m, 0, 0)
  if (next <= from) next.setDate(next.getDate() + 1)
  if (t.frequency === "weekdays") {
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1)
  }
  return next
}

/**
 * Starts every schedule that is due. Each one is claimed by moving its
 * nextRunAt forward with a conditional update, so two server processes (or a
 * dev reload) can't both start the same run.
 */
export async function runDueSchedules(now = new Date()) {
  const due = await prisma.hubSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, take: 20 })
  let started = 0
  for (const s of due) {
    const next = nextRunAfter(s as ScheduleTiming, now)
    const claim = await prisma.hubSchedule.updateMany({
      where: { id: s.id, nextRunAt: s.nextRunAt },
      data: { nextRunAt: next, lastRunAt: now },
    })
    if (claim.count !== 1) continue

    // Skip if this schedule's previous run is still going — don't pile up.
    if (s.lastBatchId) {
      const busy = await prisma.testExecution.count({
        where: { OR: [{ batchId: s.lastBatchId }, { id: s.lastBatchId }], status: { in: ["Queued", "Running"] } },
      })
      if (busy) continue
    }

    try {
      const res = await startScopedRun(s.projectId, (s.scope ?? {}) as RunScope, {
        browser: s.browser,
        meta: { triggerSource: "schedule", triggeredByName: `Schedule “${s.name}”`, environment: (s as any).environment ?? null },
      })
      if (!("error" in res)) {
        await prisma.hubSchedule.update({
          where: { id: s.id },
          data: { lastBatchId: res.batchId ?? res.executionIds[0] ?? null },
        })
        started++
      }
    } catch (err) {
      console.error(`[hub-schedule] ${s.name} failed to start:`, err)
    }
  }
  return started
}

/** Starts the once-a-minute ticker (idempotent across dev reloads). */
export function startScheduler() {
  const g = globalThis as unknown as { __hubScheduler?: NodeJS.Timeout }
  if (g.__hubScheduler) return
  g.__hubScheduler = setInterval(() => {
    runDueSchedules().catch((err) => console.error("[hub-schedule] tick failed:", err))
  }, 60_000)
  g.__hubScheduler.unref?.()
}

/** Only the scope keys a schedule may carry, bounded. */
export function cleanScope(raw: any): Record<string, unknown> {
  const scope: Record<string, unknown> = {}
  if (Array.isArray(raw?.scriptIds) && raw.scriptIds.length) scope.scriptIds = raw.scriptIds.map(String).slice(0, 500)
  if (typeof raw?.folder === "string" && raw.folder) scope.folder = raw.folder.slice(0, 200)
  if (typeof raw?.tag === "string" && raw.tag) scope.tag = raw.tag.slice(0, 40)
  return scope
}

