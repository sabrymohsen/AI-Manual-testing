/**
 * Runs playwright-cli on the server for the Browser Agent ("Runs on: server").
 *
 * Each agent session is one named playwright-cli browser session with its own
 * folder (snapshots and screenshots land there). Sessions belong to the user
 * who opened them, close after 15 idle minutes, and at most MAX_SESSIONS run
 * at once. Commands are checked against the allowed list (commands.ts).
 */
import { spawn } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { randomUUID } from "crypto"
import { STORAGE_ROOT } from "@/lib/storage-health"
import { type BaCommand, cliArgs, commandError } from "./commands"

export const BA_ROOT = path.resolve(STORAGE_ROOT, "browser-agent")
const CLI = path.join(process.cwd(), "node_modules", "@playwright", "cli", "playwright-cli.js")
const MAX_SESSIONS = Number(process.env.BROWSER_AGENT_MAX_SESSIONS || 8)
const IDLE_MS = 15 * 60 * 1000
const CMD_TIMEOUT_MS = 90_000

interface Session {
  id: string
  cliName: string
  userId: string
  projectId: string
  dir: string
  lastUsed: number
  busy: boolean
}

// One registry per server process (survives hot reloads in dev).
const g = globalThis as unknown as { __baSessions?: Map<string, Session>; __baSweep?: NodeJS.Timeout }
const sessions = (g.__baSessions ??= new Map())

/** On Linux servers, the Chromium the image already ships (Playwright's /ms-playwright). */
function imageChromium(): string | null {
  if (process.platform !== "linux") return null
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/ms-playwright"
  try {
    const dirs = fs
      .readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    for (const d of dirs) {
      for (const sub of ["chrome-linux/chrome", "chrome-linux64/chrome"]) {
        const exe = path.join(root, d, sub)
        if (fs.existsSync(exe)) return exe
      }
    }
  } catch {}
  return null
}

function cliEnv(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYWRIGHT_MCP_OUTPUT_DIR: path.join(dir, "out"),
    // Session bookkeeping in our own (writable) folder, not the server user's home.
    PLAYWRIGHT_DAEMON_SESSION_DIR: path.join(BA_ROOT, "daemon"),
    // The app may run as a user whose home isn't writable (Docker: nextjs, HOME=/app);
    // Chromium's crash handler then kills the browser at launch. Sockets go in TMPDIR.
    HOME: path.join(BA_ROOT, "home"),
    XDG_CONFIG_HOME: path.join(BA_ROOT, "home", ".config"),
    XDG_CACHE_HOME: path.join(BA_ROOT, "home", ".cache"),
    // Linux only: macOS caps socket paths at 104 characters.
    ...(process.platform === "linux" ? { TMPDIR: path.join(BA_ROOT, "tmp") } : {}),
    FORCE_COLOR: "0",
  }
  const exe = process.env.BROWSER_AGENT_CHROMIUM || imageChromium()
  if (exe) {
    env.PLAYWRIGHT_MCP_EXECUTABLE_PATH = exe
    env.PLAYWRIGHT_MCP_SANDBOX = "false"
  }
  return env
}

function run(dir: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  for (const d of ["home", "tmp"]) fs.mkdirSync(path.join(BA_ROOT, d), { recursive: true })
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: dir, env: cliEnv(dir) })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d) => (stdout = (stdout + d).slice(-4_000_000)))
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-100_000)))
    const timer = setTimeout(() => child.kill("SIGKILL"), CMD_TIMEOUT_MS)
    child.on("error", (e) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: String(e.message) })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

async function closeSession(s: Session) {
  sessions.delete(s.id)
  await run(s.dir, [`-s=${s.cliName}`, "close"]).catch(() => {})
  fs.rmSync(s.dir, { recursive: true, force: true })
}

function sweep() {
  const now = Date.now()
  for (const s of Array.from(sessions.values())) if (!s.busy && now - s.lastUsed > IDLE_MS) void closeSession(s)
}
if (!g.__baSweep) {
  g.__baSweep = setInterval(sweep, 60_000)
  g.__baSweep.unref?.()
}

export class BrowserAgentError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
  }
}

export interface ExecResult {
  session: string
  ok: boolean
  error?: string
  /** Parsed JSON output of the command. */
  result?: any
  /** snapshot: the page's accessibility tree. */
  snapshot?: string
  /** screenshot: a PNG data URL. */
  screenshot?: string
  /** After every page action: where the browser is now. */
  page?: { title: string; url: string } | null
}

