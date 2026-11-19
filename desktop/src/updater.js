// Desktop app updates from our own server (no Apple/Windows signing needed).
//
// The server publishes /downloads/latest.json:
//   { "version": "0.3.0", "notes": "...", "files": { "darwin-arm64": "QA-Engine-mac-arm64.dmg", ... } }
// When it's newer than this app, the user gets "Update now": the installer is
// downloaded with a progress bar and opened (Mac: the disk image; Windows: the setup).
const fs = require("fs")
const path = require("path")
const { app, dialog, shell, BrowserWindow } = require("electron")

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

module.exports = { check, start }
