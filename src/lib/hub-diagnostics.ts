// Backend for the AI Diagnosis "Diagnostics Bundle" viewer (Section 5).
// SHAFT's per-failure handoff mirrors the shaft-trace.zip bundle
// (shaft-trace.json + shaft-network.har + SHAFT Trace Report.html). We resolve
// the bundle for a diagnosis, read run metadata from Allure's environment.xml,
// and run a real sensitive-data scan over the bundle to report redaction status.

import * as fs from "fs"
import * as path from "path"
import { ARTIFACT_ROOT } from "@/lib/hub-evidence"
import * as os from "os"
import { stripAnsi, RUN_LOG_PATH } from "@/lib/hub-logs"
import { readProps } from "@/lib/hub-properties"
import { findTraceForTest, resolveTraceZip, zipEntries, unzipEntry } from "@/lib/hub-traces"

// ---------- Run metadata ----------
//
// This read Allure's environment.xml — a Java-run artifact describing the JVM
// (java.runtime.version, sun.boot.library.path) — and grepped the log for a
// SHAFT version banner. None of that exists now. The panel reports the runtime
// that actually executed the test instead: Playwright, the browser project,
// the Node/OS it ran on, and the settings the run was given.

function detectPlaywrightVersion(): string | null {
  try {
    return require("@playwright/test/package.json").version || null
  } catch {
    return null
  }
}

/** Browser project of the most recent run, read from its log header. */
function detectBrowserFromLog(): string | null {
  if (!fs.existsSync(RUN_LOG_PATH)) return null
  try {
    const log = stripAnsi(fs.readFileSync(RUN_LOG_PATH, "utf8"))
    const m = log.match(/\[(chromium|firefox|webkit)\]/i) || log.match(/on (chromium|firefox|webkit)\b/i)
    return m ? m[1].toLowerCase() : null
  } catch {
    return null
  }
}

// The settings worth showing beside a failure: the ones that change whether a
// test passes, rather than the whole catalog.
const CONFIG_KEYS = [
  "browser",
  "headless",
  "workers",
  "retries",
  "timeout",
  "expectTimeout",
  "navigationTimeout",
  "actionTimeout",
  "viewportWidth",
  "viewportHeight",
  "baseURL",
  "trace",
  "video",
  "screenshot",
]

export function readRunMetadata() {
  const saved = readProps()

  const system = {
    // Field name kept so the existing panel keeps rendering; it now carries
    // the engine that actually ran the test.
    shaftVersion: detectPlaywrightVersion(),
    javaVersion: process.version,
    javaVendor: "Node.js",
    os: process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux",
    osVersion: os.release(),
    arch: process.arch,
    browser: detectBrowserFromLog() || saved["browser"] || null,
  }

  const config: { key: string; value: string }[] = CONFIG_KEYS.filter(
    (k) => saved[k] !== undefined && saved[k] !== ""
  ).map((k) => ({ key: k, value: saved[k] }))

  return { system, config, envAvailable: config.length > 0 }
}

// ---------- Redaction / sensitive-data scan ----------

// The redaction ruleset applied to a sanitized handoff. The actual bundle text
// is scanned as well, so the report reflects this specific bundle rather than a
// generic claim about what should have been stripped.
const REDACTION_RULES: { id: string; label: string; category: string; pattern: RegExp }[] = [
  { id: "password", label: "Passwords / credentials", category: "credential", pattern: /(password|passwd|pwd)\s*["']?\s*[=:]\s*["']?\S+/gi },
  { id: "jwt", label: "JWT / bearer tokens", category: "token", pattern: /\b(?:bearer\s+)?eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g },
  { id: "apikey", label: "API keys / secrets", category: "token", pattern: /\b(api[_-]?key|secret|access[_-]?key|client[_-]?secret)\s*["']?\s*[=:]\s*["']?[A-Za-z0-9\-_]{12,}/gi },
  { id: "authheader", label: "Authorization headers", category: "token", pattern: /authorization\s*["']?\s*[:=]\s*["']?\S+/gi },
  { id: "email", label: "Email addresses (PII)", category: "pii", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g }
]

function mask(s: string): string {
  const t = s.trim()
  if (t.length <= 4) return "••••"
  return t.slice(0, 2) + "•".repeat(Math.max(3, Math.min(12, t.length - 4))) + t.slice(-2)
}

export function scanRedaction(text: string) {
  const findings = REDACTION_RULES.map((r) => {
    const matches = text.match(r.pattern) || []
    return {
      id: r.id,
      label: r.label,
      category: r.category,
      count: matches.length,
      samples: Array.from(new Set(matches)).slice(0, 3).map(mask)
    }
  })
  const totalHits = findings.reduce((s, f) => s + f.count, 0)
  // The handoff is already sanitized, so a clean bundle scores high; each
  // residual sensitive pattern lowers the score.
  const privacyScore = Math.max(0, 100 - Math.min(100, totalHits * 10))
  return {
    rules: REDACTION_RULES.map((r) => ({ id: r.id, label: r.label, category: r.category })),
    findings,
    totalHits,
    privacyScore
  }
}

// ---------- Bundle assembly ----------

export interface BundleInfo {
  available: boolean
  traceId: string | null
  entries: { name: string; size: number }[]
  metadata: ReturnType<typeof readRunMetadata>
  redaction: ReturnType<typeof scanRedaction> | null
}

export async function buildBundleInfo(testName: string): Promise<BundleInfo> {
  const traceId = findTraceForTest(testName)
  const metadata = readRunMetadata()

  if (!traceId) {
    return { available: false, traceId: null, entries: [], metadata, redaction: null }
  }

  const zip = resolveTraceZip(traceId)
  if (!zip) {
    return { available: false, traceId: null, entries: [], metadata, redaction: null }
  }

  const entries = await zipEntries(zip)

  // Scan the machine-readable parts of the bundle for residual secrets.
  let scanText = ""
  for (const entry of ["shaft-trace.json", "shaft-network.har"]) {
    if (entries.some((e) => e.name === entry)) {
      try {
        scanText += "\n" + (await unzipEntry(zip, entry))
      } catch {
        // unreadable entry — skip
      }
    }
  }
  const redaction = scanRedaction(scanText)

  return { available: true, traceId, entries, metadata, redaction }
}

// Map a bundle entry to how the viewer should preview it.
export function previewKindFor(name: string): "json" | "har" | "html" | "text" | "binary" {
  const lower = name.toLowerCase()
  if (lower.endsWith(".har")) return "har"
  if (lower.endsWith(".json")) return "json"
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html"
  if (/\.(txt|log|xml|csv|md)$/.test(lower)) return "text"
  return "binary"
}
