import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { getAiPolicy } from "@/lib/hub-ai-providers"

export const dynamic = "force-dynamic"

// GET /api/hub/agent/usage — token + cost usage rollups for the dashboard:
// daily series (last 30 days), rolling day/week/month totals, and a per-provider
// breakdown. All derived from real AiUsageEvent rows.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(dayStart)
  weekStart.setDate(weekStart.getDate() - 6)
  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const rangeStart = new Date(dayStart)
  rangeStart.setDate(rangeStart.getDate() - 29)

  const events = await prisma.aiUsageEvent.findMany({
    where: { createdAt: { gte: rangeStart } },
    orderBy: { createdAt: "asc" }
  })

  // Daily buckets across the 30-day window (zero-filled).
  const dailyMap = new Map<string, { tokens: number; cost: number; calls: number }>()
  for (let i = 0; i < 30; i++) {
    const d = new Date(rangeStart)
    d.setDate(d.getDate() + i)
    dailyMap.set(d.toISOString().slice(0, 10), { tokens: 0, cost: 0, calls: 0 })
  }

  const totals = { day: 0, week: 0, month: 0 }
  const byProvider = new Map<string, { tokens: number; cost: number; calls: number }>()

  for (const e of events) {
    const key = e.createdAt.toISOString().slice(0, 10)
    const bucket = dailyMap.get(key)
    if (bucket) {
      bucket.tokens += e.totalTokens
      bucket.cost += e.costUsd
      bucket.calls += 1
    }
    if (e.createdAt >= dayStart) totals.day += e.costUsd
    if (e.createdAt >= weekStart) totals.week += e.costUsd
    if (e.createdAt >= monthStart) totals.month += e.costUsd

    const pv = byProvider.get(e.provider) || { tokens: 0, cost: 0, calls: 0 }
    pv.tokens += e.totalTokens
    pv.cost += e.costUsd
    pv.calls += 1
    byProvider.set(e.provider, pv)
  }

  const policy = await getAiPolicy()

  return NextResponse.json({
    daily: Array.from(dailyMap.entries()).map(([date, v]) => ({ date, ...v })),
    totals,
    byProvider: Array.from(byProvider.entries()).map(([provider, v]) => ({ provider, ...v })),
    grandTotal: {
      tokens: events.reduce((s, e) => s + e.totalTokens, 0),
      cost: events.reduce((s, e) => s + e.costUsd, 0),
      calls: events.length
    },
    budget: { monthlyBudgetUsd: policy.monthlyBudgetUsd, monthSpend: totals.month }
  })
}
