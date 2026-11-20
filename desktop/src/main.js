// QA Engine desktop — main process.
//
// The window is a dedicated browser for the hosted QA Engine server (the online
// server by default; switchable to this computer or any custom URL from the Server menu).
// Everything the web app does keeps working unchanged; this layer adds the
// native parts: its own window and dock/taskbar icon, a remembered login,
// links that leave the app opening in the system browser, an offline screen,
// and auto-update.
const path = require("path")
const { app, BrowserWindow, Menu, shell, ipcMain, session, dialog, nativeTheme } = require("electron")
const settings = require("./settings")
const localStack = require("./local-stack")
const localAi = require("./local-ai")
const updater = require("./updater")
const pageTools = require("./page-tools")

const PARTITION = "persist:qa-engine" // keeps cookies (the login) across restarts

// ── startup log ────────────────────────────────────────────────────────────
// Anything that goes wrong at startup is written here (Help → Open Log Folder),
// so "it doesn't open" on someone's PC can be diagnosed.
const fs = require("fs")
function logFile() {
  try {
    const dir = path.join(app.getPath("userData"), "logs")
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, "main.log")
  } catch {
    return null
  }
}
function log(...parts) {
  const f = logFile()
  if (!f) return
  try {
    // Keep it small: start over past 1 MB.
    if (fs.existsSync(f) && fs.statSync(f).size > 1_000_000) fs.writeFileSync(f, "")
    fs.appendFileSync(f, `[${new Date().toISOString()}] ${parts.map((p) => (p instanceof Error ? p.stack : String(p))).join(" ")}\n`)
  } catch {}
}
process.on("uncaughtException", (err) => {
  log("uncaughtException", err)
  try {
    dialog.showErrorBox("QA Engine ran into a problem", `${err?.message || err}\n\nDetails are in the log (Help → Open Log Folder).`)
  } catch {}
})
process.on("unhandledRejection", (err) => log("unhandledRejection", err))
app.on("child-process-gone", (_e, d) => log("child process gone", d.type, d.reason, d.exitCode))
const isMac = process.platform === "darwin"

let mainWindow = null
let serverWindow = null

// ── single instance ────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}
app.on("second-instance", () => {
  log("second launch: bringing the window forward")
  if (!mainWindow) return createMainWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

// ── helpers ────────────────────────────────────────────────────────────────
function appOrigin() {
  return settings.serverUrl()
}

function isAppUrl(url) {
  try {
    return new URL(url).origin === appOrigin()
  } catch {
    return false
  }
}

function openExternal(url) {
  // Only hand real web/mail links to the OS — never file:// or custom schemes.
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
}

function isLocalMode() {
  return settings.load().server === "local" && !process.env.QA_ENGINE_URL
}

function loadApp(win = mainWindow) {
  if (!win) return
  if (isLocalMode() && win === mainWindow) return startLocal()
  log("loading", appOrigin())
  // A server that never answers (blocked network) would leave a blank window
  // forever; after 25s show the offline page with Retry.
  const timer = setTimeout(() => {
    if (!win.isDestroyed() && win.webContents.isLoadingMainFrame()) {
      log("server did not answer in 25s")
      win.webContents.stop()
      showOffline(win, "The server didn't answer. Check your internet connection or company firewall.")
    }
  }, 25000)
  win.webContents.once("did-finish-load", () => clearTimeout(timer))
  win.loadURL(appOrigin()).catch(() => {
    /* did-fail-load shows the offline page */
  })
}

// ── "This computer" mode ───────────────────────────────────────────────────
const stackLog = []
let localStarting = false

function onStackLog(line) {
  stackLog.push(line)
  console.log(line)
  if (stackLog.length > 2000) stackLog.splice(0, stackLog.length - 2000)
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:stack-log", line)
}

function showStarting(error) {
  mainWindow.loadFile(path.join(__dirname, "pages", "starting.html"), {
    query: error ? { error } : {},
  })
}

async function startLocal() {
  if (localStarting) return
  localStarting = true
  showStarting()
  try {
    let repo = settings.load().repoPath
    if (!repo || !localStack.isRepo(repo)) {
      repo = localStack.guessRepo()
      if (repo) settings.save({ repoPath: repo })
    }
    await localStack.start(repo, onStackLog)
    if (mainWindow) mainWindow.loadURL(appOrigin()).catch(() => {})
  } catch (err) {
    onStackLog(`✗ ${err.message}`)
    if (mainWindow) showStarting(err.message)
  } finally {
    localStarting = false
  }
}

async function chooseRepo() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Choose the AI-Manual-testing project folder",
    properties: ["openDirectory"],
    defaultPath: settings.load().repoPath || undefined,
  })
  if (canceled || !filePaths[0]) return
  if (!localStack.isRepo(filePaths[0])) {
    dialog.showMessageBox(mainWindow, { type: "warning", message: "That isn't the QA Engine project folder.", detail: "Pick the folder that contains package.json for ai-manual-qa-tester." })
    return
  }
  settings.save({ repoPath: filePaths[0], server: "local" })
  buildMenu()
  loadApp()
}

