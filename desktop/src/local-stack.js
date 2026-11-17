// "This computer" mode: runs the whole QA Engine stack from the project folder
// on this machine (Postgres + Redis, web app, socket server, workers, recorder)
// and stops what it started when the app quits.
const fs = require("fs")
const net = require("net")
const os = require("os")
const path = require("path")
const crypto = require("crypto")
const { spawn, execFile } = require("child_process")

const isWin = process.platform === "win32"

// GUI apps on macOS don't inherit the shell PATH, so node/npm/brew go missing.
const EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
const PATH = [...new Set([...EXTRA_PATH, ...(process.env.PATH || "").split(path.delimiter)])].join(path.delimiter)

// The socket server's usual :3001 is a common port for other local tools, so
// desktop mode runs it on its own port and points the web app at it.
const SOCKET_PORT = 3101

// The web app runs from a production build (see startWeb), not `next dev`:
// dev mode compiled every page on first visit — 1–6 s per screen on a busy
// laptop — where the build answers in tens of milliseconds. The build lives in
// its own folder so it never collides with a `npm run dev` in a terminal.
// Set QA_DESKTOP_WEB_MODE=dev to get the old behaviour.
const BUILD_DIR = ".next-desktop"
const WEB_PORT = 3000

const SERVICES = [
  { name: "socket", script: "dev:socket", port: SOCKET_PORT },
  { name: "recorder", script: "recorder-worker", port: 3847 },
  { name: "workers", script: "workers" },
]

const children = []
let logFn = () => {}

function log(line) {
  logFn(String(line).trimEnd())
}

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host })
    sock.setTimeout(800)
    sock.once("connect", () => { sock.destroy(); resolve(true) })
    sock.once("timeout", () => { sock.destroy(); resolve(false) })
    sock.once("error", () => resolve(false))
  })
}

async function waitForPort(port, timeoutMs, label) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (await isPortOpen(port)) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`${label} did not start on port ${port} within ${Math.round(timeoutMs / 1000)}s`)
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { env: { ...process.env, PATH }, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout || ""}${stderr || ""}`.trim() })
    })
  })
}

/** Parse the project's .env (the tsx workers don't load it themselves). */
function readEnvFile(repo) {
  const env = {}
  try {
    for (const raw of fs.readFileSync(path.join(repo, ".env"), "utf8").split(/\r?\n/)) {
      const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[m[1]] = v
    }
  } catch {}
  return env
}

function isRepo(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
    return pkg.name === "ai-manual-qa-tester"
  } catch {
    return false
  }
}

/** Best guess at the project folder when none is saved yet. */
function guessRepo() {
  const candidates = [
    path.join(os.homedir(), "Desktop", "AI-Manual-testing"),
    path.join(os.homedir(), "AI-Manual-testing"),
    path.join(os.homedir(), "Documents", "AI-Manual-testing"),
    path.resolve(__dirname, "..", ".."), // running from desktop/ inside the repo
  ]
  return candidates.find(isRepo) || null
}

async function ensurePostgres() {
  if (await isPortOpen(5432)) return log("✓ Database already running")
  log("Starting database…")
  const brewPrefixes = ["/opt/homebrew", "/usr/local"]
  for (const prefix of brewPrefixes) {
    let formulas = []
    try {
      formulas = fs.readdirSync(path.join(prefix, "opt")).filter((f) => /^postgresql(@\d+)?$/.test(f))
    } catch {}
    for (const f of formulas.sort().reverse()) {
      const dataDir = path.join(prefix, "var", f)
      const pgCtl = path.join(prefix, "opt", f, "bin", "pg_ctl")
      if (!fs.existsSync(dataDir) || !fs.existsSync(pgCtl)) continue
      await run(pgCtl, ["-D", dataDir, "-l", path.join(prefix, "var", "log", `${f}.log`), "start"])
      try {
        await waitForPort(5432, 20000, "Database")
        return log(`✓ Database started (${f})`)
      } catch {}
    }
  }
  throw new Error("Couldn't start PostgreSQL. Install it with: brew install postgresql@14")
}

async function ensureRedis() {
  if (await isPortOpen(6379)) return log("✓ Redis already running")
  log("Starting Redis…")
  const r = await run("redis-server", ["--daemonize", "yes"])
  if (!r.ok) throw new Error(`Couldn't start Redis (${r.out || "redis-server not found"}). Install it with: brew install redis`)
  await waitForPort(6379, 10000, "Redis")
  log("✓ Redis started")
}

