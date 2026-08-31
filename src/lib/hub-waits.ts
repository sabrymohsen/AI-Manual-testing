// Auto-Wait Profiler for the Flake Map (Section 7).
//
// Playwright emits no wait-profiler file, so the profile is derived from the
// REAL per-action durations in each run's trace.zip, bucketed by the action
// categories the trace parser assigns, and cross-referenced with the FlakyTest
// table. The buckets and the configured timeouts are Playwright's own; they
// were SHAFT's element-identification and lazy-load settings, which no longer
// exist and were read from a file nothing wrote.

import { prisma } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"
import { listTraces, resolveTraceZip } from "@/lib/hub-traces"
import { parsePlaywrightTrace } from "@/lib/hub-playwright-trace"
import { readProps } from "@/lib/hub-properties"

// Buckets reflect where a Playwright run actually spends time.
export type WaitBucket = "navigation" | "elementSync" | "lazyLoad" | "validation" | "other"

export const BUCKET_LABEL: Record<WaitBucket, string> = {
  navigation: "Navigation",
  elementSync: "Element interaction",
  lazyLoad: "Explicit waits",
  validation: "Assertion retries",
  other: "Setup / other"
}

function readWaitConfig() {
  // The timeouts the next run will actually use, from Data & Config.
  const out = readProps()
  const ms = (key: string, fallback: number) => {
    const v = Number(out[key])
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  return {
    // Kept in seconds: every message below reads better in seconds, and the
    // element timeout used to be configured that way.
    elementTimeoutSec: Math.round(ms("actionTimeout", ms("timeout", 60_000)) / 1000),
    navigationTimeoutSec: Math.round(ms("navigationTimeout", 30_000) / 1000),
    expectTimeoutSec: Math.round(ms("expectTimeout", 5_000) / 1000),
  }
}

function bucketFor(action: any): WaitBucket {
  const c = (action.category || "").toLowerCase()
  const name = (action.name || "").toLowerCase()
  if (c === "navigation" || /goto|navigate/.test(name)) return "navigation"
  if (c === "interaction") return "elementSync"
  if (c === "wait" || /waitfor/.test(name)) return "lazyLoad"
  if (c === "assertion" || /expect|assert/.test(name)) return "validation"
  return "other"
}

// Waits that always resolve near-instantly are candidates to reduce/disable.
const UNNECESSARY_MS = 5

interface WaitProfile {
  id: string
  testName: string
  methodName: string
  status: string
  actionCount: number
  totalWaitMs: number
  avgWaitMs: number
  maxWaitMs: number
  buckets: Record<WaitBucket, number>
  bucketCounts: Record<WaitBucket, number>
  unnecessary: WaitBucket[]
  perAction: { name: string; bucket: WaitBucket; durationMs: number; status: string }[]
  flakinessScore: number | null
  rootCause: string | null
  suggestedFix: string | null
  recommendations: string[]
}

function buildRecommendations(p: {
  totalWaitMs: number
  avgWaitMs: number
  maxWaitMs: number
  buckets: Record<WaitBucket, number>
  bucketCounts: Record<WaitBucket, number>
  unnecessary: WaitBucket[]
  config: ReturnType<typeof readWaitConfig>
  flakinessScore: number | null
  rootCause: string | null
  suggestedFix: string | null
}): string[] {
  const recs: string[] = []
  const seconds = (ms: number) => (ms / 1000).toFixed(1)

  if (p.avgWaitMs >= 3000) {
    recs.push(`This test waits ~${seconds(p.avgWaitMs)}s per action on average — consider tightening the ${p.config.elementTimeoutSec}s action timeout.`)
  }

  for (const b of p.unnecessary) {
    recs.push(`${BUCKET_LABEL[b as WaitBucket]} wait resolves in ~0ms across ${p.bucketCounts[b as WaitBucket]} action(s) — safe to reduce or disable for this page.`)
  }

  // Element timeout is configured in seconds but observed waits are far lower.
  if (p.maxWaitMs > 0 && p.maxWaitMs < p.config.elementTimeoutSec * 1000 * 0.2) {
    recs.push(`Longest observed wait is ${p.maxWaitMs}ms but the action timeout is ${p.config.elementTimeoutSec}s — lowering it shortens failure latency without risking stable steps.`)
  }

  if (p.buckets.elementSync > 0 && p.flakinessScore && p.flakinessScore > 0.3) {
    recs.push(`Element sync dominates on a flaky test (${Math.round(p.flakinessScore * 100)}%) — use an explicit clickable/visible wait for the dynamic element.`)
  }

  if (p.suggestedFix) recs.push(`Flake analysis: ${p.suggestedFix}`)
  if (recs.length === 0) recs.push("Wait profile is lean — no synchronization changes recommended.")
  return recs
}

export async function buildWaitProfiles() {
  const config = readWaitConfig()
  const traces = await listTraces()
  const flaky = await prisma.flakyTest.findMany()

  const profiles: WaitProfile[] = []

  for (const t of traces) {
    const zip = resolveTraceZip(t.id)
    if (!zip) continue
    let actions: any[] = []
    try {
      // Setup steps (browser launch, fixtures) are excluded: they are the same
      // fixed cost on every test and would swamp the profile of the steps
      // someone can actually do something about.
      actions = (await parsePlaywrightTrace(zip)).actions.filter((a) => a.category !== "setup")
    } catch {
      continue
    }
    if (actions.length === 0) continue

    const buckets: Record<WaitBucket, number> = { navigation: 0, elementSync: 0, lazyLoad: 0, validation: 0, other: 0 }
    const bucketCounts: Record<WaitBucket, number> = { navigation: 0, elementSync: 0, lazyLoad: 0, validation: 0, other: 0 }
    let total = 0
    let maxWaitMs = 0

    const perAction = actions.map((a) => {
      const bucket = bucketFor(a)
      const d = Number(a.durationMs) || 0
      buckets[bucket] += d
      bucketCounts[bucket] += 1
      total += d
      if (d > maxWaitMs) maxWaitMs = d
      return { name: a.name || "action", bucket, durationMs: d, status: a.status || "unknown" }
    })

    const unnecessary = (Object.keys(buckets) as WaitBucket[]).filter(
      (b) => bucketCounts[b] > 0 && buckets[b] <= UNNECESSARY_MS
    )

    const simpleClass = t.className
    const fk =
      flaky.find((f) => f.testName.split(".")[0] === simpleClass) ||
      flaky.find((f) => simpleClass && f.testName.toLowerCase().includes(simpleClass.toLowerCase())) ||
      null

    const avgWaitMs = Math.round(total / actions.length)

    const recommendations = buildRecommendations({
      totalWaitMs: total,
      avgWaitMs,
      maxWaitMs,
      buckets,
      bucketCounts,
      unnecessary,
      config,
      flakinessScore: fk ? fk.flakinessScore : null,
      rootCause: fk ? fk.rootCause : null,
      suggestedFix: fk ? fk.suggestedFix : null
    })

    profiles.push({
      id: t.id,
      testName: simpleClass,
      methodName: t.methodName || "",
      status: t.status || "unknown",
      actionCount: actions.length,
      totalWaitMs: total,
      avgWaitMs,
      maxWaitMs,
      buckets,
      bucketCounts,
      unnecessary,
      perAction,
      flakinessScore: fk ? fk.flakinessScore : null,
      rootCause: fk ? fk.rootCause : null,
      suggestedFix: fk ? fk.suggestedFix : null,
      recommendations
    })
  }

  const suiteTotal = profiles.reduce((s, p) => s + p.totalWaitMs, 0)
  // Potential savings = time spent in wait buckets flagged as reducible.
  const potentialSavings = profiles.reduce(
    (s, p) => s + p.unnecessary.reduce((x, b) => x + p.buckets[b], 0),
    0
  )

  return {
    config,
    profiles,
    suite: {
      testCount: profiles.length,
      totalWaitMs: suiteTotal,
      avgWaitMs: profiles.length ? Math.round(suiteTotal / profiles.reduce((s, p) => s + p.actionCount, 0) || 0) : 0,
      potentialSavingsMs: potentialSavings,
      flaggedTests: profiles.filter((p) => p.unnecessary.length > 0).length
    }
  }
}
