// Backend for Browser Matrix Section 8: BrowserStack cloud config +
// cross-browser parallel / Docker execution. Configuration is persisted to real
// files (browserstack.yml, custom.properties); analytics are derived from real
// CrossBrowserResult / TestExecution rows. Nothing about a live BrowserStack
// session is fabricated — sessions only appear once a cloud run produces them.

import { prisma } from "@/lib/db"
import { execFile } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { ARTIFACT_ROOT } from "@/lib/hub-evidence"

export const BROWSERSTACK_YML = path.join(ARTIFACT_ROOT, "browserstack.yml")
const CUSTOM_PROPS = path.join(ARTIFACT_ROOT, "src/main/resources/properties/custom.properties")

// Per parallel-session minute; overridable via env for accuracy against a plan.
const BS_RATE_PER_MINUTE = Number(process.env.BROWSERSTACK_RATE_PER_MINUTE) || 0.15

export const DEFAULT_BROWSERSTACK_YML = `# SHAFT shaft-browserstack SDK configuration
# Credentials are read from BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY
userName: \${BROWSERSTACK_USERNAME}
accessKey: \${BROWSERSTACK_ACCESS_KEY}
framework: testng

platforms:
  - os: Windows
    osVersion: "11"
    browserName: chrome
    browserVersion: latest
  - os: OS X
    osVersion: Sonoma
    browserName: safari
    browserVersion: latest

parallelsPerPlatform: 1
browserstackLocal: false
buildName: SHAFT Automation Hub
projectName: AI Manual Testing
debug: true
networkLogs: true
consoleLogs: info
`

// ---------- custom.properties helpers ----------

