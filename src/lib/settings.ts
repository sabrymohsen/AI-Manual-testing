import { prisma } from "@/lib/db"

/**
 * Platform-wide settings backed by the AppSetting key/value table. Values are
 * stored as strings; typed getters coerce and fall back to sane defaults so a
 * missing row never breaks a flow.
 */

export const DEFAULT_TRIAL_DAYS = 14

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}

/** Default free-trial length (days) granted to new signups. */
export async function getTrialDays(): Promise<number> {
  const raw = await getSetting("trialDays")
  const n = raw !== null ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TRIAL_DAYS
}

export async function setTrialDays(days: number): Promise<void> {
  const clean = Math.max(0, Math.floor(Number.isFinite(days) ? days : DEFAULT_TRIAL_DAYS))
  await setSetting("trialDays", String(clean))
}
