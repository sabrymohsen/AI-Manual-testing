// Playwright projects on this computer: the tester's own automation folders.
//
// The QA Engine page can list the folders the user linked here, and run one
// with the project's own setup, streaming the output back and returning the
// report so the results can be shared in the Automation Hub:
// - JavaScript/TypeScript: `npx playwright test` → Playwright's JSON report.
// - Python (pytest + pytest-playwright): `python -m pytest` with the project's
//   own virtualenv → a JUnit XML report.
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

const PY_CONFIGS = ["pytest.ini", "pyproject.toml", "setup.cfg", "tox.ini", "conftest.py"]
const PY_REQS = ["requirements.txt", "requirements-dev.txt", "pyproject.toml", "Pipfile"]

const read = (file) => {
  try {
    return fs.readFileSync(file, "utf8")
  } catch {
    return ""
  }
}

/** The project's own Python: its virtualenv if it has one, else the system one. */
function pythonFor(dir) {
  for (const venv of [".venv", "venv", "env"]) {
    const exe = isWin ? path.join(dir, venv, "Scripts", "python.exe") : path.join(dir, venv, "bin", "python")
    if (fs.existsSync(exe)) return { exe, venv: true }
  }
  return { exe: isWin ? "python" : "python3", venv: false }
}

/** A pytest project that uses Playwright (pytest-playwright or playwright in its requirements). */
function describePython(dir) {
  const reqs = PY_REQS.map((f) => read(path.join(dir, f))).join("\n")
  const usesPlaywright = /pytest-playwright|\bplaywright\b/i.test(reqs)
  const config = PY_CONFIGS.find((c) => fs.existsSync(path.join(dir, c)) && (c !== "pyproject.toml" || /\[tool\.pytest/.test(read(path.join(dir, c))))) || null
  if (!usesPlaywright || !config) return null
  const py = pythonFor(dir)
  return {
    path: dir,
    name: path.basename(dir),
    kind: "pytest",
    config,
    hasPlaywright: true,
    installed: py.venv,
    python: py.exe,
  }
}

function describeFolder(dir) {
  const config = CONFIGS.find((c) => fs.existsSync(path.join(dir, c))) || null
  let pkg = null
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
  } catch {}
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const hasPlaywright = !!(deps["@playwright/test"] || deps.playwright)
  if (!config && !hasPlaywright) {
    const py = describePython(dir)
    if (py) return py
  }
  return {
    path: dir,
    name: pkg?.name || path.basename(dir),
    kind: "node",
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
    return {
      error:
        "That folder doesn't look like a Playwright project. Expected playwright.config or @playwright/test in package.json (JavaScript), or pytest.ini/conftest.py with pytest-playwright in requirements.txt (Python).",
    }
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

/** The command that runs a project's tests, and where its report lands. */
function command(dir, opts) {
  const info = describeFolder(dir)
  const grep = typeof opts.grep === "string" ? opts.grep.trim().slice(0, 300) : ""
  if (info.kind === "pytest") {
    const reportFile = path.join(os.tmpdir(), `qa-engine-junit-${Date.now()}.xml`)
    // -p no:cacheprovider keeps the run from writing .pytest_cache into the project.
    const args = ["-m", "pytest", `--junitxml=${reportFile}`, "-o", "junit_family=xunit1", "-p", "no:cacheprovider"]
    if (grep) args.push("-k", grep)
    const marker = typeof opts.marker === "string" ? opts.marker.trim().slice(0, 200) : ""
    if (marker) args.push("-m", marker)
    if (opts.headed) args.push("--headed")
    return {
      exe: info.python,
      args,
      env: { PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", PY_COLORS: "0" },
      shell: false,
      reportFile,
      format: "junit",
      cantStart: `Is Python installed, and has this project's virtualenv been set up (python -m venv .venv, then pip install -r requirements.txt)?`,
    }
  }
  const reportFile = path.join(os.tmpdir(), `qa-engine-report-${Date.now()}.json`)
  const args = ["playwright", "test", "--reporter=list,json"]
  if (grep) args.push("--grep", grep)
  if (typeof opts.project === "string" && /^[\w .-]{1,60}$/.test(opts.project)) args.push(`--project=${opts.project}`)
  if (opts.headed) args.push("--headed")
  return {
    exe: isWin ? "npx.cmd" : "npx",
    args,
    env: { PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile },
    shell: isWin,
    reportFile,
    format: "playwright",
    cantStart: `Is Node.js installed, and has this project run "npm install"?`,
  }
}

/** Runs the project's tests; resolves with the report (or null), its format and the exit code. */
function run(event, dir, opts = {}) {
  if (!linked().includes(dir)) throw new Error("Link this folder first (Choose folder).")
  if (running.has(dir)) throw new Error("This project is already running.")
  const sender = event.sender
  const cmd = command(dir, opts)
  const reportFile = cmd.reportFile

  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(cmd.exe, cmd.args, {
      cwd: dir,
      env: { ...process.env, ...cmd.env, FORCE_COLOR: "0" },
      shell: cmd.shell,
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
        const text = fs.readFileSync(reportFile, "utf8")
        report = cmd.format === "junit" ? text : JSON.parse(text)
        fs.rmSync(reportFile, { force: true })
      } catch {}
      resolve({ exitCode: code, report, format: cmd.format, log, durationMs: Date.now() - started })
    }
    child.on("error", (err) => {
      onData(`\nCouldn't start the tests: ${err.message}\n${cmd.cantStart}\n`)
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
