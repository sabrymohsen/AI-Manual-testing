// Auto-Wait Profiler for the Flake Map (Section 7).
// SHAFT v10 (Playwright-based) synchronises with document-ready + network-idle
// rather than the legacy jQuery/Angular/XHR engines, and it does not emit a
// dedicated wait-profiler file. We therefore derive the wait profile from the
// REAL per-action durations in each shaft-trace.zip, bucketed by SHAFT's actual
// action categories, and cross-reference the FlakyTest table for context.

import { prisma } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"
import { ARTIFACT_ROOT } from "@/lib/hub-evidence"
import { listTraces, resolveTraceZip, unzipEntry, sanitizeJsonControlChars } from "@/lib/hub-traces"

const CUSTOM_PROPS = path.join(ARTIFACT_ROOT, "src/main/resources/properties/custom.properties")

// Buckets reflect the wait types SHAFT v10 actually performs.
export type WaitBucket = "navigation" | "elementSync" | "lazyLoad" | "validation" | "other"

export const BUCKET_LABEL: Record<WaitBucket, string> = {
  navigation: "Navigation / documentReady",
  elementSync: "Element identification",
  lazyLoad: "Lazy-load (network-idle)",
  validation: "Validation sync",
  other: "Other"
}

function readWaitConfig() {
  const out: Record<string, string> = {}
  if (fs.existsSync(CUSTOM_PROPS)) {
    for (const line of fs.readFileSync(CUSTOM_PROPS, "utf8").split("\n")) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const i = t.indexOf("=")
      if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  }
  return {
    elementTimeoutSec: Number(out["defaultElementIdentificationTimeout"]) || 30,
    lazyLoadTimeoutSec: Number(out["waitForLazyLoadingTimeout"]) || 30,
    networkIdleQuietMs: Number(out["lazyLoadingNetworkIdleQuietWindowMillis"]) || 500
  }
}

function bucketFor(action: any): WaitBucket {
  const c = (action.category || "").toLowerCase()
  const name = (action.name || "").toLowerCase()
  if (c === "browser" || /navigate|open|get\b|goto/.test(name)) return "navigation"
  if (c === "element") return "elementSync"
  if (c === "wait" || /lazy|load|idle/.test(name)) return "lazyLoad"
  if (c === "validation" || c === "assertion" || /assert|verify|validat/.test(name)) return "validation"
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
    recs.push(`This test waits ~${seconds(p.avgWaitMs)}s per action on average — consider tightening the ${p.config.elementTimeoutSec}s element timeout.`)
  }

  for (const b of p.unnecessary) {
    recs.push(`${BUCKET_LABEL[b as WaitBucket]} wait resolves in ~0ms across ${p.bucketCounts[b as WaitBucket]} action(s) — safe to reduce or disable for this page.`)
  }

  // Element timeout is configured in seconds but observed waits are far lower.
  if (p.maxWaitMs > 0 && p.maxWaitMs < p.config.elementTimeoutSec * 1000 * 0.2) {
    recs.push(`Longest observed wait is ${p.maxWaitMs}ms but the element timeout is ${p.config.elementTimeoutSec}s — lowering it shortens failure latency without risking stable steps.`)
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
    let trace: any
    try {
      trace = JSON.parse(sanitizeJsonControlChars(await unzipEntry(zip, "shaft-trace.json")))
    } catch {
      continue
    }
    const actions: any[] = Array.isArray(trace.actions) ? trace.actions : []
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

    const simpleClass = String(trace.test?.className || "").split(".").pop() || t.className
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
      methodName: trace.test?.methodName || "",
      status: trace.test?.status || "unknown",
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