function showOffline(win, reason) {
  win.loadFile(path.join(__dirname, "pages", "offline.html"), {
    query: { server: appOrigin(), reason: reason || "" },
  })
}

// ── main window ────────────────────────────────────────────────────────────
function createMainWindow() {
  const saved = settings.load().window || {}
  mainWindow = new BrowserWindow({
    width: saved.width || 1440,
    height: saved.height || 900,
    x: saved.x,
    y: saved.y,
    minWidth: 960,
    minHeight: 640,
    title: "QA Engine",
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0f17" : "#ffffff",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      partition: PARTITION,
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })

  if (saved.maximized) mainWindow.maximize()
  mainWindow.once("ready-to-show", () => mainWindow.show())
  // If the first page is slow (or the network silently drops the connection),
  // ready-to-show never fires and the app sat invisible — show it anyway.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      log("window not ready after 4s; showing it anyway")
      mainWindow.show()
    }
  }, 4000)

  const wc = mainWindow.webContents

  // window.open / target=_blank: app pages open in a new app window, everything
  // else (docs, Jira, OpenProject, GitHub…) opens in the system browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 820,
          webPreferences: {
            partition: PARTITION,
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox: true,
          },
        },
      }
    }
    // Blob/data downloads (exports, evidence) stay in-app so the save dialog shows.
    if (/^(blob|data):/i.test(url)) return { action: "allow" }
    openExternal(url)
    return { action: "deny" }
  })

  // Windows opened from the app follow the same rules as this one.
  wc.on("did-create-window", (child) => hardenChildWindow(child))

  // A plain link to another site navigates the system browser, not this window.
  wc.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) return // our offline page
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternal(url)
    }
  })

  wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    if (isMainFrame) log("load failed", code, description, url)
    // -3 = ERR_ABORTED (a navigation replaced by another) — not a real failure.
    if (!isMainFrame || code === -3) return
    if (url && url.startsWith("file://")) return
    if (isLocalMode()) return showStarting(`The local server stopped answering (${description}).`)
    showOffline(mainWindow, description)
  })

  wc.on("render-process-gone", (_e, details) => {
    log("page process gone", details.reason, details.exitCode)
    if (details.reason !== "clean-exit") showOffline(mainWindow, `The page stopped (${details.reason}).`)
  })

  // Remember size/position.
  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const maximized = mainWindow.isMaximized()
    const b = maximized ? settings.load().window : mainWindow.getBounds()
    settings.save({ window: { ...b, maximized } })
  }
  mainWindow.on("resize", debounce(persistBounds, 400))
  mainWindow.on("move", debounce(persistBounds, 400))
  mainWindow.on("close", persistBounds)
  mainWindow.on("closed", () => {
    mainWindow = null
  })

  loadApp()
}

/**
 * A second app window (link opened in a new window): outside links go to the
 * browser, its own pop-ups follow the same rules, and a lost connection shows
 * the offline page instead of a blank window.
 */
function hardenChildWindow(win) {
  const cwc = win.webContents
  cwc.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: "allow" }
    if (/^(blob|data):/i.test(url)) return { action: "allow" }
    openExternal(url)
    return { action: "deny" }
  })
  cwc.on("did-create-window", (grandchild) => hardenChildWindow(grandchild))
  cwc.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) return
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternal(url)
    }
  })
  cwc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || (url && url.startsWith("file://"))) return
    showOffline(win, description)
  })
}

function debounce(fn, ms) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

// ── session: identify the app, permissions ─────────────────────────────────
function configureSession() {
  const ses = session.fromPartition(PARTITION)

  // Lets the server tell desktop users apart (e.g. to offer "Run on my computer").
  ses.setUserAgent(`${ses.getUserAgent()} QAEngineDesktop/${app.getVersion()}`)

  // Grant what the web app uses (notifications, clipboard, mic/camera for
  // recordings, fullscreen) — only to the QA Engine origin.
  const allowed = new Set([
    "notifications",
    "clipboard-read",
    "clipboard-sanitized-write",
    "media",
    "fullscreen",
    "display-capture",
  ])
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = details.requestingUrl || wc.getURL()
    callback(allowed.has(permission) && isAppUrl(origin))
  })
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return allowed.has(permission) && isAppUrl(requestingOrigin)
  })
}

// ── server picker ──────────────────────────────────────────────────────────
function switchServer(key, customUrl) {
  const patch = { server: key }
  if (customUrl !== undefined) patch.customUrl = customUrl
  settings.save(patch)
  buildMenu()
  loadApp()
}

