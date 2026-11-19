// Tiny JSON settings store in the per-user app data folder
// (~/Library/Application Support/QA Engine on macOS, %APPDATA%\QA Engine on Windows).
const fs = require("fs")
const path = require("path")
const { app } = require("electron")

const SERVERS = {
  online: { label: "QA Engine", url: "https://79-76-112-176.sslip.io" },
  local: { label: "This computer (developer)", url: "http://localhost:3000" },
}
// The old Railway servers ("production", "staging") are retired; anyone still
// pointed at them is moved to the online server.

const DEFAULTS = {
  // New installs open the shared online server; "This computer" needs the project folder.
  server: "online", // "online" | "local" | "custom"
  repoPath: "", // project folder used by "This computer" mode
  customUrl: "",
  window: { width: 1440, height: 900, x: undefined, y: undefined, maximized: false },
}

function file() {
  return path.join(app.getPath("userData"), "settings.json")
}

let cache = null

function load() {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) }
  } catch {
    cache = { ...DEFAULTS }
  }
  if (cache.server !== "custom" && !SERVERS[cache.server]) cache.server = "online"
  return cache
}

function save(patch) {
  cache = { ...load(), ...patch }
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2))
  } catch (err) {
    console.error("[settings] could not save:", err.message)
  }
  return cache
}

/** The server the window should load. QA_ENGINE_URL (dev) wins over saved settings. */
function serverUrl() {
  if (process.env.QA_ENGINE_URL) return normalize(process.env.QA_ENGINE_URL)
  const s = load()
  if (s.server === "custom" && s.customUrl) return normalize(s.customUrl)
  return (SERVERS[s.server] || SERVERS.online).url
}

function normalize(url) {
  const u = new URL(url.includes("://") ? url : `https://${url}`)
  return u.origin
}

module.exports = { SERVERS, load, save, serverUrl, normalize }
