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

import { notify } from "@/lib/notifications"
import { loadRunVariables as loadTestDataVariables } from "@/lib/plain-english/variables"
import { prisma } from "@/lib/db"
import { spawn, type ChildProcess } from "child_process"
import { cleanRunEnv } from "@/lib/hub-access"
import { recalcMany } from "@/lib/test-cases/rollup"
import * as fs from "fs"
import * as path from "path"
import { harvestEvidence, extractTargetUrl } from "@/lib/hub-evidence"
import { parseAndStoreAccessibility } from "@/lib/hub-accessibility"
import { RUN_LOG_PATH } from "@/lib/hub-logs"
import { readRunReport, summarize, type HubTestResult } from "@/lib/hub-report"
import { decryptSecret } from "@/lib/crypto"
import {
  WORKSPACE_ROOT,
  finishRunWorkspace,
  prepareRunWorkspace,
  projectForBrowser,
  specFileName,
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
interface Job {
  executionId: string
  projectId: string | null
  run: () => Promise<void>
}

/**
 * Run scheduler. Runs used to go strictly one at a time for the whole server,
 * so one project's 15-minute batch blocked every other project. Now:
 *   - up to HUB_MAX_PARALLEL_RUNS runs at once (default 3), each in its own
 *     workspace folder (see prepareRunWorkspace)
 *   - at most one run per project at a time, so a big batch in one project
 *     can't take every slot — other projects' runs overtake it fairly
 */
interface QueueState {
  waitingJobs: Job[]
  /** executionId → projectId of runs in progress. */
  runningJobs: Map<string, string | null>
  recovered: boolean
  /** Playwright processes by execution id, so a run can be cancelled. */
  children: Map<string, ChildProcess>
  /** Runs the user cancelled while they were running. */
  cancelled: Set<string>
  /** The run that currently owns the shared run.log (latest started). */
  logOwner: string | null
}
const g = globalThis as unknown as { __hubRunQueue2?: QueueState }
const queue: QueueState = (g.__hubRunQueue2 ||= {
  waitingJobs: [],
  runningJobs: new Map(),
  recovered: false,
  children: new Map(),
  cancelled: new Set(),
  logOwner: null,
})

const MAX_PARALLEL = Math.max(1, Number(process.env.HUB_MAX_PARALLEL_RUNS) || 3)
const PER_PROJECT = Math.max(1, Number(process.env.HUB_MAX_RUNS_PER_PROJECT) || 1)

function busyInProject(projectId: string | null) {
  let n = 0
  for (const p of queue.runningJobs.values()) if (p === projectId) n++
  return n
}

/** Starts as many waiting runs as the limits allow. */
function pump() {
  while (queue.runningJobs.size < MAX_PARALLEL) {
    const i = queue.waitingJobs.findIndex((j) => busyInProject(j.projectId) < PER_PROJECT)
    if (i < 0) return
    const [job] = queue.waitingJobs.splice(i, 1)
    queue.runningJobs.set(job.executionId, job.projectId)
    job
      .run()
      .catch((err) => console.error("[hub-runner] run failed:", err))
      .finally(() => {
        queue.runningJobs.delete(job.executionId)
        pump()
      })
  }
}

/** 0 = running next / now; n = n runs ahead; null = not waiting. */
export function queuePosition(executionId: string): number | null {
  const i = queue.waitingJobs.findIndex((j) => j.executionId === executionId)
  return i < 0 ? null : i
}

/**
 * Cancels a run. A queued run is marked Cancelled and skipped when its turn
 * comes; a running one has its Playwright process stopped. Returns false if
 * the run already finished.
 */
export async function cancelRun(executionId: string, by?: string | null): Promise<boolean> {
  const exec = await prisma.testExecution.findUnique({ where: { id: executionId }, select: { status: true, logOutput: true } })
  if (!exec || !["Queued", "Running"].includes(exec.status)) return false
  const note = `\n[Automation Hub] Cancelled${by ? ` by ${by}` : ""}.\n`
  if (exec.status === "Queued") {
    queue.waitingJobs = queue.waitingJobs.filter((j) => j.executionId !== executionId)
    await prisma.testExecution.update({
      where: { id: executionId },
      data: { status: "Cancelled", logOutput: exec.logOutput + note },
    })
    return true
  }
  queue.cancelled.add(executionId)
  const child = queue.children.get(executionId)
  if (child) {
    child.kill("SIGTERM")
    // Browsers sometimes ignore SIGTERM; make sure the run ends.
    setTimeout(() => child.kill("SIGKILL"), 5000).unref?.()
  } else {
    // Running but no process (e.g. still writing files): finish it as cancelled.
    await prisma.testExecution.update({ where: { id: executionId }, data: { status: "Cancelled", logOutput: exec.logOutput + note } })
  }
  return true
}

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

/** Who/what started a run — stored on the execution. */
export interface RunMeta {
  /** Project the run belongs to (required for shared example scripts). */
  projectId?: string | null
  triggerSource?: "manual" | "rerun" | "schedule" | "ci"
  /** Test Data Manager environment (Dev | Staging | UAT | Production). */
  environment?: string | null
  triggeredById?: string | null
  triggeredByName?: string | null
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
  batchId: string | null = null,
  meta: RunMeta = {}
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
      projectId: meta.projectId ?? script.projectId ?? null,
      triggerSource: meta.triggerSource ?? "manual",
      environment: cleanEnvironment(meta.environment),
      triggeredById: meta.triggeredById ?? null,
      triggeredByName: meta.triggeredByName ?? null,
    },
  })

  queue.waitingJobs.push({
    executionId: execution.id,
    projectId: execution.projectId,
    run: () => executeRun(execution.id, script, { browser, debug, target, accessibility, environment: cleanEnvironment(meta.environment) }),
  })
  pump()
  const ahead = queuePosition(execution.id) ?? 0
  if (queuePosition(execution.id) !== null && ahead >= 0) {
    await prisma.testExecution
      .update({
        where: { id: execution.id },
        data: {
          logOutput: ahead
            ? `[Automation Hub] Queued ${script.name} · ${ahead} run(s) ahead of it\n`
            : `[Automation Hub] Queued ${script.name} · starts when a slot frees up\n`,
        },
      })
      .catch(() => {})
  }
  return execution.id
}

