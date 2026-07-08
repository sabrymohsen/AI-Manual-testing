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
import { MAVEN_PROJECT_PATH, EXECUTION_LOG_SENTINEL } from "@/lib/hub-evidence"

export const SHAFT_TRACES_DIR = path.join(MAVEN_PROJECT_PATH, "target/shaft-traces")
export const TRACE_ZIP_NAME = "shaft-trace.zip"

// SHAFT's shaft-trace.json embeds raw newlines inside string values (stack
// traces, code snippets), which strict JSON.parse rejects. Escape control
// characters that occur *inside* strings so the document parses cleanly.
export function sanitizeJsonControlChars(input: string): string {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    const code = input.charCodeAt(i)
    if (escaped) {
      out += ch
      escaped = false
      continue
    }
    if (ch === "\\") {
      out += ch
      escaped = inString
      continue
    }
    if (ch === '"') {
      inString = !inString
      out += ch
      continue
    }
    if (inString && code <= 0x1f) {
      if (ch === "\n") out += "\\n"
      else if (ch === "\r") out += "\\r"
      else if (ch === "\t") out += "\\t"
      else out += "\\u" + code.toString(16).padStart(4, "0")
      continue
    }
    out += ch
  }
  return out
}

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
  const dir = path.resolve(SHAFT_TRACES_DIR, decoded)
  if (dir !== path.join(SHAFT_TRACES_DIR, decoded)) return null
  const zip = path.join(dir, TRACE_ZIP_NAME)
  if (!fs.existsSync(zip)) return null
  return zip
}

// Match a diagnosis / test name (e.g. "LoginFlowTest > testLoginRedirection"
// or "com.ourcompany.tests.LoginFlowTest.testLoginRedirection") to the best
// trace directory by shared name tokens. Returns the trace id (dir name).
export function findTraceForTest(testName: string): string | null {
  if (!fs.existsSync(SHAFT_TRACES_DIR)) return null
  const dirs = fs
    .readdirSync(SHAFT_TRACES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(SHAFT_TRACES_DIR, d.name, TRACE_ZIP_NAME)))
  if (dirs.length === 0) return null

  const tokens = testName
    .split(/[\s.>#:()]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 2)

  let best: string | null = null
  let bestScore = -1
  for (const d of dirs) {
    const name = d.name.toLowerCase()
    let score = 0
    for (const tk of tokens) if (name.includes(tk)) score++
    if (score > bestScore) {
      bestScore = score
      best = d.name
    }
  }
  return bestScore > 0 ? best : null
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
  if (!fs.existsSync(SHAFT_TRACES_DIR)) return []
  const dirs = fs.readdirSync(SHAFT_TRACES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
  const out: (TraceSummary & { mtime: number })[] = []

  for (const d of dirs) {
    const zip = path.join(SHAFT_TRACES_DIR, d.name, TRACE_ZIP_NAME)
    if (!fs.existsSync(zip)) continue
    const mtime = fs.statSync(zip).mtimeMs
    let summary: TraceSummary & { mtime: number } = {
      id: d.name,
      className: d.name,
      methodName: "",
      displayName: d.name,
      status: "unknown",
      generatedAt: null,
      actionCount: 0,
      mtime
    }
    try {
      const t = parseTraceJson(await unzipEntry(zip, "shaft-trace.json"))
      summary = {
        id: d.name,
        className: t.test?.className || d.name,
        methodName: t.test?.methodName || "",
        displayName: t.test?.displayName || t.test?.methodName || d.name,
        status: t.test?.status || "unknown",
        generatedAt: t.generatedAt || null,
        actionCount: Array.isArray(t.actions) ? t.actions.length : 0,
        mtime
      }
    } catch {
      // corrupt / unreadable zip — surface it with the fallback summary
    }
    out.push(summary)
  }

  out.sort((a, b) => b.mtime - a.mtime)
  return out.map(({ mtime, ...rest }) => rest)
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

  const trace = parseTraceJson(await unzipEntry(zip, "shaft-trace.json"))

  // Network: prefer the trace's own array, fall back to the HAR bundle.
  let network: any[] = Array.isArray(trace.network) ? trace.network : []
  if (network.length === 0) {
    try {
      const har = parseTraceJson(await unzipEntry(zip, "shaft-network.har"))
      const entries = har?.log?.entries
      if (Array.isArray(entries)) network = entries.map(normalizeHarEntry)
    } catch {
      // no HAR — leave network empty
    }
  }

  // Evidence sync: link the trace to the most recent matching execution so the
  // UI can show per-action screenshots and deep-link into the Evidence Vault.
  const simpleClass = String(trace.test?.className || "").split(".").pop() || ""
  let executionId: string | null = null
  let evidence: any[] = []
  if (simpleClass) {
    const script = await prisma.testScript.findFirst({ where: { name: simpleClass } })
    if (script) {
      const exec = await prisma.testExecution.findFirst({
        where: { scriptId: script.id },
        orderBy: { createdAt: "desc" }
      })
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
    }
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
