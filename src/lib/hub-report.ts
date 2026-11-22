/**
 * Per-test results from Playwright's JSON reporter.
 *
 * The hub used to judge a whole run from its exit code and a regex over the
 * console log, so a run with five tests and one failure showed one red badge
 * and a wall of text. The JSON report (written by the config in
 * hub-workspace.ts) says exactly which test failed, where, and why, and where
 * its screenshot, trace and video are.
 */
import * as fs from "fs"
import * as path from "path"

export type HubTestStatus = "passed" | "failed" | "timedOut" | "skipped" | "interrupted" | "flaky"

export interface HubTestResult {
  /** "describe > test title" */
  title: string
  file: string
  line?: number
  project?: string
  status: HubTestStatus
  durationMs: number
  retries: number
  error?: {
    message: string
    /** The source lines around the failure, as Playwright prints them. */
    snippet?: string
    line?: number
  }
  /** The test's named steps (test.step — a no-code test's sentences), in order. */
  steps?: HubStepResult[]
  /** Elements on the page when it failed (from Playwright's page snapshot), for suggestions. */
  page?: PageElement[]
  /** Absolute paths inside the run's archive folder. */
  screenshot?: string
  trace?: string
  video?: string
}

export interface HubStepResult {
  title: string
  status: "passed" | "failed" | "skipped"
  durationMs: number
  error?: string
}

export interface PageElement {
  role: string
  name: string
}

/**
 * The named elements in Playwright's ARIA page snapshot (error-context.md):
 *   - button "Proceed to checkout" [ref=e3]
 *   - textbox "Coupon" [active] [ref=e6]: SAVE10
 */
export function parsePageSnapshot(markdown: string): PageElement[] {
  const yaml = markdown.match(/# Page snapshot\s*```ya?ml\n([\s\S]*?)```/)?.[1] ?? ""
  const out: PageElement[] = []
  const seen = new Set<string>()
  for (const line of yaml.split("\n")) {
    const m = line.match(/^\s*-\s+([a-z]+)\s+"((?:[^"\\]|\\.)+)"/)
    if (m) {
      const el = { role: m[1], name: cleanName(m[2].replace(/\\"/g, '"')) }
      const key = `${el.role}|${el.name}`
      if (el.name && !seen.has(key)) {
        seen.add(key)
        out.push(el)
      }
      continue
    }
    // Plain text nodes: "- text: Coupon" / "- paragraph: Total 350"
    const t = line.match(/^\s*-\s+(text|paragraph|cell|listitem|strong|generic):\s+(.+)$/)
    if (t && !/^\[|ref=/.test(t[2])) {
      const name = cleanName(t[2].replace(/^"|"$/g, ""))
      const key = `text|${name}`
      if (name && name.length < 200 && !seen.has(key)) {
        seen.add(key)
        out.push({ role: "text", name })
      }
    }
    if (out.length >= 300) break
  }
  return out
}

/** Icon-font glyphs (private-use characters) and extra spaces out of an accessible name. */
export function cleanName(s: string): string {
  return s.replace(/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}]/gu, "").replace(/\s+/g, " ").trim()
}

function topSteps(result: any): HubStepResult[] {
  return (result?.steps || []).map((st: any) => ({
    title: String(st.title || "").slice(0, 500),
    status: st.error ? "failed" : "passed",
    durationMs: st.duration || 0,
    ...(st.error ? { error: stripAnsi(st.error.message || String(st.error.value || "")).trim().slice(0, 1000) } : {}),
  })) as HubStepResult[]
}

export interface HubRunSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  flaky: number
}

