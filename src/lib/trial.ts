import { prisma } from "@/lib/db"

const DAY_MS = 24 * 60 * 60 * 1000

export function daysToDate(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + days * DAY_MS)
}

/** True while a trial is still running (trialEndsAt set and in the future). */
export function isTrialActive(trialEndsAt: Date | null | undefined): boolean {
  return !!trialEndsAt && trialEndsAt.getTime() > Date.now()
}

/** Whole days left in the trial (0 if expired/none). */
export function trialDaysRemaining(trialEndsAt: Date | null | undefined): number {
  if (!trialEndsAt) return 0
  const ms = trialEndsAt.getTime() - Date.now()
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS)
}

/**
 * Downgrade every Pro user whose trial has elapsed to Free. Idempotent and
 * cheap (single indexed updateMany). Paid Pro users have trialEndsAt = null and
 * are excluded. trialEndsAt is intentionally left in place so the account still
 * reads as an "expired trial" in the admin panel.
 */
export async function expireDueTrials(): Promise<void> {
  await prisma.user.updateMany({
    where: { plan: "Pro", trialEndsAt: { not: null, lte: new Date() } },
    data: { plan: "Free" },
  })
}