/** Queue several scripts as one batch (Run folder / Run all). */
export async function startBatchRun(
  scripts: (HubScriptLike & { accessibilityEnabled?: boolean })[],
  opts: { browser: string; target?: ExecutionTargetLike; batchId: string; meta?: RunMeta }
): Promise<string[]> {
  const ids: string[] = []
  for (const s of scripts) {
    ids.push(
      await startScriptRun(s, opts.browser, false, opts.target, Boolean(s.accessibilityEnabled), opts.batchId, opts.meta)
    )
  }
  return ids
}

async function executeRun(
  executionId: string,
  script: HubScriptLike,
  opts: { browser: string; debug?: boolean; target?: ExecutionTargetLike; accessibility?: boolean; environment?: string | null }
): Promise<void> {
  // Deleted or cancelled while it waited in the queue.
  const stillThere = await prisma.testExecution.findUnique({ where: { id: executionId }, select: { status: true } })
  if (!stillThere || stillThere.status !== "Queued") return

  const { browser, debug, target, accessibility } = opts
  const remote = target && target.type !== "local"
  // A non-local target may pin its own browser; otherwise honour the toolbar choice.
  const effectiveBrowser = remote && target!.browser ? target!.browser : browser
  const headless = effectiveBrowser.toLowerCase() === "headless" || Boolean(target?.headless)
  const projectName = projectForBrowser(effectiveBrowser)

  // Own folder for this run, so parallel runs never share files.
  const ws = prepareRunWorkspace(executionId, script, {
    headless,
    // grid/browserstack expose a websocket endpoint Playwright can attach to;
    // a docker target is reached the same way.
    remoteUrl: remote ? target!.url : null,
  })
  const specRelPath = ws.specRelPath

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
  // The shared run.log follows the most recently started run only, so
  // parallel runs don't interleave in it. Each run's full log is in the DB.
  queue.logOwner = executionId
  try {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true })
    fs.writeFileSync(RUN_LOG_PATH, header, "utf8")
  } catch {}
  let mask: (text: string) => string = (t) => t
  const append = (raw: string) => {
    const chunk = mask(raw)
    logBuffer += chunk
    if (queue.logOwner === executionId) {
      try {
        fs.appendFileSync(RUN_LOG_PATH, chunk)
      } catch {}
    }
    flushLogs()
  }

  const vars = await loadRunVariables(script.projectId)
  // Test Data Manager values for the chosen environment: no-code tests read
  // them as {variables}, and a "baseUrl" value moves the test to that site.
  const testDataSecrets: string[] = []
  const testData = script.projectId
    ? await loadTestDataVariables({ projectId: script.projectId, environment: opts.environment ?? null, testCaseTestData: null, credential: null, secrets: testDataSecrets }).catch(() => ({}))
    : {}
  vars.secrets.push(...testDataSecrets)
  mask = (text: string) => vars.secrets.reduce((t, sec) => t.split(sec).join("***"), text)
  if (opts.environment) append(`[Automation Hub] Environment: ${opts.environment}${typeof (testData as any).baseUrl === "string" ? ` · ${(testData as any).baseUrl}` : ""}\n`)

  const args = ["playwright", "test", specRelPath, `--project=${projectName}`, "--reporter=list,json"]
  // Never the server's own environment — see cleanRunEnv.
  const env = cleanRunEnv({
    ...vars.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(ws.resultsDir, "report.json"),
    QA_VARS: JSON.stringify(testData),
    ...(typeof (testData as any).baseUrl === "string" && /^https?:\/\//.test((testData as any).baseUrl) ? { QA_BASE_URL: (testData as any).baseUrl } : {}),
    FORCE_COLOR: "0",
    ...(debug ? { DEBUG: "pw:api" } : {}),
  })

  const exitCode: number | null = await new Promise((resolve) => {
    // Run the installed Playwright directly. `npx` from the workspace (on the
    // data volume, outside the app folder) could try to download it instead.
    const cli = playwrightCli()
    const child = cli ? spawn(process.execPath, [cli, ...args.slice(1)], { cwd: ws.dir, env }) : spawn("npx", args, { cwd: ws.dir, env })
    queue.children.set(executionId, child)
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
      queue.children.delete(executionId)
      resolve(code)
    })
  })

  // Keep this run's artifacts: the next run clears test-results/.
  let root = ws.resultsDir
  try {
    root = finishRunWorkspace(executionId, ws.dir)
  } catch (err) {
    console.error("[hub-runner] could not archive run artifacts:", err)
  }

  const results: HubTestResult[] = readRunReport(root, ws.resultsDir)
  const sum = summarize(results)
  // The report is the source of truth when there is one; the exit code covers
  // runs that never got as far as running a test (syntax error, no browser).
  const failed =
    results.length > 0
      ? sum.failed > 0 || exitCode !== 0
      : exitCode !== 0 || /\b\d+ failed\b/.test(logBuffer) || logBuffer.includes("No tests found")

  const firstFailure = results.find((r) => r.error)
  const screenshotPath = firstFailure?.screenshot || results.find((r) => r.screenshot)?.screenshot || findLatestScreenshot(root)

  const wasCancelled = queue.cancelled.delete(executionId)
  logBuffer += wasCancelled ? `\n[Automation Hub] Cancelled while running.\n` : ""
  logBuffer +=
    `\n[Automation Hub] ${wasCancelled ? "CANCELLED" : failed ? "FAILED" : "PASSED"}` +
    (results.length ? ` · ${sum.passed} passed, ${sum.failed} failed${sum.skipped ? `, ${sum.skipped} skipped` : ""}${sum.flaky ? `, ${sum.flaky} flaky` : ""}` : "") +
    ` · ${((Date.now() - started) / 1000).toFixed(1)}s\n`

  try {
    await prisma.testExecution.update({
      where: { id: executionId },
      data: {
        status: wasCancelled ? "Cancelled" : failed ? "Failed" : "Passed",
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

    // Manual test cases this script verifies take its result as their last status.
    if (!wasCancelled) {
      const links = await prisma.hubScriptTestCase.findMany({ where: { scriptId: script.id }, select: { testCaseId: true } })
      if (links.length) await recalcMany(links.map((l) => l.testCaseId))
    }
  } catch (err) {
    console.error("[hub-runner] could not store run results:", err)
  }
  await notifyScheduledRunDone(executionId).catch((e) => console.error("[hub-runner] schedule notification failed:", e))
}

// Batches already announced (the last two runs of a batch can finish together).
const announced: Set<string> = ((globalThis as any).__hubAnnouncedBatches ||= new Set<string>())

/**
 * When the last run of a scheduled batch finishes, tell everyone in the
 * project once: "Nightly regression on Staging: 18 passed, 2 failed".
 */
export async function notifyScheduledRunDone(executionId: string) {
  const exec = await prisma.testExecution.findUnique({
    where: { id: executionId },
    select: { batchId: true, triggerSource: true, projectId: true, environment: true, triggeredByName: true },
  })
  if (!exec || exec.triggerSource !== "schedule" || !exec.projectId) return
  const key = exec.batchId || executionId
  const runs = await prisma.testExecution.findMany({
    where: exec.batchId ? { batchId: exec.batchId } : { id: executionId },
    select: { id: true, status: true, results: true },
  })
  if (runs.some((r) => r.status === "Queued" || r.status === "Running") || announced.has(key)) return
  announced.add(key)

  let passed = 0
  let failed = 0
  for (const r of runs) {
    const results = Array.isArray(r.results) ? (r.results as any[]) : []
    if (results.length) {
      passed += results.filter((t) => t.status === "passed" || t.status === "flaky").length
      failed += results.filter((t) => ["failed", "timedOut", "interrupted"].includes(t.status)).length
    } else if (r.status === "Passed") passed++
    else if (r.status === "Failed") failed++
  }
  const firstFailed = runs.find((r) => r.status === "Failed")
  const project = await prisma.project.findUnique({
    where: { id: exec.projectId },
    select: { userId: true, projectMembers: { select: { userId: true } } },
  })
  if (!project) return
  const recipients = Array.from(new Set([project.userId, ...project.projectMembers.map((m) => m.userId)]))
  const what = `${exec.triggeredByName?.replace(/^Schedule /, "") || "Scheduled run"}${exec.environment ? ` on ${exec.environment}` : ""}`
  await notify(
    recipients.map((userId) => ({
      userId,
      type: "SYSTEM" as const,
      title: failed ? `${failed} test${failed === 1 ? "" : "s"} failed in ${what}` : `All ${passed} tests passed in ${what}`,
      body: `${passed} passed, ${failed} failed`,
      projectId: exec.projectId!,
      actionUrl: `/projects/${exec.projectId}/automation-hub?tab=runs${firstFailed ? `&run=${firstFailed.id}` : ""}`,
    }))
  )
}

/** Where a script's spec lives, for callers that show or open it. */
export function specPathFor(scriptName: string): string {
  return path.join(WORKSPACE_ROOT, "tests", specFileName(scriptName))
}

/** The installed Playwright test CLI, or null to fall back to npx. */
function playwrightCli(): string | null {
  for (const rel of [["@playwright", "test", "cli.js"], ["playwright", "cli.js"]]) {
    const p = path.join(process.cwd(), "node_modules", ...rel)
    if (fs.existsSync(p)) return p
  }
  return null
}

const ENVIRONMENTS = ["Dev", "Staging", "UAT", "Production"]
/** A Test Data Manager environment name, or null. */
export function cleanEnvironment(env: unknown): string | null {
  return typeof env === "string" && ENVIRONMENTS.includes(env) ? env : null
}
