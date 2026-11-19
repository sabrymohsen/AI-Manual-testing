// "AI on this computer": lets the QA Engine page use Ollama on this machine.
//
// The page (our server's origin only) asks through the preload bridge; only the
// main process touches http://127.0.0.1:11434, and only these Ollama endpoints:
// status (/api/tags), chat (/api/chat) and model download (/api/pull).
const { ipcMain, shell } = require("electron")

const OLLAMA = "http://127.0.0.1:11434"
const DOWNLOAD_PAGE = "https://ollama.com/download"

async function status() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return { running: false, models: [] }
    const d = await res.json()
    return { running: true, models: (d.models || []).map((m) => m.name).filter(Boolean) }
  } catch {
    return { running: false, models: [] }
  }
}

async function chat(body) {
  if (!body || typeof body !== "object" || typeof body.model !== "string") {
    return { ok: false, status: 400, data: { error: "invalid request" } }
  }
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, stream: false }),
      signal: AbortSignal.timeout(600_000),
    })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
  } catch (err) {
    return { ok: false, status: 503, data: { error: `Ollama is not running on this computer (${err?.message || err})` } }
  }
}

/** Downloads a model, sending progress {status, completed, total} to the page. */
async function pull(sender, model) {
  if (typeof model !== "string" || !/^[\w.:\-\/]{1,100}$/.test(model)) return { ok: false, error: "invalid model name" }
  try {
    const res = await fetch(`${OLLAMA}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
    })
    if (!res.ok || !res.body) return { ok: false, error: `Ollama returned ${res.status}` }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    let last = null
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          last = JSON.parse(line)
          if (!sender.isDestroyed()) sender.send("desktop:ai-pull-progress", { model, ...last })
        } catch {}
      }
    }
    if (last?.error) return { ok: false, error: last.error }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Ollama is not running on this computer (${err?.message || err})` }
  }
}

/** Registers the IPC handlers; `allowed(event)` restricts them to our server's pages. */
function register(allowed) {
  const guard = (fn) => async (event, ...args) => {
    if (!allowed(event)) throw new Error("Not allowed")
    return fn(event, ...args)
  }
  ipcMain.handle("desktop:ai-status", guard(() => status()))
  ipcMain.handle("desktop:ai-chat", guard((_e, body) => chat(body)))
  ipcMain.handle("desktop:ai-pull", guard((e, model) => pull(e.sender, model)))
  ipcMain.handle("desktop:ai-download", guard(() => shell.openExternal(DOWNLOAD_PAGE)))
}

module.exports = { register, status }
