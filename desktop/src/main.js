// QA Engine desktop — main process.
//
// The window is a dedicated browser for the hosted QA Engine server (production
// by default; switchable to staging or any custom URL from the Server menu).
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

const PARTITION = "persist:qa-engine" // keeps cookies (the login) across restarts
const isMac = process.platform === "darwin"

let mainWindow = null
let serverWindow = null

// ── single instance ────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}
app.on("second-instance", () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
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

  // A plain link to another site navigates the system browser, not this window.
  wc.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) return // our offline page
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternal(url)
    }
  })

  wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    // -3 = ERR_ABORTED (a navigation replaced by another) — not a real failure.
    if (!isMainFrame || code === -3) return
    if (url && url.startsWith("file://")) return
    if (isLocalMode()) return showStarting(`The local server stopped answering (${description}).`)
    showOffline(mainWindow, description)
  })

  wc.on("render-process-gone", (_e, details) => {
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
    { role: "editMenu" },
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
})
