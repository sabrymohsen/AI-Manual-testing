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
  /** Absolute paths inside the run's archive folder. */
  screenshot?: string
  trace?: string
  video?: string
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
