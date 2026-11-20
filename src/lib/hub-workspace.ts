/**
 * The Playwright workspace the Automation Hub runs tests in.
 *
 * Replaces the SHAFT/Maven workspace the hub used to shell out to. That path
 * was hardcoded to one developer's home directory and pointed at a folder
 * holding a single custom.properties file — no pom.xml, no sources — so
 * `mvn test` could not succeed anywhere, least of all on a container with no
 * Java and no Maven. Test Studio stored Java that nothing could execute.
 *
 * This workspace is created on demand under STORAGE_ROOT, the same writable
 * (and on Railway, volume-backed) location the rest of the app's artifacts use,
 * so a run works identically on a laptop and in a container.
 *
 * Layout:
 *   <root>/hub-workspace/
 *     playwright.config.ts    generated, see writeConfig
 *     tests/<Script>.spec.js   one file per hub test (Playwright JavaScript)
 *     active/<executionId>/    a run in progress — its own config, spec and
 *                              test-results/, so several runs can go at once
 *     runs/<executionId>/      each finished run's test-results, kept for its evidence
 *     test-results/            legacy single-run folder (older runs only)
 */
import * as fs from "fs"
import * as path from "path"
import { STORAGE_ROOT } from "@/lib/storage-health"
import { needsStepsRuntime, STEPS_RUNTIME_FILE } from "@/lib/plain-english/to-playwright"
import { QA_STEPS_RUNTIME } from "@/lib/plain-english/runtime/qa-steps-runtime.generated"

export const WORKSPACE_ROOT = path.resolve(STORAGE_ROOT, "hub-workspace")
export const TESTS_DIR = path.join(WORKSPACE_ROOT, "tests")
export const RESULTS_DIR = path.join(WORKSPACE_ROOT, "test-results")
export const CONFIG_PATH = path.join(WORKSPACE_ROOT, "playwright.config.ts")
/**
 * Finished runs. test-results/ is wiped at the start of every run, and the
 * Evidence Vault, Trace Viewer and Video Lab all point at files inside it — so
 * every run's evidence used to vanish the moment the next run started. Each
 * run's folder is moved here when it finishes instead.
 */
export const RUNS_DIR = path.join(WORKSPACE_ROOT, "runs")

/** In-progress runs, one isolated folder each. */
export const ACTIVE_DIR = path.join(WORKSPACE_ROOT, "active")

/** Where a finished run's artifacts live. */
export function runDir(executionId: string): string {
  return path.join(RUNS_DIR, executionId.replace(/[^A-Za-z0-9-]/g, ""))
}

/**
 * Move test-results/ into runs/<executionId>/ and return the new folder.
 * A rename is atomic and instant on the same volume; copy is the fallback.
 */
export function archiveResults(executionId: string): string {
  const dest = runDir(executionId)
  fs.mkdirSync(RUNS_DIR, { recursive: true })
  fs.rmSync(dest, { recursive: true, force: true })
  try {
    fs.renameSync(RESULTS_DIR, dest)
  } catch {
    fs.cpSync(RESULTS_DIR, dest, { recursive: true })
    fs.rmSync(RESULTS_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  return dest
}

/** Playwright's project name for a browser the UI offers. */
export function projectForBrowser(browser: string): string {
  const b = (browser || "").toLowerCase()
  if (b.includes("firefox")) return "firefox"
  if (b.includes("webkit") || b.includes("safari")) return "webkit"
  return "chromium"
}

/** A script name reduced to something safe to use as a file name. */
export function specBaseName(scriptName: string): string {
  const name = scriptName || "test"
  const base = name.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
  // Names in other scripts (Arabic…) lose most characters here; a short hash of
  // the full name keeps two such tests from sharing one file.
  if (/[^\x00-\x7F]/.test(name)) return `${base || "test"}_${shortHash(name)}`
  return base || "test"
}

function shortHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

/** Hub tests are Playwright JavaScript, so their files are .spec.js. */
export function specFileName(scriptName: string): string {
  return `${specBaseName(scriptName)}.spec.js`
}

export interface RunConfigOptions {
  headless: boolean
  /** ws:// or http:// endpoint of a remote browser/grid, when not local. */
  remoteUrl?: string | null
  timeoutMs?: number
}

/**
 * Write the config for this run.
 *
 * Trace, video and screenshots are always ON. They are the whole point of the
 * hub's Evidence Vault and Trace Viewer, and Playwright's trace.zip is the same
 * artifact the Trace Viewer already knows how to read — the format the SHAFT
 * integration was approximating.
 */
export function writeConfig(opts: RunConfigOptions, dir: string = WORKSPACE_ROOT): void {
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true })

  // Saved settings from Data & Config → Properties. Read lazily and by require
  // path rather than a top-level import, because hub-properties imports this
  // module for WORKSPACE_ROOT and a static cycle would be needless.
  let saved: Record<string, string> = {}
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    saved = require("@/lib/hub-properties").readProps() as Record<string, string>
  } catch {
    // No settings yet, or unreadable — the defaults below still give a valid run.
  }

  const str = (key: string, fallback: string) => {
    const v = saved[key]
    return v === undefined || v === "" ? fallback : v
  }
  const num = (key: string, fallback: number) => {
    const v = Number(saved[key])
    return Number.isFinite(v) ? v : fallback
  }
  const bool = (key: string, fallback: boolean) =>
    saved[key] === undefined ? fallback : saved[key] === "true"

  const headers = str("extraHTTPHeaders", "")
    .split(";")
    .map((pair) => {
      // Split on the FIRST colon only: a header value may contain colons
      // (a URL, a timestamp), and splitting on all of them would truncate it.
      const i = pair.indexOf(":")
      return i === -1 ? [pair] : [pair.slice(0, i), pair.slice(i + 1)]
    })
    .filter((p) => p.length > 1 && p[0].trim())
    .reduce<Record<string, string>>((acc, [k, v]) => {
      acc[k.trim()] = (v || "").trim()
      return acc
    }, {})

  const optional: string[] = []
  const push = (line: string) => optional.push(`    ${line}`)
  if (opts.remoteUrl) push(`connectOptions: { wsEndpoint: ${JSON.stringify(opts.remoteUrl)} },`)
  if (str("baseURL", "")) push(`baseURL: ${JSON.stringify(str("baseURL", ""))},`)
  if (str("locale", "")) push(`locale: ${JSON.stringify(str("locale", ""))},`)
  if (str("timezoneId", "")) push(`timezoneId: ${JSON.stringify(str("timezoneId", ""))},`)
  if (str("userAgent", "")) push(`userAgent: ${JSON.stringify(str("userAgent", ""))},`)
  if (Object.keys(headers).length) push(`extraHTTPHeaders: ${JSON.stringify(headers)},`)
  if (bool("ignoreHTTPSErrors", false)) push(`ignoreHTTPSErrors: true,`)
  if (num("actionTimeout", 0) > 0) push(`actionTimeout: ${num("actionTimeout", 0)},`)
  if (num("slowMo", 0) > 0) push(`launchOptions: { slowMo: ${num("slowMo", 0)} },`)

  const config = `// Generated per run by src/lib/hub-workspace.ts — edits here are overwritten.
// Values come from Data & Config → Properties; anything unset uses the default.
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: ${bool("fullyParallel", false)},
  workers: ${num("workers", 1)},
  retries: ${num("retries", 0)},
  reporter: [["list"], ["json", { outputFile: "./test-results/report.json" }]],
  timeout: ${opts.timeoutMs ?? num("timeout", 60_000)},
  expect: { timeout: ${num("expectTimeout", 5_000)} },
  use: {
    headless: ${opts.headless},
    viewport: { width: ${num("viewportWidth", 1280)}, height: ${num("viewportHeight", 720)} },
    navigationTimeout: ${num("navigationTimeout", 30_000)},
    // Evidence capture: the Evidence Vault and Trace Viewer read these.
    trace: ${JSON.stringify(str("trace", "on"))},
    video: ${JSON.stringify(str("video", "on"))},
    screenshot: ${JSON.stringify(str("screenshot", "on"))},
${optional.join("\n")}
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
})
`
  fs.writeFileSync(path.join(dir, "playwright.config.ts"), config, "utf8")
}

