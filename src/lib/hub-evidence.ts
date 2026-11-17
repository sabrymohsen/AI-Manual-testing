// Evidence harvesting for the Automation Hub Evidence Vault.
// After a Test Studio run completes, scans the Playwright workspace for
// artifacts created during the run (screenshots, video, traces, logs) and
// registers them as EvidenceFile rows tied to the TestExecution.
//
// Playwright writes all of these itself under test-results/ when trace, video
// and screenshot are enabled — which the generated config always does. The
// previous version scanned a Maven target/ directory that no run ever produced.

import { prisma } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"
import { RESULTS_DIR, WORKSPACE_ROOT } from "@/lib/hub-workspace"

/**
 * Every artifact must resolve inside this directory.
 *
 * Used by the evidence file/download routes as a path-traversal guard: an
 * EvidenceFile row stores a path, and a stored path must never be able to walk
 * out of the workspace and serve, say, /etc/passwd. Named for what it is now
 * that the Maven workspace is gone.
 */
export const ARTIFACT_ROOT = WORKSPACE_ROOT

// Sentinel filePath for the Maven console log, which lives in the DB
// (TestExecution.logOutput), not on disk.
export const EXECUTION_LOG_SENTINEL = "execution:log"

const TYPE_BY_EXT: Record<string, string> = {
  ".png": "screenshot",
  ".jpg": "screenshot",
  ".jpeg": "screenshot",
  ".gif": "gif",
  ".webm": "video",
  ".mp4": "video",
  ".mov": "video",
  ".har": "har",
  ".log": "log",
  ".txt": "log",
  // Playwright's trace bundle — what the Trace Viewer tab reads.
  ".zip": "trace"
}

interface FoundArtifact {
  file: string
  type: string
  mtime: number
}

function scanArtifacts(since: number, root: string = RESULTS_DIR): FoundArtifact[] {
  const roots = [root]
  const found: FoundArtifact[] = []

  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      const type = TYPE_BY_EXT[ext]
      if (!type) continue
      const stat = fs.statSync(full)
      if (stat.mtimeMs < since) continue
      // skip icon-sized images; real page screenshots are far larger
      if (type === "screenshot" && stat.size < 5 * 1024) continue
      if (stat.size === 0) continue
      found.push({ file: full, type, mtime: stat.mtimeMs })
    }
  }

  roots.forEach((r) => walk(r, 0))
  return found.sort((a, b) => a.mtime - b.mtime)
}

export async function harvestEvidence(opts: {
  executionId: string
  since: number
  status: "pass" | "fail"
  scriptName: string
  scriptType: string
  browser: string
  targetUrl?: string
  /** The run's own folder (runs/<executionId>); defaults to test-results. */
  root?: string
}): Promise<number> {
  const artifacts = scanArtifacts(opts.since, opts.root)

  const rows = artifacts.map((a, i) => ({
    testExecutionId: opts.executionId,
    fileType: a.type,
    filePath: a.file,
    stepNumber: i + 1,
    pageUrl: opts.targetUrl || "",
    elementLocator: "",
    status: opts.status,
    tags: [opts.scriptType, opts.scriptName, opts.browser]
  }))

  // The Maven console output is always available as a log evidence entry
  rows.push({
    testExecutionId: opts.executionId,
    fileType: "log",
    filePath: EXECUTION_LOG_SENTINEL,
    stepNumber: rows.length + 1,
    pageUrl: "",
    elementLocator: `npx playwright test ${opts.scriptName}`,
    status: opts.status,
    tags: [opts.scriptType, opts.scriptName, opts.browser, "Playwright"]
  })

  try {
    await prisma.evidenceFile.createMany({ data: rows })
    return rows.length
  } catch (err) {
    console.error("harvestEvidence error:", err)
    return 0
  }
}

// First URL literal in the script code, used as the evidence pageUrl hint
export function extractTargetUrl(code: string): string | undefined {
  return code.match(/https?:\/\/[^"'\s)]+/)?.[0]
}