const clean = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "").replace(/^Error: (Error: )?/, "").trim()

function parseOut(stdout: string): any {
  const t = stdout.trim()
  try {
    return JSON.parse(t)
  } catch {
    const i = t.indexOf("{")
    if (i !== -1) {
      try {
        return JSON.parse(t.slice(i))
      } catch {}
    }
    return { result: t }
  }
}

const PAGE_CHANGING = new Set<BaCommand>(["open", "goto", "click", "dblclick", "fill", "type", "select", "check", "uncheck", "press", "go-back", "go-forward", "reload", "tab-select", "dialog-accept", "dialog-dismiss"])

/**
 * Runs one command. `sessionId` empty + "open" starts a new session.
 */
export async function execServer(opts: { userId: string; projectId: string; sessionId?: string; cmd: string; args: string[] }): Promise<ExecResult> {
  const err = commandError(opts.cmd, opts.args)
  if (err) throw new BrowserAgentError(err)
  const cmd = opts.cmd as BaCommand

  let s = opts.sessionId ? sessions.get(opts.sessionId) : undefined
  if (opts.sessionId && !s) {
    if (cmd === "close") return { session: opts.sessionId, ok: true }
    throw new BrowserAgentError("This browser was closed (idle for 15 minutes, or the server restarted). Open it again.", 410)
  }
  if (s && (s.userId !== opts.userId || s.projectId !== opts.projectId)) throw new BrowserAgentError("Not your browser session", 403)
  if (!s) {
    if (cmd !== "open") throw new BrowserAgentError("Open a browser first.")
    sweep()
    if (sessions.size >= MAX_SESSIONS) throw new BrowserAgentError(`The server is already running ${MAX_SESSIONS} agent browsers. Try again in a few minutes, or run on your computer.`, 429)
    const id = randomUUID()
    const dir = path.join(BA_ROOT, id)
    fs.mkdirSync(path.join(dir, "out"), { recursive: true })
    s = { id, cliName: `qa-${id.slice(0, 8)}`, userId: opts.userId, projectId: opts.projectId, dir, lastUsed: Date.now(), busy: false }
    sessions.set(id, s)
  }
  if (s.busy) throw new BrowserAgentError("The browser is still busy with the previous command.", 409)
  s.busy = true
  s.lastUsed = Date.now()
  try {
    if (cmd === "close") {
      await closeSession(s)
      return { session: s.id, ok: true }
    }
    const r = await run(s.dir, cliArgs(s.cliName, cmd, opts.args))
    const out = parseOut(r.stdout)
    if (r.code !== 0 || out?.isError) {
      const message = clean(String(out?.error || r.stderr || out?.result || "The command failed")).split("\nCall log:")[0]
      if (cmd === "open") await closeSession(s)
      return { session: s.id, ok: false, error: message.slice(0, 2000) }
    }
    const res: ExecResult = { session: s.id, ok: true, result: out }
    if (cmd === "snapshot") res.snapshot = typeof out?.snapshot === "string" ? out.snapshot : ""
    if (cmd === "screenshot") {
      const rel = String(out?.result || "").match(/\]\(([^)]+\.png)\)/)?.[1]
      const file = rel ? path.resolve(s.dir, rel) : null
      if (file && file.startsWith(s.dir + path.sep) && fs.existsSync(file)) {
        res.screenshot = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`
        fs.rmSync(file, { force: true })
      }
    }
    if (PAGE_CHANGING.has(cmd)) {
      const tabs = parseOut((await run(s.dir, cliArgs(s.cliName, "tab-list", []))).stdout)
      const m = String(tabs?.result || "").match(/\(current\)\s*\[(.*)\]\((\S+)\)/)
      res.page = m ? { title: m[1], url: m[2] } : null
    }
    // Snapshot files from page actions pile up; the agent asks for snapshots itself.
    for (const f of fs.readdirSync(s.dir).filter((f) => f === ".playwright-cli")) {
      for (const x of fs.readdirSync(path.join(s.dir, f))) if (x.endsWith(".yml") || x.endsWith(".log")) fs.rmSync(path.join(s.dir, f, x), { force: true })
    }
    return res
  } finally {
    s.busy = false
    s.lastUsed = Date.now()
  }
}

/** Sessions this user has open (for "close all" and the status line). */
export function userSessions(userId: string) {
  return Array.from(sessions.values()).filter((s) => s.userId === userId).map((s) => ({ id: s.id, projectId: s.projectId, lastUsed: s.lastUsed }))
}