/**
 * An isolated folder for one run: its own config, spec and test-results.
 * Every run used to share tests/, playwright.config.ts and test-results/, so
 * only one could run at a time across the whole server.
 */
export function prepareRunWorkspace(
  executionId: string,
  script: { name: string; code: string },
  config: RunConfigOptions
): { dir: string; resultsDir: string; specRelPath: string } {
  const dir = path.join(ACTIVE_DIR, executionId.replace(/[^A-Za-z0-9-]/g, ""))
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true })
  writeConfig(config, dir)
  const file = path.join(dir, "tests", specFileName(script.name))
  fs.writeFileSync(file, script.code, "utf8")
  writeStepsRuntime(path.join(dir, "tests"), script.code)
  const resultsDir = path.join(dir, "test-results")
  fs.mkdirSync(resultsDir, { recursive: true })
  return { dir, resultsDir, specRelPath: path.relative(dir, file) }
}

/** Moves a finished run's results to runs/<executionId>/ and removes its work folder. */
export function finishRunWorkspace(executionId: string, dir: string): string {
  const dest = runDir(executionId)
  const results = path.join(dir, "test-results")
  fs.mkdirSync(RUNS_DIR, { recursive: true })
  fs.rmSync(dest, { recursive: true, force: true })
  try {
    fs.renameSync(results, dest)
  } catch {
    try {
      fs.cpSync(results, dest, { recursive: true })
    } catch {
      fs.mkdirSync(dest, { recursive: true })
    }
  }
  fs.rmSync(dir, { recursive: true, force: true })
  return dest
}

/** Write a script's code as a spec and return its path relative to the root. */
export function writeSpec(scriptName: string, code: string): string {
  fs.mkdirSync(TESTS_DIR, { recursive: true })
  // Specs used to be written as .ts; drop a stale twin so it can't run too.
  fs.rmSync(path.join(TESTS_DIR, `${specBaseName(scriptName)}.spec.ts`), { force: true })
  const file = path.join(TESTS_DIR, specFileName(scriptName))
  fs.writeFileSync(file, code, "utf8")
  writeStepsRuntime(TESTS_DIR, code)
  return path.relative(WORKSPACE_ROOT, file)
}

/** No-code tests require qa-steps.cjs (the plain-English step runner) beside them. */
export function writeStepsRuntime(testsDir: string, code: string): void {
  if (!needsStepsRuntime(code)) return
  fs.writeFileSync(path.join(testsDir, STEPS_RUNTIME_FILE), QA_STEPS_RUNTIME, "utf8")
}

/**
 * Clear the previous run's artifacts.
 *
 * Evidence is harvested by modification time, so leftovers from an earlier run
 * would be attributed to this one — which is exactly the kind of thing that
 * makes a report untrustworthy.
 */
export function clearResults(): void {
  try {
    fs.rmSync(RESULTS_DIR, { recursive: true, force: true })
  } catch {
    // A locked or missing directory is not worth failing a run over.
  }
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
}
