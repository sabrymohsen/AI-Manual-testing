// Shared Automation Hub run pipeline: writes the script into the Playwright
// workspace, runs it, streams logs into the TestExecution row, and on
// completion stores per-test results and harvests evidence.
// Used by POST /api/hub/scripts/{id}/run, POST /api/hub/runs (folder / all)
// and the AI Agent's run_test tool.
//
// Hub tests are Playwright JavaScript (.spec.js). The hub once shelled out to
// `mvn test` against a SHAFT/Maven directory that had no pom.xml; Playwright is
// already a dependency here and produces the trace/video/screenshot artifacts
// the Evidence Vault and Trace Viewer are built around.
//
// Runs are QUEUED and executed one at a time. They share one workspace and
// test-results/ is cleared at the start of each run, so two runs at once would
// delete each other's evidence. Each finished run's folder is moved to
// runs/<executionId>/ so its screenshots, traces and videos stay available.

import { prisma } from "@/lib/db"
import { spawn } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { harvestEvidence, extractTargetUrl } from "@/lib/hub-evidence"
import { parseAndStoreAccessibility } from "@/lib/hub-accessibility"
import { RUN_LOG_PATH } from "@/lib/hub-logs"
import { readRunReport, summarize, type HubTestResult } from "@/lib/hub-report"
import { decryptSecret } from "@/lib/crypto"
import {
  WORKSPACE_ROOT,
  RESULTS_DIR,
  archiveResults,
  clearResults,
  projectForBrowser,
  specFileName,
  writeConfig,
  writeSpec,
} from "@/lib/hub-workspace"

/** Hard stop for one run, so a hung browser can't block the queue forever. */
const RUN_TIMEOUT_MS = Number(process.env.HUB_RUN_TIMEOUT_MS) || 15 * 60 * 1000

// Recursively find the newest image artifact under `root`.
function findLatestScreenshot(root: string): string | null {
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
        if (!newest || stat.mtimeMs > newest.mtime) newest = { file: full, mtime: stat.mtimeMs }
      }
    }
  }
  walk(root, 0)
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
  /** Owning project: its Data & Config variables are added to the run. */
  projectId?: string | null
}

/**
 * Variables from Automation Hub → Data & settings, as process.env for the run:
 * global ones, then the project's own (which win). This is how a recorded
 * test's `process.env.RECORDED_PASSWORD` gets a value without the password
 * ever being written into the test. Secret values are returned separately so
 * the log can mask them.
 */
async function loadRunVariables(projectId?: string | null): Promise<{ env: Record<string, string>; secrets: string[] }> {
  const env: Record<string, string> = {}
  const secrets: string[] = []
  try {
    const rows = await prisma.environmentVariable.findMany({
      where: { OR: [{ scope: "global" }, ...(projectId ? [{ scope: "project", projectId }] : [])] },
      orderBy: { scope: "asc" }, // "global" before "project", so project values override
    })
    for (const r of rows) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(r.name)) continue
      let value = r.valuePlain ?? ""
      if (r.isSecret && r.valueEncrypted) {
        try {
          value = decryptSecret(r.valueEncrypted as any)
        } catch {
          continue // unreadable with this key: leave it unset rather than fail the run
        }
      }
      env[r.name] = value
      if (r.isSecret && value.length >= 4) secrets.push(value)
    }
  } catch {
    // No table yet: run with the process environment only.
  }
  return { env, secrets }
}

// ───────────────────────── queue ─────────────────────────
// Kept on globalThis: in `next dev` every API route is its own bundle, and a
// module-level variable would give each route a separate queue.
interface QueueState {
  tail: Promise<void>
  waiting: number
  recovered: boolean
}
const g = globalThis as unknown as { __hubRunQueue?: QueueState }
const queue: QueueState = (g.__hubRunQueue ||= { tail: Promise.resolve(), waiting: 0, recovered: false })

