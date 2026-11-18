import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

// Locator Health (Heal Center, Section 6) is derived from real self-healing
// history: every HealingEvent means a locator broke and had to be recovered, so
// heal frequency + recovery confidence + review status give an honest stability
// signal per locator. Resolution time is a strategy-based ESTIMATE (SHAFT's
// locator-health timing instrumentation is off), surfaced as such in the UI.

const STRATEGY_MAP: Record<string, string> = {
  id: "id",
  name: "name",
  cssSelector: "css",
  className: "class",
  tagName: "tag",
  linkText: "link",
  partialLinkText: "partial-link",
  xpath: "xpath",
  accessibilityId: "a11y-id"
}

function parseStrategy(locator: string): string {
  const m = locator.match(/By\.(\w+)/)
  if (m) return STRATEGY_MAP[m[1]] || m[1]
  if (locator.startsWith("//") || locator.startsWith("(//")) return "xpath"
  if (/^[.#[]/.test(locator)) return "css"
  return "custom"
}

// Strategy + complexity → estimated resolution time (labeled "est." in the UI).
function estResolutionMs(locator: string, strategy: string): number {
  let base =
    strategy === "id" || strategy === "a11y-id"
      ? 40
      : strategy === "name"
      ? 55
      : strategy === "css" || strategy === "class"
      ? 90
      : strategy === "xpath"
      ? 180
      : 120
  if (/contains\(|text\(\)|following|ancestor|\/\/\*/.test(locator)) base += 120
  const depth = (locator.match(/\//g) || []).length
  base += depth * 12
  base += Math.min(60, Math.floor(locator.length / 4))
  return Math.round(base)
}

function recommendations(locator: string, strategy: string): string[] {
  const recs: string[] = []
  if (strategy === "class") recs.push("Prefer a stable data-testid or accessibilityId — CSS classes change with restyling.")
  if (strategy === "xpath") {
    if (/text\(\)/.test(locator)) recs.push("Text-based XPath breaks when copy changes; anchor on a stable attribute instead.")
    if (/contains\(@class/.test(locator)) recs.push("class-contains XPath is brittle on restyle; add a dedicated data-testid.")
    if (!/@id|@data-/.test(locator)) recs.push("Deep XPath is position-fragile; scope it to a stable parent element.")
  }
  if (strategy === "id" && /old|deprecated|tmp|temp|\d{3,}/.test(locator))
    recs.push("This ID looks dynamic/deprecated; pin a stable data-testid on the element.")
  if (strategy === "css" && /nth-child|>\s*\w+\s*>/.test(locator))
    recs.push("Structural CSS path is layout-fragile; target the element directly via data-testid.")
  if (recs.length === 0) recs.push("Add a dedicated data-testid to guarantee resilient targeting.")
  return recs
}

function band(score: number): "green" | "yellow" | "orange" | "red" {
  return score >= 90 ? "green" : score >= 70 ? "yellow" : score >= 50 ? "orange" : "red"
}

export async function GET() {
  // Workspace-wide data with no project attached: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const events = await prisma.healingEvent.findMany({ orderBy: { createdAt: "desc" } })

    const groups = new Map<string, typeof events>()
    for (const e of events) {
      const arr = groups.get(e.originalLocator) || []
      arr.push(e)
      groups.set(e.originalLocator, arr)
    }

    const locators = Array.from(groups.entries()).map(([locator, evs]) => {
      const strategy = parseStrategy(locator)
      const healCount = evs.length
      const alternatives = new Set(evs.map((e) => e.recoveredLocator)).size
      const avgConfidence = evs.reduce((s, e) => s + e.confidence, 0) / evs.length
      const needsReview = evs.some((e) => e.status === "needs_review")
      const lastChanged = evs[0].createdAt // findMany ordered desc

      // Post-heal stability: start from the healer's confidence in the current
      // recovery, penalise churn (repeat heals), pending review and brittle types.
      let score = Math.round(avgConfidence * 100)
      score -= (healCount - 1) * 8
      if (needsReview) score -= 18
      if (strategy === "xpath") score -= 4
      if (strategy === "class") score -= 3
      score = Math.max(5, Math.min(100, score))

      const estMs = estResolutionMs(locator, strategy)

      return {
        locator,
        page: evs[0].pageUrl,
        strategy,
        healCount,
        alternatives,
        avgConfidence,
        needsReview,
        lastChanged,
        stabilityScore: score,
        band: band(score),
        estResolutionMs: estMs,
        latestRecovered: evs[0].recoveredLocator,
        testName: evs[0].testName,
        recommendations: recommendations(locator, strategy)
      }
    })

    const atRisk = locators
      .map((l) => ({
        ...l,
        risk: 100 - l.stabilityScore + (l.needsReview ? 20 : 0) + Math.min(30, l.estResolutionMs / 12) + (l.healCount - 1) * 6
      }))
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 10)

    const summary = {
      total: locators.length,
      green: locators.filter((l) => l.band === "green").length,
      yellow: locators.filter((l) => l.band === "yellow").length,
      orange: locators.filter((l) => l.band === "orange").length,
      red: locators.filter((l) => l.band === "red").length,
      needsReview: locators.filter((l) => l.needsReview).length,
      avgScore: locators.length ? Math.round(locators.reduce((s, l) => s + l.stabilityScore, 0) / locators.length) : 0
    }

    const pages = Array.from(new Set(locators.map((l) => l.page).filter(Boolean))).sort()

    return NextResponse.json({ locators, atRisk, summary, pages })
  } catch (err: any) {
    console.error("GET locator-health error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