// Strip terminal colour codes: Playwright colours its error messages.
const ANSI = /\u001b\[[0-9;]*m/g
export const stripAnsi = (s: string) => (s || "").replace(ANSI, "")

function collectSpecs(suite: any, parents: string[], out: any[]) {
  const here = suite.title && !/\.spec\.[jt]s$/.test(suite.title) ? [...parents, suite.title] : parents
  for (const spec of suite.specs || []) out.push({ spec, parents: here, file: spec.file || suite.file })
  for (const child of suite.suites || []) collectSpecs(child, here, out)
}

/**
 * Parse report.json. `fromDir`/`toDir` remap attachment paths when the run's
 * folder was moved after Playwright wrote them (test-results → runs/<id>).
 */
export function parsePlaywrightReport(json: any, fromDir?: string, toDir?: string): HubTestResult[] {
  const specs: any[] = []
  for (const suite of json?.suites || []) collectSpecs(suite, [], specs)

  const remap = (p?: string) => {
    if (!p) return undefined
    if (fromDir && toDir && p.startsWith(fromDir)) return path.join(toDir, p.slice(fromDir.length))
    return p
  }

  const results: HubTestResult[] = []
  for (const { spec, parents, file } of specs) {
    for (const t of spec.tests || []) {
      const runs: any[] = t.results || []
      const last = runs[runs.length - 1] || {}
      let status: HubTestStatus =
        t.status === "flaky" ? "flaky" : t.status === "skipped" ? "skipped" : (last.status as HubTestStatus) || "failed"
      if (!["passed", "failed", "timedOut", "skipped", "interrupted", "flaky"].includes(status)) status = "failed"

      // A timeout reports two errors: "Test timeout of …" and the step that was
      // waiting ("locator.click: …" with the code snippet). Lead with the one
      // that says where it got stuck.
      const errs: any[] = (last.errors && last.errors.length ? last.errors : last.error ? [last.error] : []).filter(Boolean)
      const primary = errs.find((e) => e.snippet) || errs[errs.length - 1]
      const err = primary
        ? {
            ...primary,
            message: [primary, ...errs.filter((e) => e !== primary)]
              .map((e) => stripAnsi(e.message || String(e.value || "")).trim())
              .filter((m, i, all) => m && all.indexOf(m) === i)
              .join("\n\n"),
          }
        : undefined
      const attachments: any[] = runs.flatMap((r) => r.attachments || [])
      const find = (pred: (a: any) => boolean) => remap(attachments.filter(pred).pop()?.path)
      const steps = topSteps(last)
      let page: PageElement[] | undefined
      const ctx = find((a) => a.name === "error-context" && a.path)
      if (ctx && status !== "passed") {
        try {
          page = parsePageSnapshot(fs.readFileSync(ctx, "utf8"))
        } catch {}
      }

      results.push({
        title: [...parents, spec.title].join(" > "),
        file: file || "",
        line: spec.line,
        project: t.projectName,
        status,
        durationMs: runs.reduce((n, r) => n + (r.duration || 0), 0),
        retries: Math.max(0, runs.length - 1),
        ...(err && status !== "passed" && status !== "skipped"
          ? {
              error: {
                message: stripAnsi(err.message || String(err.value || "")).trim().slice(0, 4000),
                snippet: err.snippet ? stripAnsi(err.snippet).slice(0, 2000) : undefined,
                line: err.location?.line,
              },
            }
          : {}),
        ...(steps.length ? { steps } : {}),
        ...(page?.length ? { page } : {}),
        screenshot: find((a) => a.contentType?.startsWith("image/") && a.path),
        trace: find((a) => a.name === "trace" && a.path),
        video: find((a) => a.contentType?.startsWith("video/") && a.path),
      })
    }
  }
  return results
}

/** Read <dir>/report.json; [] when the run never got far enough to write it. */
export function readRunReport(dir: string, originalDir?: string): HubTestResult[] {
  const file = path.join(dir, "report.json")
  if (!fs.existsSync(file)) return []
  try {
    return parsePlaywrightReport(JSON.parse(fs.readFileSync(file, "utf8")), originalDir, dir)
  } catch {
    return []
  }
}

export function summarize(results: HubTestResult[]): HubRunSummary {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed" || r.status === "timedOut" || r.status === "interrupted").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    flaky: results.filter((r) => r.status === "flaky").length,
  }
}

// ── JUnit XML (pytest --junitxml, and most other runners) ──────────────────

const xmlText = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")

function xmlAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = xmlText(m[2])
  return out
}

/**
 * Parse a JUnit XML report into the hub's per-test results. A pytest
 * Playwright project on a tester's computer reports this way.
 */
export function parseJunitReport(xml: string): HubTestResult[] {
  const out: HubTestResult[] = []
  if (typeof xml !== "string") return out
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const a = xmlAttrs(m[1])
    const body = m[2] || ""
    const fail = body.match(/<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/)
    const skip = body.match(/<skipped\b([^>]*?)(?:\/>|>([\s\S]*?)<\/skipped>)/)
    // pytest: classname "tests.smoke.test_x" (+ ".TestClass"); show the class, not the module path.
    const cls = (a.classname || "").split(".").filter((p) => /^[A-Z]/.test(p))
    const file = a.file || (a.classname ? a.classname.split(".").filter((p) => !/^[A-Z]/.test(p)).join("/") + ".py" : "")
    const r: HubTestResult = {
      title: [...cls, a.name || "test"].join(" > "),
      file,
      line: a.line ? Number(a.line) + 1 : undefined,
      status: fail ? "failed" : skip ? "skipped" : "passed",
      durationMs: Math.round((Number(a.time) || 0) * 1000),
      retries: 0,
    }
    if (fail) {
      const fa = xmlAttrs(fail[2] || "")
      const detail = stripAnsi(xmlText(fail[3] || "")).trim()
      r.error = {
        message: (fa.message || detail.split("\n").find((l) => l.trim()) || (fail[1] === "error" ? "Error" : "Failed")).slice(0, 2000),
        snippet: detail ? detail.slice(-4000) : undefined,
      }
    } else if (skip) {
      const sa = xmlAttrs(skip[1] || "")
      if (sa.message) r.error = { message: sa.message.slice(0, 1000) }
    }
    out.push(r)
  }
  return out
}