/** Runs left "Queued"/"Running" by a server that stopped mid-run can never finish. */
async function recoverInterruptedRuns() {
  if (queue.recovered) return
  queue.recovered = true
  try {
    await prisma.testExecution.updateMany({
      where: { status: { in: ["Queued", "Running"] } },
      data: { status: "Failed", logOutput: "[Automation Hub] This run was interrupted: the server stopped before it finished.\n" },
    })
  } catch {}
}

function enqueue(job: () => Promise<void>): number {
  const ahead = queue.waiting
  queue.waiting++
  queue.tail = queue.tail
    .then(job)
    .catch((err) => console.error("[hub-runner] run failed:", err))
    .finally(() => {
      queue.waiting--
    })
  return ahead
}

export interface StartRunOptions {
  browser: string
  debug?: boolean
  target?: ExecutionTargetLike
  accessibility?: boolean
  batchId?: string | null
}

/**
 * Queue a Playwright run; returns the executionId at once.
 *
 * Fire-and-forget on purpose: the UI polls the TestExecution row and streams
 * logOutput, so the HTTP request that starts a run must not wait for it.
 */
export async function startScriptRun(
  script: HubScriptLike,
  browser: string,
  debug = false,
  target?: ExecutionTargetLike,
  accessibility = false,
  batchId: string | null = null
): Promise<string> {
  await recoverInterruptedRuns()

  const remote = target && target.type !== "local"
  const targetLabel = remote ? target!.name : "Local"

  const execution = await prisma.testExecution.create({
    data: {
      scriptId: script.id,
      status: "Queued",
      logOutput: `[Automation Hub] Queued ${script.name} · target: ${targetLabel}\n`,
      browser,
      executionTarget: remote ? target!.name : null,
      batchId,
    },
  })

  const ahead = enqueue(() => executeRun(execution.id, script, { browser, debug, target, accessibility }))
  if (ahead > 0) {
    await prisma.testExecution
      .update({
        where: { id: execution.id },
        data: { logOutput: `[Automation Hub] Queued ${script.name} · waiting for ${ahead} earlier run(s) to finish\n` },
      })
      .catch(() => {})
  }
  return execution.id
}

/** Queue several scripts as one batch (Run folder / Run all). */
export async function startBatchRun(
  scripts: (HubScriptLike & { accessibilityEnabled?: boolean })[],
  opts: { browser: string; target?: ExecutionTargetLike; batchId: string }
): Promise<string[]> {
  const ids: string[] = []
  for (const s of scripts) {
    ids.push(await startScriptRun(s, opts.browser, false, opts.target, Boolean(s.accessibilityEnabled), opts.batchId))
  }
  return ids
}

