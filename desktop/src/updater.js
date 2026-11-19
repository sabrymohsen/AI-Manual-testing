// Desktop app updates from our own server (no Apple/Windows signing needed).
//
// The server publishes /downloads/latest.json:
//   { "version": "0.3.0", "notes": "...", "files": { "darwin-arm64": "QA-Engine-mac-arm64.dmg", ... } }
// When it's newer than this app, the user gets "Update now": the installer is
// downloaded with a progress bar and opened (Mac: the disk image; Windows: the setup).
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFile } = require("child_process")
const { app, dialog, shell, BrowserWindow } = require("electron")

const run = (cmd, args) =>
  new Promise((resolve, reject) => execFile(cmd, args, (err, stdout) => (err ? reject(err) : resolve(stdout))))

/**
 * Mac: put the new version in place of this app and restart — no dragging.
 * Works unsigned because the disk image was downloaded by the app itself (no
 * quarantine flag). Returns false when it can't (e.g. no write access), and the
 * caller falls back to opening the disk image.
 */
async function installMac(dmg, bundle = path.resolve(process.execPath, "..", "..", "..") /* …/QA Engine.app */) {
  if (!bundle.endsWith(".app")) return false
  const mount = fs.mkdtempSync(path.join(os.tmpdir(), "qa-engine-update-"))
  try {
    await run("hdiutil", ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount, dmg])
    const appName = fs.readdirSync(mount).find((f) => f.endsWith(".app"))
    if (!appName) return false
    const staged = `${bundle}.new`
    fs.rmSync(staged, { recursive: true, force: true })
    await run("ditto", [path.join(mount, appName), staged])
    const old = `${bundle}.old`
    fs.rmSync(old, { recursive: true, force: true })
    fs.renameSync(bundle, old)
    try {
      fs.renameSync(staged, bundle)
    } catch (err) {
      fs.renameSync(old, bundle) // put the working version back
      throw err
    }
    fs.rmSync(old, { recursive: true, force: true })
    return true
  } catch (err) {
    console.warn("[updater] in-place install failed:", err?.message || err)
    return false
  } finally {
    await run("hdiutil", ["detach", mount, "-quiet"]).catch(() => {})
    fs.rmSync(mount, { recursive: true, force: true })
  }
}

// Updates always come from the online server, even when the app is pointed at "This computer".
const FEED = process.env.QA_UPDATE_FEED || "https://79-76-112-176.sslip.io/downloads"

function newer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  return false
}

async function latest() {
  const res = await fetch(`${FEED}/latest.json?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Update server returned ${res.status}`)
  return res.json()
}

let busy = false

async function download(url, dest, win) {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const total = Number(res.headers.get("content-length")) || 0
  const out = fs.createWriteStream(dest)
  const reader = res.body.getReader()
  let got = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    got += value.length
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once("drain", r))
    if (total && win && !win.isDestroyed()) win.setProgressBar(got / total)
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
  if (win && !win.isDestroyed()) win.setProgressBar(-1)
}

/** Checks for an update; `manual` also reports "you're up to date" and errors. */
async function check(manual = false) {
  if (busy) return
  if (!app.isPackaged && !process.env.QA_UPDATE_FEED) {
    if (manual) dialog.showMessageBox({ message: "Updates are only checked in the installed app." })
    return
  }
  busy = true
  try {
    const info = await latest()
    const current = app.getVersion()
    if (!info?.version || !newer(info.version, current)) {
      if (manual) dialog.showMessageBox({ type: "info", message: "You're on the latest version.", detail: `QA Engine ${current}` })
      return
    }
    const key = `${process.platform}-${process.arch}`
    const file = info.files?.[key] || (process.platform === "darwin" ? info.files?.["darwin-arm64"] : null)
    if (!file) {
      if (manual) dialog.showMessageBox({ message: `QA Engine ${info.version} is out, but not for this computer yet.` })
      return
    }
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Update now", "Later"],
      // Mac and Windows both restart into the new version.
      defaultId: 0,
      cancelId: 1,
      message: `A new version of QA Engine is available (${info.version}).`,
      detail: `You have ${current}.${info.notes ? `\n\nWhat's new:\n${info.notes}` : ""}`,
    })
    if (response !== 0) return

    const dest = path.join(app.getPath("downloads"), path.basename(file))
    await download(`${FEED}/${encodeURIComponent(file)}`, dest, win)

    if (process.platform === "win32") {
      // The setup closes and replaces this app.
      await shell.openPath(dest)
      setTimeout(() => app.quit(), 1500)
      return
    }
    if (await installMac(dest)) {
      fs.rmSync(dest, { force: true })
      app.relaunch()
      app.exit(0)
      return
    }
    // Couldn't replace it (e.g. the app isn't in a folder we can write to).
    await shell.openPath(dest)
    await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Quit QA Engine"],
      message: "Finish the update",
      detail:
        "The new version is open in a Finder window. Drag QA Engine onto the Applications folder and choose Replace, then open QA Engine again.",
    })
    app.quit()
  } catch (err) {
    if (manual) dialog.showMessageBox({ type: "warning", message: "Couldn't check for updates.", detail: String(err?.message || err) })
  } finally {
    busy = false
  }
}

function start() {
  setTimeout(() => check(false), 5000)
  setInterval(() => check(false), 6 * 60 * 60 * 1000)
}

module.exports = { check, start, installMac }
