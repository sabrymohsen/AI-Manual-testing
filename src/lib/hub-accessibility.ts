// Section 1b — Accessibility Audit parsing.
// Accessibility results are read from whatever axe-core JSON a run leaves in
// test-results/ — typically written by a spec using @axe-core/playwright and
// testInfo.attach(). The engine no longer produces them on its own, so a run
// with no such artifact reports "no audit" rather than inventing one.
// After an execution completes we scan the workspace for those artifacts, parse
// the axe-core shape, derive a WCAG compliance level, and persist an
// AccessibilityResult row tied to the execution. If no artifact is found we do
// nothing (the panel then shows an empty state rather than fabricated data).

import { prisma } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"
import { RESULTS_DIR } from "@/lib/hub-workspace"

export interface AccessibilityViolation {
  ruleId: string
  severity: "critical" | "serious" | "moderate" | "minor"
  element: string
  description: string
  fix: string
}

interface ParsedAudit {
  wcagLevel: "A" | "AA" | "AAA" | "None"
  passCount: number
  violationCount: number
  violations: AccessibilityViolation[]
}

const SEVERITIES = ["critical", "serious", "moderate", "minor"] as const

// Find JSON artifacts created after `since` that look like axe-core / accessibility output
function findAccessibilityArtifacts(since: number, root: string = RESULTS_DIR): string[] {
  const roots = [root]
  const hits: { file: string; mtime: number }[] = []

  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (!entry.name.toLowerCase().endsWith(".json")) continue
      const stat = fs.statSync(full)
      if (stat.mtimeMs < since || stat.size === 0) continue
      const named = /accessib|axe|wcag/i.test(entry.name)
      hits.push({ file: full, mtime: stat.mtimeMs, ...(named ? { priority: 1 } : {}) } as any)
    }
  }
  roots.forEach((r) => walk(r, 0))
  // Prefer clearly-named files first, then most recent
  return hits.sort((a, b) => b.mtime - a.mtime).map((h) => h.file)
}

function normalizeSeverity(impact: any): AccessibilityViolation["severity"] {
  const v = String(impact || "").toLowerCase()
  return (SEVERITIES as readonly string[]).includes(v) ? (v as any) : "moderate"
}

// Derive the WCAG compliance level from the tags of the violated rules.
function deriveWcagLevel(violations: any[]): ParsedAudit["wcagLevel"] {
  const tags: string[] = violations.flatMap((v) => v.tags || [])
  const failA = tags.some((t) => /^wcag\d+a$/.test(t))
  const failAA = tags.some((t) => /^wcag\d+aa$/.test(t))
  const failAAA = tags.some((t) => /^wcag\d+aaa$/.test(t))
  if (failA) return "None"
  if (failAA) return "A"
  if (failAAA) return "AA"
  if (violations.length > 0) return "None" // untagged violations still break compliance
  return "AAA"
}

// Parse a single axe-core style report object into our audit shape
function parseAxeReport(obj: any): ParsedAudit | null {
  const rawViolations = obj?.violations
  const rawPasses = obj?.passes
  if (!Array.isArray(rawViolations)) return null

  const violations: AccessibilityViolation[] = rawViolations.map((v: any) => {
    const node = Array.isArray(v.nodes) && v.nodes[0] ? v.nodes[0] : {}
    const target = Array.isArray(node.target) ? node.target.join(" ") : node.target
    return {
      ruleId: v.id || v.ruleId || "unknown",
      severity: normalizeSeverity(v.impact),
      element: target || node.html || "—",
      description: v.description || v.help || "",
      fix: v.helpUrl || v.help || ""
    }
  })

  return {
    wcagLevel: deriveWcagLevel(rawViolations),
    passCount: Array.isArray(rawPasses) ? rawPasses.length : Number(obj?.passCount) || 0,
    violationCount: violations.length,
    violations
  }
}

// Scan for the first parseable accessibility artifact and persist it.
// Returns the created AccessibilityResult id, or null when nothing was found.
export async function parseAndStoreAccessibility(opts: {
  executionId: string
  scriptId: string
  since: number
  /** The run's own folder (runs/<executionId>); defaults to test-results. */
  root?: string
}): Promise<string | null> {
  const files = findAccessibilityArtifacts(opts.since, opts.root)

  for (const file of files) {
    try {
      const parsed = parseAxeReport(JSON.parse(fs.readFileSync(file, "utf8")))
      if (!parsed) continue

      const result = await prisma.accessibilityResult.upsert({
        where: { testExecutionId: opts.executionId },
        create: {
          testExecutionId: opts.executionId,
          scriptId: opts.scriptId,
          wcagLevel: parsed.wcagLevel,
          passCount: parsed.passCount,
          violationCount: parsed.violationCount,
          violations: parsed.violations as any
        },
        update: {
          wcagLevel: parsed.wcagLevel,
          passCount: parsed.passCount,
          violationCount: parsed.violationCount,
          violations: parsed.violations as any
        }
      })
      return result.id
    } catch {
      // not an axe report — keep scanning
    }
  }
  return null
}