function startService(repo, env, svc) {
  log(`Starting ${svc.name}…`)
  const npm = isWin ? "npm.cmd" : "npm"
  const child = spawn(npm, ["run", svc.script, ...(svc.args ? ["--", ...svc.args] : [])], {
    cwd: repo,
    env,
    detached: !isWin, // own process group so we can stop npm *and* its children
    stdio: ["ignore", "pipe", "pipe"],
  })
  const prefix = `[${svc.name}] `
  const pipe = (buf) => String(buf).split(/\r?\n/).filter(Boolean).forEach((l) => log(prefix + l))
  child.stdout.on("data", pipe)
  child.stderr.on("data", pipe)
  child.on("exit", (code) => log(`${prefix}stopped (exit ${code})`))
  children.push(child)
}

/**
 * A fingerprint of the code the build was made from: the commit, plus any
 * uncommitted edits and new files. A different fingerprint means rebuild.
 */
async function codeStamp(repo) {
  const opts = { cwd: repo, maxBuffer: 256 * 1024 * 1024 }
  const head = await run("git", ["rev-parse", "HEAD"], opts)
  if (!head.ok) return null // not a git checkout: can't tell, so always rebuild
  const watched = ["src", "public", "prisma", "next.config.js", "package.json", "package-lock.json", "tailwind.config.ts", "postcss.config.js", "tsconfig.json"]
  const diff = await run("git", ["diff", "HEAD", "--", ...watched], opts)
  const untracked = await run("git", ["ls-files", "--others", "--exclude-standard", "--", ...watched], opts)
  const hash = crypto.createHash("sha256").update(head.out).update(diff.out)
  for (const f of untracked.out.split("\n").filter(Boolean)) {
    try {
      const st = fs.statSync(path.join(repo, f))
      hash.update(`${f}:${st.size}:${st.mtimeMs}`)
    } catch {}
  }
  // NEXT_PUBLIC_* values are baked into the build.
  const envFile = readEnvFile(repo)
  hash.update(Object.keys(envFile).filter((k) => k.startsWith("NEXT_PUBLIC_")).sort().map((k) => `${k}=${envFile[k]}`).join("\n"))
  hash.update(`socket:${SOCKET_PORT}`)
  return hash.digest("hex")
}

/** Build the web app into BUILD_DIR unless the existing build matches the code. */
async function ensureWebBuild(repo, env) {
  const dir = path.join(repo, BUILD_DIR)
  const stampFile = path.join(dir, "qa-desktop-stamp")
  const stamp = await codeStamp(repo)
  let built = null
  try {
    built = fs.readFileSync(stampFile, "utf8").trim()
  } catch {}
  if (stamp && built === stamp && fs.existsSync(path.join(dir, "BUILD_ID"))) {
    log("✓ App build is up to date")
    return true
  }

  log(fs.existsSync(path.join(dir, "BUILD_ID"))
    ? "The code changed since the last build — rebuilding so pages open instantly (about 3–5 minutes)…"
    : "Building the app once so pages open instantly (about 3–5 minutes, only after code changes)…")
  const started = Date.now()
  const ok = await new Promise((resolve) => {
    const npm = isWin ? "npm.cmd" : "npm"
    const child = spawn(npm, ["run", "build"], { cwd: repo, env: { ...env, NEXT_DIST_DIR: BUILD_DIR }, stdio: ["ignore", "pipe", "pipe"] })
    let tail = ""
    const onData = (buf) => {
      const text = String(buf)
      tail = (tail + text).slice(-4000)
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/\u001b\[[0-9;]*m/g, "")
        // Milestones only: a full build log is thousands of lines.
        if (/Creating an optimized|Compiled|Collecting page data|Generating static pages \(\d+\/\d+\)$|Finalizing|Failed|Error:|error /i.test(line)) log(`[build] ${line.trim()}`)
      }
    }
    child.stdout.on("data", onData)
    child.stderr.on("data", onData)
    child.on("error", () => resolve(false))
    child.on("close", (code) => {
      if (code !== 0) log(`[build] failed:\n${tail}`)
      resolve(code === 0)
    })
  })
  if (!ok) return false
  try {
    if (stamp) fs.writeFileSync(stampFile, stamp)
  } catch {}
  log(`✓ Build finished in ${Math.round((Date.now() - started) / 1000)}s`)
  return true
}

