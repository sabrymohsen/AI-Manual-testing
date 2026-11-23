// Browser Agent on this computer: the QA Engine page sends playwright-cli
// commands, they run here with the tester's own Chrome (or Edge), so the agent
// reaches internal and VPN-only sites and the browser can be visible.
//
// Same allowed-command list as the server (src/lib/browser-agent/commands.ts):
// no run-code / eval, no file access, no network mocking. Only the app's own
// page can ask (guarded in register()).
const fs = require("fs")
const os = require("os")
const path = require("path")
const crypto = require("crypto")
const { spawn } = require("child_process")
const { ipcMain, app } = require("electron")

const CMD_TIMEOUT_MS = 90_000
const IDLE_MS = 15 * 60 * 1000
const sessions = new Map() // id -> { cliName, dir, lastUsed, busy }

// ── allowed commands (keep in step with src/lib/browser-agent/commands.ts) ──
const REF = /^(?:f\d+)?e\d{1,6}$/
const KEY = /^[A-Za-z0-9+]{1,30}$/
const isUrl = (s) => {
  try {
    const u = new URL(s)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}
const text = (s, max = 2000) => typeof s === "string" && s.length <= max
const one = (a) => a.length === 1 && REF.test(a[0])
const none = (a) => a.length === 0
const RULES = {
  open: (a) => a.length === 0 || (a.length === 1 && isUrl(a[0])),
  goto: (a) => a.length === 1 && isUrl(a[0]),
  click: one,
  dblclick: one,
  hover: one,
  check: one,
  uncheck: one,
  "generate-locator": one,
  fill: (a) => a.length === 2 && REF.test(a[0]) && text(a[1]),
  select: (a) => a.length === 2 && REF.test(a[0]) && text(a[1], 500),
  type: (a) => a.length === 1 && text(a[0]),
  press: (a) => a.length === 1 && KEY.test(a[0]),
  snapshot: none,
  screenshot: none,
  "go-back": none,
  "go-forward": none,
  reload: none,
  "dialog-accept": (a) => a.length === 0 || (a.length === 1 && text(a[0], 500)),
  "dialog-dismiss": none,
  "tab-list": none,
  "tab-select": (a) => a.length === 1 && /^\d{1,2}$/.test(a[0]),
  resize: (a) => a.length === 2 && a.every((n) => /^\d{3,4}$/.test(n)),
  close: none,
}
const PAGE_CHANGING = new Set(["open", "goto", "click", "dblclick", "fill", "type", "select", "check", "uncheck", "press", "go-back", "go-forward", "reload", "tab-select", "dialog-accept", "dialog-dismiss"])

function commandError(cmd, args) {
  if (typeof cmd !== "string" || !Object.prototype.hasOwnProperty.call(RULES, cmd)) return `"${cmd}" isn't an allowed browser command`
  if (!Array.isArray(args) || !args.every((a) => typeof a === "string")) return "Arguments must be a list of text values"
  if (args.some((a, i) => a.startsWith("-") && !(cmd === "fill" && i === 1) && cmd !== "type" && !(cmd === "select" && i === 1))) return "Arguments can't start with -"
  if (!RULES[cmd](args)) return `Invalid arguments for "${cmd}"`
  return null
}

function cliScript() {
  // Packaged: unpacked next to app.asar (it spawns its own daemon process).
  const p = require.resolve("@playwright/cli/playwright-cli.js")
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
}

/** The tester's installed browser: Chrome, else Edge. */
function browserChannel() {
  const has = (paths) => paths.some((p) => p && fs.existsSync(p))
  if (process.platform === "darwin") {
    if (has(["/Applications/Google Chrome.app", path.join(os.homedir(), "Applications/Google Chrome.app")])) return "chrome"
    if (has(["/Applications/Microsoft Edge.app"])) return "msedge"
  } else if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
    if (has(roots.map((r) => r && path.join(r, "Google", "Chrome", "Application", "chrome.exe")))) return "chrome"
    if (has(roots.map((r) => r && path.join(r, "Microsoft", "Edge", "Application", "msedge.exe")))) return "msedge"
  } else {
    if (has(["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"])) return "chrome"
    if (has(["/usr/bin/microsoft-edge"])) return "msedge"
  }
  return null
}

