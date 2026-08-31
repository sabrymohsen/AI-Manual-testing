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
 *     tests/<Script>.spec.ts   one file per Test Studio script
 *     test-results/            Playwright's own output: traces, video, shots
 */
import * as fs from "fs"
import * as path from "path"
import { STORAGE_ROOT } from "@/lib/storage-health"

export const WORKSPACE_ROOT = path.resolve(STORAGE_ROOT, "hub-workspace")
export const TESTS_DIR = path.join(WORKSPACE_ROOT, "tests")
export const RESULTS_DIR = path.join(WORKSPACE_ROOT, "test-results")
export const CONFIG_PATH = path.join(WORKSPACE_ROOT, "playwright.config.ts")

/** Playwright's project name for a browser the UI offers. */
export function projectForBrowser(browser: string): string {
  const b = (browser || "").toLowerCase()
  if (b.includes("firefox")) return "firefox"
  if (b.includes("webkit") || b.includes("safari")) return "webkit"
  return "chromium"
}

/** A script name reduced to something safe to use as a file name. */
export function specFileName(scriptName: string): string {
  const base = (scriptName || "test").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
  return `${base || "test"}.spec.ts`
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
export function writeConfig(opts: RunConfigOptions): void {
  fs.mkdirSync(TESTS_DIR, { recursive: true })

  const connect = opts.remoteUrl
    ? `\n      connectOptions: { wsEndpoint: ${JSON.stringify(opts.remoteUrl)} },`
    : ""

  const config = `// Generated per run by src/lib/hub-workspace.ts — edits here are overwritten.
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "./test-results/report.json" }]],
  timeout: ${opts.timeoutMs ?? 60_000},
  use: {
    headless: ${opts.headless},
    // Always captured: the Evidence Vault and Trace Viewer read these.
    trace: "on",
    video: "on",
    screenshot: "on",${connect}
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
})
`
  fs.writeFileSync(CONFIG_PATH, config, "utf8")
}

/** Write a script's code as a spec and return its path relative to the root. */
export function writeSpec(scriptName: string, code: string): string {
  fs.mkdirSync(TESTS_DIR, { recursive: true })
  const file = path.join(TESTS_DIR, specFileName(scriptName))
  fs.writeFileSync(file, code, "utf8")
  return path.relative(WORKSPACE_ROOT, file)
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
