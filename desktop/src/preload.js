// Bridge between pages and the desktop shell. Runs sandboxed with context isolation.
const { contextBridge, ipcRenderer } = require("electron")

// Every page (including the hosted web app) can tell it is inside the desktop app.
const info = {
  isDesktop: true,
  platform: process.platform,
}

// Only the app's own bundled pages (offline screen, server picker) may change
// settings — a remote page must never be able to point the app at another server.
const isLocalPage = window.location.protocol === "file:"

contextBridge.exposeInMainWorld(
  "qaDesktop",
  isLocalPage
    ? {
        ...info,
        getSettings: () => ipcRenderer.invoke("desktop:get-settings"),
        setCustomServer: (url) => ipcRenderer.invoke("desktop:set-custom-server", url),
        retry: () => ipcRenderer.invoke("desktop:retry"),
        openServerPicker: () => ipcRenderer.invoke("desktop:open-server-picker"),
        chooseRepo: () => ipcRenderer.invoke("desktop:choose-repo"),
        onStackLog: (cb) => ipcRenderer.on("desktop:stack-log", (_e, line) => cb(line)),
        getStackLog: () => ipcRenderer.invoke("desktop:get-stack-log"),
      }
    : info
)