function run(dir, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliScript(), ...args], {
      cwd: dir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        FORCE_COLOR: "0",
        PLAYWRIGHT_MCP_OUTPUT_DIR: path.join(dir, "out"),
        // Kept apart from any playwright-cli sessions the tester runs themselves.
        PLAYWRIGHT_DAEMON_SESSION_DIR: path.join(app.getPath("userData"), "browser-agent", "daemon"),
      },
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d) => (stdout = (stdout + d).slice(-4_000_000)))
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-100_000)))
    const timer = setTimeout(() => child.kill(), CMD_TIMEOUT_MS)
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

function parseOut(stdout) {
  const t = String(stdout || "").trim()
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

const cliArgs = (name, cmd, args, extra = []) => [`-s=${name}`, "--json", cmd, ...extra, ...(args.some((a) => a.startsWith("-")) ? ["--"] : []), ...args]
const clean = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "").replace(/^Error: (Error: )?/, "").trim()

async function closeSession(id) {
  const s = sessions.get(id)
  if (!s) return
  sessions.delete(id)
  await run(s.dir, [`-s=${s.cliName}`, "close"]).catch(() => {})
  fs.rmSync(s.dir, { recursive: true, force: true })
}

setInterval(() => {
  const now = Date.now()
  for (const [id, s] of sessions) if (!s.busy && now - s.lastUsed > IDLE_MS) void closeSession(id)
}, 60_000).unref()

async function exec(sessionId, cmd, args, opts = {}) {
  const err = commandError(cmd, args)
  if (err) throw new Error(err)
  let id = sessionId || ""
  let s = id ? sessions.get(id) : null
  if (id && !s) {
    if (cmd === "close") return { session: id, ok: true }
    throw new Error("This browser was closed (idle for 15 minutes, or the app restarted). Open it again.")
  }
  if (!s) {
    if (cmd !== "open") throw new Error("Open a browser first.")
    id = crypto.randomUUID()
    const dir = path.join(app.getPath("userData"), "browser-agent", id)
    fs.mkdirSync(path.join(dir, "out"), { recursive: true })
    s = { cliName: `qa-${id.slice(0, 8)}`, dir, lastUsed: Date.now(), busy: false }
    sessions.set(id, s)
  }
  if (s.busy) throw new Error("The browser is still busy with the previous command.")
  s.busy = true
  s.lastUsed = Date.now()
  try {
    if (cmd === "close") {
      await closeSession(id)
      return { session: id, ok: true }
    }
    const extra = []
    if (cmd === "open") {
      if (opts.headed) extra.push("--headed")
      const channel = browserChannel()
      if (!channel) {
        await closeSession(id)
        return { session: id, ok: false, error: "Install Google Chrome (or Microsoft Edge) on this computer — the Browser Agent uses it." }
      }
      extra.push(`--browser=${channel}`)
    }
    const r = await run(s.dir, cliArgs(s.cliName, cmd, args, extra))
    const out = parseOut(r.stdout)
    if (r.code !== 0 || out?.isError) {
      const message = clean(out?.error || r.stderr || out?.result || "The command failed").split("\nCall log:")[0]
      if (cmd === "open") await closeSession(id)
      return { session: id, ok: false, error: message.slice(0, 2000) }
    }
    const res = { session: id, ok: true, result: out }
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
    const logs = path.join(s.dir, ".playwright-cli")
    if (fs.existsSync(logs)) for (const x of fs.readdirSync(logs)) if (/\.(yml|log)$/.test(x)) fs.rmSync(path.join(logs, x), { force: true })
    return res
  } finally {
    s.busy = false
    s.lastUsed = Date.now()
  }
}

function closeAll() {
  return Promise.all(Array.from(sessions.keys()).map(closeSession))
}

/** Registers the IPC handlers; `allowed(event)` restricts them to our server's pages. */
function register(allowed) {
  ipcMain.handle("desktop:ba-exec", async (event, sessionId, cmd, args, opts) => {
    if (!allowed(event)) throw new Error("Not allowed")
    return exec(sessionId, cmd, Array.isArray(args) ? args : [], opts || {})
  })
  ipcMain.handle("desktop:ba-info", (event) => {
    if (!allowed(event)) throw new Error("Not allowed")
    return { browser: browserChannel() }
  })
  app.on("before-quit", () => void closeAll())
}

module.exports = { register, commandError }
