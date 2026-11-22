// Parsing for the Automation Hub "Trace Viewer" section.
// SHAFT emits a per-test trace bundle at
//   target/shaft-traces/<class.method>/shaft-trace.zip
// containing shaft-trace.json (actions/console/network/observability),
// shaft-network.har and a standalone "SHAFT Trace Report.html".
// We read the zip on demand (via /usr/bin/unzip) and normalise it for the UI.

import { prisma } from "@/lib/db"
import { execFile } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { ARTIFACT_ROOT, EXECUTION_LOG_SENTINEL } from "@/lib/hub-evidence"
import { RESULTS_DIR, RUNS_DIR } from "@/lib/hub-workspace"
import { parsePlaywrightTrace } from "@/lib/hub-playwright-trace"

// Playwright writes one directory per test under test-results/, each holding a
// trace.zip — the same shape the old SHAFT layout had, so discovery below is
// unchanged apart from the names.
export const TRACES_DIR = RESULTS_DIR
export const TRACE_ZIP_NAME = "trace.zip"

/**
 * Every trace on disk: the run in progress (test-results/<test>/) and each
 * finished run (runs/<executionId>/<test>/). A finished run's trace id is
 * "<executionId>~<test dir>" — no slash, so ids stay safe in URLs and the
 * resolver below can still refuse anything that walks out of the workspace.
 */
export interface TraceLocation {
  id: string
  /** Playwright's test directory name, <spec>-<title>-<project>. */
  dirName: string
  zip: string
  mtime: number
}

const SAFE_SEGMENT = /^[A-Za-z0-9._ ()-]+$/

export function listTraceLocations(): TraceLocation[] {
  const out: TraceLocation[] = []
  const add = (dir: string, dirName: string, id: string) => {
    const zip = path.join(dir, TRACE_ZIP_NAME)
    if (fs.existsSync(zip)) out.push({ id, dirName, zip, mtime: fs.statSync(zip).mtimeMs })
  }
  if (fs.existsSync(TRACES_DIR)) {
    for (const d of fs.readdirSync(TRACES_DIR, { withFileTypes: true })) {
      if (d.isDirectory()) add(path.join(TRACES_DIR, d.name), d.name, d.name)
    }
  }
  if (fs.existsSync(RUNS_DIR)) {
    for (const run of fs.readdirSync(RUNS_DIR, { withFileTypes: true })) {
      if (!run.isDirectory()) continue
      const runPath = path.join(RUNS_DIR, run.name)
      for (const d of fs.readdirSync(runPath, { withFileTypes: true })) {
        if (d.isDirectory()) add(path.join(runPath, d.name), d.name, `${run.name}~${d.name}`)
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

/** The Playwright test directory name behind a trace id. */
export function traceDirName(traceId: string): string {
  const decoded = decodeURIComponent(traceId)
  return decoded.includes("~") ? decoded.slice(decoded.indexOf("~") + 1) : decoded
}


// SHAFT's shaft-trace.json embeds raw newlines inside string values; see json-sanitize.
export { sanitizeJsonControlChars } from "@/lib/json-sanitize"
import { sanitizeJsonControlChars } from "@/lib/json-sanitize"

export function unzipEntry(zipPath: string, entry: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "unzip",
      ["-p", zipPath, entry],
      { maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout)
      }
    )
  })
}

function parseTraceJson(raw: string): any {
  return JSON.parse(sanitizeJsonControlChars(raw))
}

// Resolve + validate a trace id (directory name) to its zip path, refusing
// any path that escapes the shaft-traces directory.
export function resolveTraceZip(traceId: string): string | null {
  const decoded = decodeURIComponent(traceId)
  if (decoded.includes("/") || decoded.includes("\\") || decoded.includes("..")) return null
  const [base, rel] = decoded.includes("~")
    ? [path.join(RUNS_DIR, decoded.slice(0, decoded.indexOf("~"))), decoded.slice(decoded.indexOf("~") + 1)]
    : [TRACES_DIR, decoded]
  if (!SAFE_SEGMENT.test(path.basename(base)) || !SAFE_SEGMENT.test(rel)) return null
  const dir = path.resolve(base, rel)
  if (dir !== path.join(base, rel)) return null
  const zip = path.join(dir, TRACE_ZIP_NAME)
  if (!fs.existsSync(zip)) return null
  return zip
}