/** Production build when possible; `next dev` as the fallback. */
async function startWeb(repo, env) {
  if (await isPortOpen(WEB_PORT)) {
    log(`✓ web already running on :${WEB_PORT}`)
    return
  }
  const mode = (process.env.QA_DESKTOP_WEB_MODE || env.QA_DESKTOP_WEB_MODE || "build").toLowerCase()
  if (mode !== "dev" && (await ensureWebBuild(repo, env))) {
    startService(repo, { ...env, NEXT_DIST_DIR: BUILD_DIR }, { name: "web", script: "start", args: ["-p", String(WEB_PORT)] })
    return
  }
  if (mode !== "dev") log("Falling back to development mode (slower page loads) so you can keep working.")
  startService(repo, env, { name: "web", script: "dev" })
}

/**
 * Start everything that isn't already running. Resolves once the web app
 * answers on :3000. Services already listening (e.g. you ran `npm run dev`
 * yourself) are left alone and not stopped on quit.
 */
async function start(repo, onLog) {
  logFn = onLog || logFn
  if (!repo || !isRepo(repo)) throw new Error("Project folder not found. Choose it from Server → Choose project folder…")
  if (!fs.existsSync(path.join(repo, "node_modules"))) {
    log("Installing dependencies (first run only, a few minutes)…")
    const r = await run(isWin ? "npm.cmd" : "npm", ["install"], { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
    if (!r.ok) throw new Error(`npm install failed:\n${r.out.slice(-2000)}`)
  }

  await ensurePostgres()
  await ensureRedis()

  const env = {
    ...process.env,
    ...readEnvFile(repo),
    PATH,
    FORCE_COLOR: "0",
    SOCKET_PORT: String(SOCKET_PORT),
    // Everything runs on this machine, so the live view has no bandwidth to
    // save: stream Retina-resolution frames at high quality by default.
    RECORDER_STREAM_PROFILE: process.env.RECORDER_STREAM_PROFILE || "sharp",
    SOCKET_INTERNAL_URL: `http://localhost:${SOCKET_PORT}`,
    NEXT_PUBLIC_SOCKET_URL: `http://localhost:${SOCKET_PORT}`,
    // Electron sets these for itself; don't leak them into node children.
    ELECTRON_RUN_AS_NODE: "",
  }
  delete env.ELECTRON_RUN_AS_NODE

  for (const svc of SERVICES) {
    if (svc.port && (await isPortOpen(svc.port))) {
      log(`✓ ${svc.name} already running on :${svc.port}`)
      continue
    }
    startService(repo, env, svc)
  }
  // After the others, so the socket server and workers come up while a build runs.
  await startWeb(repo, env)

  await waitForPort(WEB_PORT, 180000, "Web app")
  log("✓ QA Engine is up — opening…")
}

function stop() {
  for (const child of children) {
    if (child.exitCode !== null) continue
    try {
      if (isWin) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"])
      else process.kill(-child.pid, "SIGTERM")
    } catch {}
  }
  children.length = 0
}

module.exports = { start, stop, guessRepo, isRepo }
