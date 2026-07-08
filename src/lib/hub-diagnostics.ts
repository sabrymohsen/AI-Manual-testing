// Backend for the AI Diagnosis "Diagnostics Bundle" viewer (Section 5).
// SHAFT's per-failure handoff mirrors the shaft-trace.zip bundle
// (shaft-trace.json + shaft-network.har + SHAFT Trace Report.html). We resolve
// the bundle for a diagnosis, read run metadata from Allure's environment.xml,
// and run a real sensitive-data scan over the bundle to report redaction status.

import * as fs from "fs"
import * as path from "path"
import { MAVEN_PROJECT_PATH } from "@/lib/hub-evidence"
import { stripAnsi, LOG4J_PATH } from "@/lib/hub-logs"
import { findTraceForTest, resolveTraceZip, zipEntries, unzipEntry } from "@/lib/hub-traces"

const ENV_XML = path.join(MAVEN_PROJECT_PATH, "allure-results/environment.xml")

// ---------- Run metadata (environment.xml + log4j) ----------

function parseEnvironmentXml(): Record<string, string> {
  if (!fs.existsSync(ENV_XML)) return {}
  const xml = fs.readFileSync(ENV_XML, "utf8")
  const out: Record<string, string> = {}
  const re = /<parameter>\s*<key>([^<]*)<\/key>\s*<value>([^<]*)<\/value>\s*<\/parameter>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out[m[1].trim()] = m[2].trim()
  return out
}

function detectShaftVersion(): string | null {
  if (!fs.existsSync(LOG4J_PATH)) return null
  try {
    const log = stripAnsi(fs.readFileSync(LOG4J_PATH, "utf8"))
    const m = log.match(/SHAFT\s*v\.?\s*([0-9][0-9.]+)/i)
    return m ? m[1] : null
  } catch {
    return null
  }
}

// Curated, human-meaningful subset for the metadata panel + a config snapshot.
const CONFIG_KEYS = [
  "targetBrowserName",
  "headlessExecution",
  "executionAddress",
  "targetOperatingSystem",
  "setParallel",
  "threadCount",
  "retryMaximumNumberOfAttempts",
  "forceCaptureSupportingEvidenceOnRetry",
  "defaultElementIdentificationTimeout",
  "waitForLazyLoadingTimeout",
  "accessibilityTesting",
  "createAnimatedGif"
]

export function readRunMetadata() {
  const env = parseEnvironmentXml()
  const boot = env["sun.boot.library.path"] || ""
  const osHint =
    boot.includes("Contents/Home") || boot.includes("/opt/homebrew")
      ? "macOS"
      : boot.toLowerCase().includes("windows")
      ? "Windows"
      : boot
      ? "Linux"
      : env["targetOperatingSystem"] || "—"

  const system = {
    shaftVersion: detectShaftVersion(),
    javaVersion: env["java.runtime.version"] || env["java.specification.version"] || null,
    javaVendor: env["java.vendor"] || null,
    os: env["os.name"] || osHint,
    osVersion: env["os.version"] || null,
    arch: env["sun.arch.data.model"] ? `${env["sun.arch.data.model"]}-bit` : null,
    browser: env["targetBrowserName"] || null
  }

  const config: { key: string; value: string }[] = CONFIG_KEYS.filter((k) => env[k] !== undefined).map((k) => ({
    key: k,
    value: env[k]
  }))

  return { system, config, envAvailable: Object.keys(env).length > 0 }
}

// ---------- Redaction / sensitive-data scan ----------

// The redaction ruleset SHAFT applies to the sanitized handoff. We additionally
// scan the actual bundle text so the report reflects this specific bundle
// rather than a generic claim.
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
