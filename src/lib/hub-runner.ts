// Shared Test Studio run pipeline: writes the script into the Playwright
// workspace, spawns the run in the background, streams logs into the
// TestExecution row, and harvests evidence on completion.
// Used by POST /api/hub/scripts/{id}/run and by the AI Agent's run_test tool.
//
// This used to spawn `mvn test` against a hardcoded SHAFT/Maven directory that
// contained no pom.xml and no sources, under a JAVA_HOME pinned to one
// machine's Homebrew path. It could not run locally and certainly not in a
// container. Playwright is already a dependency of this app, already installed
// wherever it is deployed, and produces the trace/video/screenshot artifacts
// the Evidence Vault and Trace Viewer are built around.

import { prisma } from "@/lib/db"
import { spawn } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { harvestEvidence, extractTargetUrl } from "@/lib/hub-evidence"
import { parseAndStoreAccessibility } from "@/lib/hub-accessibility"
import {
  WORKSPACE_ROOT,
  RESULTS_DIR,
  clearResults,
  projectForBrowser,
  specFileName,
  writeConfig,
  writeSpec,
} from "@/lib/hub-workspace"

// Recursively find the newest image artifact created after `since`.
function findLatestScreenshot(since: number): string | null {
  let newest: { file: string; mtime: number } | null = null

  const walk = (dir: string, depth: number) => {
    if (depth > 5 || !fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
      } else if (/\.(png|jpg|jpeg)$/i.test(entry.name)) {
        const stat = fs.statSync(full)
        if (stat.size < 5 * 1024) continue
        if (stat.mtimeMs >= since && (!newest || stat.mtimeMs > newest.mtime)) {
          newest = { file: full, mtime: stat.mtimeMs }
        }
      }
    }
  }
  walk(RESULTS_DIR, 0)
  return newest ? (newest as { file: string }).file : null
}

export interface ExecutionTargetLike {
  /** Optional: some callers pass a target shape assembled from the row. */
  id?: string
  name: string
  type: string // "local" | "docker" | "grid" | "browserstack"
  url: string
  platform: string // "Linux" | "Windows" | "Mac"
  browser: string
  headless: boolean
}

export interface HubScriptLike {
  id: string
  name: string
  type: string
  code: string
}

/**
 * Start a Playwright run in the background; returns the executionId at once.
 *
 * Deliberately fire-and-forget, as before: the UI polls the TestExecution row
 * and streams logOutput, so the HTTP request that starts a run must not wait
 * for a browser session to finish.
 */
export async function startScriptRun(
  script: HubScriptLike,
  browser: string,
  debug = false,
  target?: ExecutionTargetLike,
  accessibility = false
): Promise<string> {
  const remote = target && target.type !== "local"
  // A non-local target may pin its own browser; otherwise honour the toolbar choice.
  const effectiveBrowser = remote && target.browser ? target.browser : browser
  const headless = effectiveBrowser.toLowerCase() === "headless" || Boolean(target?.headless)
  const projectName = projectForBrowser(effectiveBrowser)

  writeConfig({
    headless,
    // grid/browserstack expose a websocket endpoint Playwright can attach to;
    // a docker target is reached the same way.
    remoteUrl: remote ? target!.url : null,
  })
  const specRelPath = writeSpec(script.name, script.code)
  clearResults()

  const targetLabel = remote ? target!.name : "Local"
  const header =
    `[Test Studio] Queued ${script.name} on ${projectName} · target: ${targetLabel}` +
    `${debug ? " (debug mode)" : ""}...\n`

  const execution = await prisma.testExecution.create({
    data: {
      scriptId: script.id,
      status: "Running",
      logOutput: header,
      browser,
      executionTarget: remote ? target!.name : null,
    },
  })

  const started = Date.now()
  const args = [
    "playwright",
    "test",
    specRelPath,
    `--project=${projectName}`,
    "--reporter=list",
  ]
  // Playwright's own debug output, rather than Maven's -e.
  const env = { ...process.env, ...(debug ? { DEBUG: "pw:api" } : {}) }

  const child = spawn("npx", args, { cwd: WORKSPACE_ROOT, env })

  let logBuffer = header
  let lastFlush = 0
  let flushing = false

  const flushLogs = async (force = false) => {
    if (flushing) return
    if (!force && Date.now() - lastFlush < 1000) return
    flushing = true
    lastFlush = Date.now()
    try {
      await prisma.testExecution.update({
        where: { id: execution.id },
        data: { logOutput: logBuffer },
      })
    } catch {
      // execution may have been deleted mid-run; ignore
    } finally {
      flushing = false
    }
  }

  child.stdout.on("data", (d) => {
    logBuffer += d.toString()
    flushLogs()
  })
  child.stderr.on("data", (d) => {
    logBuffer += d.toString()
    flushLogs()
  })

  child.on("error", async (err) => {
    logBuffer +=
      `\n[Test Studio] Failed to start Playwright: ${err.message}\n` +
      `If browsers are missing, run: npx playwright install\n`
    try {
      await prisma.testExecution.update({
        where: { id: execution.id },
        data: { status: "Failed", logOutput: logBuffer, duration: Date.now() - started },
      })
    } catch {}
  })

  child.on("close", async (code) => {
    // Playwright exits non-zero on any failed test; the log markers are a
    // secondary check for the cases where it cannot start at all.
    const failed =
      code !== 0 ||
      /\b\d+ failed\b/.test(logBuffer) ||
      logBuffer.includes("Error: No tests found")

    const screenshotPath = findLatestScreenshot(started)

    try {
      await prisma.testExecution.update({
        where: { id: execution.id },
        data: {
          status: failed ? "Failed" : "Passed",
          logOutput: logBuffer,
          duration: Date.now() - started,
          screenshotPath,
          // Playwright's HTML report replaces the Allure link.
          allureLink: null,
        },
      })

      await harvestEvidence({
        executionId: execution.id,
        since: started,
        status: failed ? "fail" : "pass",
        scriptName: script.name,
        scriptType: script.type,
        browser: projectName,
        targetUrl: extractTargetUrl(script.code),
      })

      if (accessibility) {
        await parseAndStoreAccessibility({
          executionId: execution.id,
          scriptId: script.id,
          since: started,
        })
      }
    } catch {}
  })

  return execution.id
}

/** Where a script's spec lives, for callers that show or open it. */
export function specPathFor(scriptName: string): string {
  return path.join(WORKSPACE_ROOT, "tests", specFileName(scriptName))
}