// Match a diagnosis / test name (e.g. "LoginFlowTest > testLoginRedirection"
// or "com.ourcompany.tests.LoginFlowTest.testLoginRedirection") to the best
// trace directory by shared name tokens. Returns the trace id (dir name).
export function findTraceForTest(testName: string): string | null {
  // Newest first, so a tie goes to the most recent run of that test.
  const traces = listTraceLocations()
  if (traces.length === 0) return null

  const tokens = testName
    .split(/[\s.>#:()]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 2)

  let best: string | null = null
  let bestScore = 0
  for (const t of traces) {
    const name = t.dirName.toLowerCase()
    let score = 0
    for (const tk of tokens) if (name.includes(tk)) score++
    if (score > bestScore) {
      bestScore = score
      best = t.id
    }
  }
  return best
}

// List the entries (name + uncompressed size) inside a zip via `unzip -l`.
export function zipEntries(zipPath: string): Promise<{ name: string; size: number }[]> {
  return new Promise((resolve) => {
    execFile("unzip", ["-l", zipPath], { maxBuffer: 4 * 1024 * 1024, encoding: "utf8" }, (err, stdout) => {
      if (err) return resolve([])
      const out: { name: string; size: number }[] = []
      for (const line of stdout.split("\n")) {
        // "   8798  07-07-2026 21:08   shaft-trace.json"
        const m = line.match(/^\s*(\d+)\s+[\d-]+\s+[\d:]+\s+(.+?)\s*$/)
        if (m && !/^-+$/.test(m[2])) out.push({ name: m[2], size: Number(m[1]) })
      }
      resolve(out)
    })
  })
}

export interface TraceSummary {
  id: string
  className: string
  methodName: string
  displayName: string
  status: string
  generatedAt: string | null
  actionCount: number
}

export async function listTraces(): Promise<TraceSummary[]> {
  const out: TraceSummary[] = []
  // Parsing a trace unzips it; cap the list so a long history stays fast.
  for (const loc of listTraceLocations().slice(0, 100)) {
    const { id, dirName: name, zip, mtime } = loc
    let summary: TraceSummary = {
      id,
      className: name,
      methodName: "",
      displayName: name,
      status: "unknown",
      generatedAt: null,
      actionCount: 0,
    }
    try {
      const t = await parsePlaywrightTrace(zip)
      // Playwright names the directory <Spec>-<test title>-<project>; the
      // leading segment is the spec, which is what the hub calls the class.
      const parts = name.split("-")
      const failed = t.actions.some((a) => a.status === "failed")
      summary = {
        id,
        className: parts[0] || name,
        methodName: parts.slice(1, -1).join("-") || "",
        displayName: name.replace(/-/g, " "),
        status: failed ? "failed" : "passed",
        generatedAt: t.startedAtMs ? new Date(t.startedAtMs).toISOString() : new Date(mtime).toISOString(),
        actionCount: t.actions.length,
      }
    } catch {
      // corrupt / unreadable zip — surface it with the fallback summary
    }
    out.push(summary)
  }
  return out
}

// Normalise a HAR entry to the flat shape the Network table renders.
function normalizeHarEntry(e: any, i: number) {
  return {
    id: `net-${i}`,
    startedDateTime: e.startedDateTime || null,
    method: e.request?.method || "",
    url: e.request?.url || "",
    status: e.response?.status ?? null,
    statusText: e.response?.statusText || "",
    durationMs: typeof e.time === "number" ? Math.round(e.time) : null,
    size: e.response?.content?.size ?? e.response?.bodySize ?? null,
    mimeType: e.response?.content?.mimeType || "",
    request: e.request || null,
    response: e.response || null
  }
}

export async function readTrace(traceId: string) {
  const zip = resolveTraceZip(traceId)
  if (!zip) return null

  const parsed = await parsePlaywrightTrace(zip)
  const failed = parsed.actions.some((a) => a.status === "failed")
  const firstFailure = parsed.actions.find((a) => a.status === "failed")
  const dirName = traceDirName(traceId)
  const parts = dirName.split("-")

  // Assembled from the Playwright events rather than read from a pre-shaped
  // document; the viewer's contract is unchanged.
  const trace: any = {
    schemaVersion: null,
    generatedAt: parsed.startedAtMs ? new Date(parsed.startedAtMs).toISOString() : null,
    test: {
      className: parts[0] || dirName,
      methodName: parts.slice(1, -1).join("-") || "",
      displayName: dirName.replace(/-/g, " "),
      description: parsed.browserName ? `Ran on ${parsed.browserName}` : "",
      status: failed ? "failed" : "passed",
    },
    exception: firstFailure
      ? {
          type: firstFailure.exception.type,
          message: firstFailure.exception.message,
          stacktrace: "",
        }
      : null,
    source: null,
    snapshot: null,
    // Playwright has no locator-healing concept; the panel reports it as off
    // rather than implying a capability that is not there.
    locatorHealth: { enabled: false },
    browserObservability: { warnings: [] },
    actions: parsed.actions,
    console: parsed.console,
    attachments: [],
  }
  const network = parsed.network

  // Evidence sync: link the trace to its execution so the UI can show
  // per-action screenshots and deep-link into the Evidence Vault. A finished
  // run's trace id names its execution; an older one is matched by spec name.
  const decodedId = decodeURIComponent(traceId)
  let exec: { id: string } | null = null
  if (decodedId.includes("~")) {
    exec = await prisma.testExecution.findUnique({ where: { id: decodedId.slice(0, decodedId.indexOf("~")) }, select: { id: true } })
  } else {
    const simpleClass = String(trace.test?.className || "").split(".").pop() || ""
    const script = simpleClass ? await prisma.testScript.findFirst({ where: { name: simpleClass } }) : null
    if (script) {
      exec = await prisma.testExecution.findFirst({ where: { scriptId: script.id }, orderBy: { createdAt: "desc" }, select: { id: true } })
    }
  }
  let executionId: string | null = null
  let evidence: any[] = []
  if (exec) {
    executionId = exec.id
    const files = await prisma.evidenceFile.findMany({
      where: { testExecutionId: exec.id, fileType: { in: ["screenshot", "gif"] } },
      orderBy: { stepNumber: "asc" }
    })
    evidence = files.map((f) => ({
      id: f.id,
      stepNumber: f.stepNumber,
      fileType: f.fileType,
      createdAt: f.createdAt,
      fileExists: f.filePath === EXECUTION_LOG_SENTINEL || fs.existsSync(f.filePath)
    }))
  }

  return {
    id: traceId,
    schemaVersion: trace.schemaVersion || null,
    generatedAt: trace.generatedAt || null,
    test: trace.test || null,
    exception: trace.exception || null,
    source: trace.source || null,
    snapshot: trace.snapshot || null,
    locatorHealth: trace.locatorHealth || null,
    browserObservability: trace.browserObservability || { warnings: [] },
    actions: Array.isArray(trace.actions) ? trace.actions : [],
    console: Array.isArray(trace.console) ? trace.console : [],
    network,
    attachments: Array.isArray(trace.attachments) ? trace.attachments : [],
    executionId,
    evidence
  }
}