function openServerWindow() {
  if (serverWindow) return serverWindow.focus()
  serverWindow = new BrowserWindow({
    width: 480,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow || undefined,
    modal: !!mainWindow,
    title: "Custom server",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0f17" : "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
    },
  })
  serverWindow.setMenu(null)
  serverWindow.loadFile(path.join(__dirname, "pages", "server.html"))
  serverWindow.on("closed", () => {
    serverWindow = null
  })
}

ipcMain.handle("desktop:get-settings", () => ({
  ...settings.load(),
  serverUrl: appOrigin(),
  servers: settings.SERVERS,
}))
ipcMain.handle("desktop:set-custom-server", (_e, url) => {
  let origin
  try {
    origin = settings.normalize(String(url || "").trim())
  } catch {
    return { ok: false, error: "That isn't a valid URL." }
  }
  switchServer("custom", origin)
  if (serverWindow) serverWindow.close()
  return { ok: true, url: origin }
})
ipcMain.handle("desktop:retry", () => loadApp())
ipcMain.handle("desktop:open-server-picker", () => openServerWindow())
ipcMain.handle("desktop:choose-repo", () => chooseRepo())
ipcMain.handle("desktop:get-stack-log", () => stackLog.slice())

// Calls from the QA Engine page itself (our server's origin only).
function fromAppPage(event) {
  try {
    return isAppUrl(event.senderFrame?.url || event.sender.getURL())
  } catch {
    return false
  }
}
localAi.register(fromAppPage)
ipcMain.handle("desktop:check-update", (event) => {
  if (!fromAppPage(event)) throw new Error("Not allowed")
  return updater.check(true)
})
ipcMain.handle("desktop:version", () => app.getVersion())

// ── menu ───────────────────────────────────────────────────────────────────
function buildMenu() {
  const current = settings.load().server
  const serverItems = Object.entries(settings.SERVERS).map(([key, s]) => ({
    label: `${s.label}  —  ${new URL(s.url).host}`,
    type: "radio",
    checked: current === key && !process.env.QA_ENGINE_URL,
    click: () => switchServer(key),
  }))

  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            const w = new BrowserWindow({
              width: 1280,
              height: 820,
              webPreferences: {
                partition: PARTITION,
                preload: path.join(__dirname, "preload.js"),
                contextIsolation: true,
                sandbox: true,
              },
            })
            w.loadURL(appOrigin())
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "selectAll" },
        { type: "separator" },
        { label: "Find…", accelerator: "CmdOrCtrl+F", click: (_m, w) => pageTools.openFind(w) },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Back", accelerator: isMac ? "Cmd+[" : "Alt+Left", click: (_m, w) => w?.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: isMac ? "Cmd+]" : "Alt+Right", click: (_m, w) => w?.webContents.navigationHistory.goForward() },
        { label: "Home", accelerator: "CmdOrCtrl+Shift+H", click: () => loadApp() },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Server",
      submenu: [
        ...serverItems,
        {
          label: current === "custom" && settings.load().customUrl ? `Custom  —  ${new URL(settings.load().customUrl).host}` : "Custom…",
          type: "radio",
          checked: current === "custom" && !process.env.QA_ENGINE_URL,
          click: () => openServerWindow(),
        },
        { type: "separator" },
        { label: "Change custom server…", click: () => openServerWindow() },
        { label: "Choose project folder…", click: () => chooseRepo() },
        { label: "Open in Browser", click: () => shell.openExternal(mainWindow?.webContents.getURL() || appOrigin()) },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "About QA Engine",
          click: () =>
            dialog.showMessageBox({
              type: "info",
              title: "QA Engine",
              message: `QA Engine ${app.getVersion()}`,
              detail: `Server: ${appOrigin()}\nElectron ${process.versions.electron} · Chrome ${process.versions.chrome}`,
            }),
        },
        { label: "Check for Updates…", click: () => checkForUpdates(true) },
        { label: "Open Log Folder", click: () => shell.openPath(path.join(app.getPath("userData"), "logs")) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── updates: see updater.js (our own server, works without code signing) ──
function checkForUpdates(manual = false) {
  return updater.check(manual)
}

// ── lifecycle ──────────────────────────────────────────────────────────────
app.setName("QA Engine")
if (process.platform === "win32") app.setAppUserModelId("app.qaengine.desktop") // native notifications

app.whenReady().then(() => {
  log(`QA Engine ${app.getVersion()} starting on ${process.platform} ${process.arch} (${require("os").release()}), Electron ${process.versions.electron}`)
  configureSession()
  buildMenu()
  createMainWindow()
  updater.start()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// Stop the local services this app started (ones you started yourself keep running).
app.on("before-quit", () => localStack.stop())

app.on("window-all-closed", () => {
  if (!isMac) app.quit()
})

// Harden every web contents: no <webview>, no navigation to file:// from remote pages.
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault())
  // Right-click menu and find results on every page, in every window.
  pageTools.attachContextMenu(contents, isAppUrl)
})
pageTools.registerFind()