function readProps(): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fs.existsSync(CUSTOM_PROPS)) return out
  for (const line of fs.readFileSync(CUSTOM_PROPS, "utf8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

function upsertProps(pairs: Record<string, string>) {
  let body = fs.existsSync(CUSTOM_PROPS) ? fs.readFileSync(CUSTOM_PROPS, "utf8") : ""
  for (const [key, value] of Object.entries(pairs)) {
    const lines = body.split("\n")
    let found = false
    const next = lines.map((line) => {
      if (line.trim().startsWith(`${key}=`) || line.trim() === key) {
        found = true
        return `${key}=${value}`
      }
      return line
    })
    if (!found) next.push(`${key}=${value}`)
    body = next.join("\n")
  }
  fs.mkdirSync(path.dirname(CUSTOM_PROPS), { recursive: true })
  fs.writeFileSync(CUSTOM_PROPS, body, "utf8")
}

// ---------- Parallel / Docker configuration ----------

export function readParallelConfig() {
  const p = readProps()
  const address = p["executionAddress"] || "local"
  return {
    crossBrowserMode: p["crossBrowserMode"] || "off", // "off" | "parallelized"
    parallel: p["setParallel"] || "METHODS",
    threadCount: Number(p["threadCount"]) || 1,
    onDocker: address === "dockerized",
    executionAddress: address
  }
}

export function writeParallelConfig(opts: { crossBrowserMode?: string; threadCount?: number; onDocker?: boolean }) {
  const pairs: Record<string, string> = {}
  if (opts.crossBrowserMode !== undefined) {
    pairs["crossBrowserMode"] = opts.crossBrowserMode
    // Parallelized cross-browser implies TestNG parallel methods.
    pairs["setParallel"] = opts.crossBrowserMode === "parallelized" ? "METHODS" : "NONE"
  }
  if (opts.threadCount !== undefined) pairs["threadCount"] = String(Math.max(1, Math.min(16, opts.threadCount)))
  if (opts.onDocker !== undefined) pairs["executionAddress"] = opts.onDocker ? "dockerized" : "local"
  upsertProps(pairs)
  return readParallelConfig()
}

// Real docker daemon probe (installed? daemon running? SHAFT-related containers).
export function checkDocker(): Promise<{ installed: boolean; running: boolean; containers: { name: string; image: string; status: string }[] }> {
  return new Promise((resolve) => {
    execFile("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 4000 }, (err, stdout) => {
      const installed = !(err && (err as any).code === "ENOENT")
      const running = !err && Boolean(stdout.trim())
      if (!running) return resolve({ installed, running: false, containers: [] })
      // List Selenium / Playwright / SHAFT containers if the daemon is up.
      execFile(
        "docker",
        ["ps", "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}"],
        { timeout: 4000 },
        (e2, out2) => {
          const containers = (out2 || "")
            .split("\n")
            .filter((l) => /selenium|seleniarm|playwright|shaft|chrome|firefox|edge/i.test(l))
            .map((l) => {
              const [name, image, status] = l.split("\t")
              return { name: name || "", image: image || "", status: status || "" }
            })
          resolve({ installed: true, running: true, containers })
        }
      )
    })
  })
}

// Sequential vs. parallel time-saving derived from real per-browser durations.
export async function computeParallelSavings() {
  const results = await prisma.crossBrowserResult.findMany()
  const byTest = new Map<string, number[]>()
  for (const r of results) {
    if (r.status === "not_run" || !r.duration) continue
    const arr = byTest.get(r.testId) || []
    arr.push(r.duration)
    byTest.set(r.testId, arr)
  }
  let sequentialMs = 0
  let parallelMs = 0
  const browsers = new Set(results.filter((r) => r.status !== "not_run").map((r) => r.browserName))
  for (const durations of byTest.values()) {
    sequentialMs += durations.reduce((s, d) => s + d, 0)
    parallelMs += Math.max(...durations) // browsers for a test run simultaneously
  }
  const savedMs = Math.max(0, sequentialMs - parallelMs)
  return {
    testCount: byTest.size,
    browserCount: browsers.size,
    sequentialMs,
    parallelMs,
    savedMs,
    savedPct: sequentialMs ? Math.round((savedMs / sequentialMs) * 100) : 0,
    // Rough container/memory footprint estimate (~800 MB per browser container).
    estimatedContainers: browsers.size,
    estimatedMemoryMb: browsers.size * 800
  }
}

// ---------- BrowserStack configuration + status ----------

function parsePlatformCount(yml: string): number {
  const m = yml.match(/^\s*-\s+os:/gim)
  return m ? m.length : 0
}

function parseParallelsPerPlatform(yml: string): number {
  const m = yml.match(/parallelsPerPlatform:\s*(\d+)/i)
  return m ? Number(m[1]) : 1
}

export function readBrowserstackConfig() {
  const exists = fs.existsSync(BROWSERSTACK_YML)
  const yml = exists ? fs.readFileSync(BROWSERSTACK_YML, "utf8") : DEFAULT_BROWSERSTACK_YML
  return {
    yml,
    exists,
    platformCount: parsePlatformCount(yml),
    parallelsPerPlatform: parseParallelsPerPlatform(yml)
  }
}

export function writeBrowserstackConfig(yml: string) {
  fs.writeFileSync(BROWSERSTACK_YML, yml, "utf8")
  return readBrowserstackConfig()
}

function maskUser(u: string): string {
  if (!u || u.length <= 3) return "•••"
  return u.slice(0, 3) + "•".repeat(Math.max(3, u.length - 3))
}

// Credential status + tracked usage + cost estimate — all from real sources.
export async function readBrowserstackStatus() {
  // Credentials: a saved BrowserStack ExecutionTarget, or environment variables.
  const target = await prisma.executionTarget.findFirst({ where: { type: "browserstack" } })
  const creds = (target?.credentials as any) || null
  const envUser = process.env.BROWSERSTACK_USERNAME
  const configured = Boolean(creds?.username || creds?.accessKey || envUser)
  const username = creds?.username || envUser || null

  // Tracked usage this month = minutes spent on BrowserStack-targeted executions.
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  let usageMinutesThisMonth = 0
  let cloudRuns = 0
  const sessions: { id: string; testName: string; status: string; durationMs: number | null; createdAt: Date }[] = []
  if (target) {
    const execs = await prisma.testExecution.findMany({
      where: { executionTarget: target.name },
      orderBy: { createdAt: "desc" },
      include: { script: { select: { name: true } } },
      take: 20
    })
    cloudRuns = execs.length
    for (const e of execs) {
      if (e.createdAt >= startOfMonth) usageMinutesThisMonth += (e.duration || 0) / 60000
      sessions.push({
        id: e.id,
        testName: e.script?.name || "test",
        status: e.status,
        durationMs: e.duration,
        createdAt: e.createdAt
      })
    }
  }

  const bs = readBrowserstackConfig()
  // Cost estimate per matrix run: platforms × parallels × avg minutes × rate.
  const avgRunMinutes = await estimateAvgRunMinutes()
  const sessionsPerRun = Math.max(1, bs.platformCount) * Math.max(1, bs.parallelsPerPlatform)
  const estMinutesPerRun = sessionsPerRun * avgRunMinutes
  const estCostPerRun = estMinutesPerRun * BS_RATE_PER_MINUTE

  return {
    configured,
    username: username ? maskUser(username) : null,
    targetName: target?.name || null,
    dashboardUrl: "https://automate.browserstack.com/dashboard/v2",
    cloudRuns,
    sessions,
    usage: {
      minutesThisMonth: Math.round(usageMinutesThisMonth * 10) / 10,
      ratePerMinute: BS_RATE_PER_MINUTE
    },
    costEstimate: {
      sessionsPerRun,
      avgRunMinutes: Math.round(avgRunMinutes * 100) / 100,
      estMinutesPerRun: Math.round(estMinutesPerRun * 10) / 10,
      estCostPerRun: Math.round(estCostPerRun * 100) / 100
    }
  }
}

async function estimateAvgRunMinutes(): Promise<number> {
  const results = await prisma.crossBrowserResult.findMany({ where: { status: { not: "not_run" } }, select: { duration: true } })
  if (results.length === 0) return 1.5 // sensible default when no history
  const avgMs = results.reduce((s, r) => s + (r.duration || 0), 0) / results.length
  return Math.max(0.25, avgMs / 60000)
}
