// Playwright projects on this computer: the tester's own automation folders.
//
// The QA Engine page can list the folders the user linked here, and run one —
// `npx playwright test` in that folder, with the project's own node_modules,
// config and browsers — streaming the output back and returning the JSON
// report so the results can be shared in the Automation Hub.
//
// Safety: only folders the user picked in a native dialog can be run, only the
// app's own page can ask, and only one run per folder at a time.
const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawn } = require("child_process")
const { ipcMain, dialog, BrowserWindow } = require("electron")
const settings = require("./settings")

const isWin = process.platform === "win32"
const running = new Map() // folder -> child process

const CONFIGS = ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs", "playwright.config.cjs"]

function describeFolder(dir) {
  const config = CONFIGS.find((c) => fs.existsSync(path.join(dir, c))) || null
  let pkg = null
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
  } catch {}
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const hasPlaywright = !!(deps["@playwright/test"] || deps.playwright)
  return {
    path: dir,
    name: pkg?.name || path.basename(dir),
    config,
    hasPlaywright,
    installed: fs.existsSync(path.join(dir, "node_modules", "@playwright", "test")) || fs.existsSync(path.join(dir, "node_modules", "playwright")),
  }
}

function linked() {
  return (settings.load().localProjects || []).filter((p) => fs.existsSync(p))
}

async function pick(event) {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = await dialog.showOpenDialog(win, { title: "Choose a Playwright project folder", properties: ["openDirectory"] })
  if (r.canceled || !r.filePaths[0]) return null
  const info = describeFolder(r.filePaths[0])
  if (!info.config && !info.hasPlaywright) {
    return { error: "That folder doesn't look like a Playwright project (no playwright.config or @playwright/test in package.json)." }
  }
  const list = Array.from(new Set([...linked(), info.path]))
  settings.save({ localProjects: list })
  return info
}

function list() {
  return linked().map(describeFolder)
}

function unlink(dir) {
  settings.save({ localProjects: linked().filter((p) => p !== dir) })
  return true
}

/** Runs the project's tests; resolves with the JSON report (or null) and exit code. */
function run(event, dir, opts = {}) {
  if (!linked().includes(dir)) throw new Error("Link this folder first (Choose folder).")
  if (running.has(dir)) throw new Error("This project is already running.")
  const sender = event.sender
  const reportFile = path.join(os.tmpdir(), `qa-engine-report-${Date.now()}.json`)
  const args = ["playwright", "test", "--reporter=list,json"]
  if (typeof opts.grep === "string" && opts.grep.trim()) args.push("--grep", opts.grep.trim())
  if (typeof opts.project === "string" && /^[\w .-]{1,60}$/.test(opts.project)) args.push(`--project=${opts.project}`)
  if (opts.headed) args.push("--headed")

  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(isWin ? "npx.cmd" : "npx", args, {
      cwd: dir,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile, FORCE_COLOR: "0" },
      shell: isWin,
    })
    running.set(dir, child)
    const send = (text) => !sender.isDestroyed() && sender.send("desktop:pw-log", { dir, text })
    let log = ""
    const onData = (d) => {
      const text = d.toString()
      log = (log + text).slice(-200_000)
      send(text)
    }
    child.stdout.on("data", onData)
    child.stderr.on("data", onData)
    const timer = setTimeout(() => child.kill(), 30 * 60 * 1000)
    const finish = (code) => {
      clearTimeout(timer)
      running.delete(dir)
      let report = null
      try {
        report = JSON.parse(fs.readFileSync(reportFile, "utf8"))
        fs.rmSync(reportFile, { force: true })
      } catch {}
      resolve({ exitCode: code, report, log, durationMs: Date.now() - started })
    }
    child.on("error", (err) => {
      onData(`\nCouldn't start Playwright: ${err.message}\nIs Node.js installed, and has this project run "npm install"?\n`)
      finish(-1)
    })
    child.on("close", (code) => finish(code))
  })
}

function stop(dir) {
  const child = running.get(dir)
  if (child) child.kill()
  return !!child
}

/** Registers the IPC handlers; `allowed(event)` restricts them to our server's pages. */
function register(allowed) {
  const guard = (fn) => async (event, ...args) => {
    if (!allowed(event)) throw new Error("Not allowed")
    return fn(event, ...args)
  }
  ipcMain.handle("desktop:pw-pick", guard((e) => pick(e)))
  ipcMain.handle("desktop:pw-list", guard(() => list()))
  ipcMain.handle("desktop:pw-unlink", guard((_e, dir) => unlink(dir)))
  ipcMain.handle("desktop:pw-run", guard((e, dir, opts) => run(e, dir, opts)))
  ipcMain.handle("desktop:pw-stop", guard((_e, dir) => stop(dir)))
}

module.exports = { register, describeFolder }
