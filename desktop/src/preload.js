// Bridge between pages and the desktop shell. Runs sandboxed with context isolation.
const { contextBridge, ipcRenderer } = require("electron")

// Every page (including the hosted web app) can tell it is inside the desktop app.
const info = {
  isDesktop: true,
  platform: process.platform,
  version: () => ipcRenderer.invoke("desktop:version"),
  // Desktop app update: shows "Update now" when a newer version is out.
  checkForUpdate: () => ipcRenderer.invoke("desktop:check-update"),
  // AI on this computer (Ollama). The main process only answers our server's pages.
  ai: {
    status: () => ipcRenderer.invoke("desktop:ai-status"),
    chat: (body) => ipcRenderer.invoke("desktop:ai-chat", body),
    pull: (model) => ipcRenderer.invoke("desktop:ai-pull", model),
    openDownload: () => ipcRenderer.invoke("desktop:ai-download"),
    onPullProgress: (cb) => {
      const h = (_e, p) => cb(p)
      ipcRenderer.on("desktop:ai-pull-progress", h)
      return () => ipcRenderer.removeListener("desktop:ai-pull-progress", h)
    },
  },
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