async function executeRun(
  executionId: string,
  script: HubScriptLike,
  opts: { browser: string; debug?: boolean; target?: ExecutionTargetLike; accessibility?: boolean }
): Promise<void> {
  // Deleted while it waited in the queue.
  const stillThere = await prisma.testExecution.findUnique({ where: { id: executionId }, select: { id: true } })
  if (!stillThere) return

  const { browser, debug, target, accessibility } = opts
  const remote = target && target.type !== "local"
  // A non-local target may pin its own browser; otherwise honour the toolbar choice.
  const effectiveBrowser = remote && target!.browser ? target!.browser : browser
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
    `[Automation Hub] Running ${script.name} on ${projectName}${headless ? " (headless)" : ""} · target: ${targetLabel}` +
    `${debug ? " · debug" : ""}\n` +
    `$ npx playwright test ${specRelPath} --project=${projectName}\n\n`

  const started = Date.now()
  await prisma.testExecution.update({
    where: { id: executionId },
    data: { status: "Running", logOutput: header },
  })

  let logBuffer = header
  let lastFlush = 0
  let flushing = false
  const flushLogs = async (force = false) => {
    if (flushing) return
    if (!force && Date.now() - lastFlush < 1000) return
    flushing = true
    lastFlush = Date.now()
    try {
      await prisma.testExecution.update({ where: { id: executionId }, data: { logOutput: logBuffer } })
    } catch {
      // execution may have been deleted mid-run; ignore
    } finally {
      flushing = false
    }
  }

  // Tee to disk as well as the DB: the Evidence Vault's log viewer tails this
  // file by byte offset, so it can follow a run that is still going.
  try {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true })
    fs.writeFileSync(RUN_LOG_PATH, header, "utf8")
  } catch {}
  let mask: (text: string) => string = (t) => t
  const append = (raw: string) => {
    const chunk = mask(raw)
    logBuffer += chunk
    try {
      fs.appendFileSync(RUN_LOG_PATH, chunk)
    } catch {}
    flushLogs()
  }

  const vars = await loadRunVariables(script.projectId)
  mask = (text: string) => vars.secrets.reduce((t, sec) => t.split(sec).join("***"), text)

  const args = ["playwright", "test", specRelPath, `--project=${projectName}`, "--reporter=list,json"]
  const env = {
    ...process.env,
    ...vars.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(RESULTS_DIR, "report.json"),
    FORCE_COLOR: "0",
    ...(debug ? { DEBUG: "pw:api" } : {}),
  }

  const exitCode: number | null = await new Promise((resolve) => {
    const child = spawn("npx", args, { cwd: WORKSPACE_ROOT, env })
    const timer = setTimeout(() => {
      append(`\n[Automation Hub] Stopped after ${Math.round(RUN_TIMEOUT_MS / 60000)} minutes without finishing.\n`)
      child.kill("SIGTERM")
    }, RUN_TIMEOUT_MS)
    child.stdout.on("data", (d) => append(d.toString()))
    child.stderr.on("data", (d) => append(d.toString()))
    child.on("error", (err) => {
      append(`\n[Automation Hub] Failed to start Playwright: ${err.message}\nIf browsers are missing, run: npx playwright install\n`)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })

  // Keep this run's artifacts: the next run clears test-results/.
  let root = RESULTS_DIR
  try {
    root = archiveResults(executionId)
  } catch (err) {
    console.error("[hub-runner] could not archive run artifacts:", err)
  }

  const results: HubTestResult[] = readRunReport(root, RESULTS_DIR)
  const sum = summarize(results)
  // The report is the source of truth when there is one; the exit code covers
  // runs that never got as far as running a test (syntax error, no browser).
  const failed =
    results.length > 0
      ? sum.failed > 0 || exitCode !== 0
      : exitCode !== 0 || /\b\d+ failed\b/.test(logBuffer) || logBuffer.includes("No tests found")

  const firstFailure = results.find((r) => r.error)
  const screenshotPath = firstFailure?.screenshot || results.find((r) => r.screenshot)?.screenshot || findLatestScreenshot(root)

  logBuffer +=
    `\n[Automation Hub] ${failed ? "FAILED" : "PASSED"}` +
    (results.length ? ` · ${sum.passed} passed, ${sum.failed} failed${sum.skipped ? `, ${sum.skipped} skipped` : ""}${sum.flaky ? `, ${sum.flaky} flaky` : ""}` : "") +
    ` · ${((Date.now() - started) / 1000).toFixed(1)}s\n`

  try {
    await prisma.testExecution.update({
      where: { id: executionId },
      data: {
        status: failed ? "Failed" : "Passed",
        logOutput: logBuffer,
        duration: Date.now() - started,
        screenshotPath,
        results: results as any,
        allureLink: null,
      },
    })

    await harvestEvidence({
      executionId,
      since: 0, // the folder holds only this run's files
      root,
      status: failed ? "fail" : "pass",
      scriptName: script.name,
      scriptType: script.type,
      browser: projectName,
      targetUrl: extractTargetUrl(script.code),
    })

    if (accessibility) {
      await parseAndStoreAccessibility({ executionId, scriptId: script.id, since: 0, root })
    }
  } catch (err) {
    console.error("[hub-runner] could not store run results:", err)
  }
}

/** Where a script's spec lives, for callers that show or open it. */
export function specPathFor(scriptName: string): string {
  return path.join(WORKSPACE_ROOT, "tests", specFileName(scriptName))
}
