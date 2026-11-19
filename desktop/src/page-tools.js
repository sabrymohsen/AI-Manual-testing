// Things every browser has that an Electron window doesn't, for each page:
// a right-click menu (copy/paste, spelling, links, images) and Find (Cmd/Ctrl+F).
const { Menu, clipboard, ipcMain, shell } = require("electron")

function openExternal(url) {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
}

/** Right-click menu for one page. */
function attachContextMenu(contents, isAppUrl) {
  contents.on("context-menu", (_e, p) => {
    const items = []
    const sep = () => items.length && items[items.length - 1].type !== "separator" && items.push({ type: "separator" })

    // Spelling: suggestions for the word under the cursor.
    if (p.misspelledWord) {
      for (const s of (p.dictionarySuggestions || []).slice(0, 5)) {
        items.push({ label: s, click: () => contents.replaceMisspelling(s) })
      }
      if (!p.dictionarySuggestions?.length) items.push({ label: "No suggestions", enabled: false })
      items.push({
        label: "Add to dictionary",
        click: () => contents.session.addWordToSpellCheckerDictionary(p.misspelledWord),
      })
      sep()
    }

    if (p.linkURL) {
      const inApp = isAppUrl(p.linkURL)
      items.push({
        label: inApp ? "Open link in new window" : "Open link in browser",
        click: () => (inApp ? contents.executeJavaScript(`window.open(${JSON.stringify(p.linkURL)}, "_blank")`) : openExternal(p.linkURL)),
      })
      items.push({ label: "Copy link", click: () => clipboard.writeText(p.linkURL) })
      sep()
    }

    if (p.mediaType === "image" && p.srcURL) {
      items.push({ label: "Copy image", click: () => contents.copyImageAt(p.x, p.y) })
      items.push({ label: "Save image as…", click: () => contents.downloadURL(p.srcURL) })
      items.push({ label: "Copy image address", click: () => clipboard.writeText(p.srcURL) })
      sep()
    }

    const f = p.editFlags || {}
    if (p.isEditable) {
      items.push({ role: "undo", enabled: f.canUndo }, { role: "redo", enabled: f.canRedo }, { type: "separator" })
      items.push({ role: "cut", enabled: f.canCut }, { role: "copy", enabled: f.canCopy }, { role: "paste", enabled: f.canPaste })
      items.push({ role: "pasteAndMatchStyle", enabled: f.canPaste }, { role: "selectAll" })
    } else if (p.selectionText?.trim()) {
      items.push({ role: "copy" })
    }

    if (!p.isEditable && !p.linkURL && p.mediaType === "none") {
      sep()
      items.push({ label: "Back", enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() })
      items.push({ label: "Reload", click: () => contents.reload() })
    }

    while (items.length && items[items.length - 1].type === "separator") items.pop()
    if (items.length) Menu.buildFromTemplate(items).popup()
  })
}

/**
 * Find in page (Cmd/Ctrl+F). The bar is its own small view laid over the top
 * right of the window (pages/find.html), so its text box is never part of the
 * page being searched. The search runs on the window's page.
 */
const path = require("path")
const { WebContentsView } = require("electron")

const BAR = { width: 340, height: 40, margin: 12 }
const bars = new Map() // window id -> { view, target }

function placeBar(win, view) {
  const [w] = win.getContentSize()
  view.setBounds({ x: Math.max(0, w - BAR.width - BAR.margin), y: BAR.margin, width: BAR.width, height: BAR.height })
}

function barFor(sender) {
  for (const [, b] of bars) if (b.view.webContents === sender) return b
  return null
}

function closeBar(win) {
  const b = bars.get(win.id)
  if (!b) return
  bars.delete(win.id)
  if (!b.target.isDestroyed()) b.target.stopFindInPage("clearSelection")
  if (!win.isDestroyed()) {
    win.contentView.removeChildView(b.view)
    win.webContents.focus()
  }
  b.view.webContents.close()
}

/** Opens (or focuses) the find bar in a window — menu item / shortcut. */
function openFind(win) {
  if (!win || win.isDestroyed()) return
  const existing = bars.get(win.id)
  if (existing) {
    existing.view.webContents.focus()
    existing.view.webContents.send("desktop:find-focus")
    return
  }
  const view = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  })
  view.setBackgroundColor("#00000000")
  const target = win.webContents
  bars.set(win.id, { view, target })
  win.contentView.addChildView(view)
  placeBar(win, view)
  const onResize = () => bars.has(win.id) && placeBar(win, view)
  win.on("resize", onResize)
  // A new page in the window ends the search.
  const onNavigate = () => closeBar(win)
  target.once("did-start-navigation", onNavigate)
  const onFound = (_e, r) => {
    if (r.finalUpdate && !view.webContents.isDestroyed()) {
      view.webContents.send("desktop:find-result", { active: r.activeMatchOrdinal, total: r.matches })
    }
  }
  target.on("found-in-page", onFound)
  view.webContents.once("destroyed", () => {
    if (!win.isDestroyed()) win.off("resize", onResize)
    if (!target.isDestroyed()) {
      target.off("did-start-navigation", onNavigate)
      target.off("found-in-page", onFound)
    }
  })
  view.webContents.loadFile(path.join(__dirname, "pages", "find.html"))
  view.webContents.once("did-finish-load", () => view.webContents.focus())
}

function registerFind() {
  ipcMain.on("desktop:find", (event, { text, forward = true, findNext = false }) => {
    const b = barFor(event.sender)
    if (!b || b.target.isDestroyed()) return
    if (!text) {
      b.target.stopFindInPage("clearSelection")
      event.sender.send("desktop:find-result", { active: 0, total: 0 })
      return
    }
    b.target.findInPage(String(text).slice(0, 500), { forward, findNext })
  })
  ipcMain.on("desktop:find-close", (event) => {
    for (const [id, b] of bars) {
      if (b.view.webContents === event.sender) {
        const win = require("electron").BrowserWindow.fromId(id)
        if (win) closeBar(win)
      }
    }
  })
}

module.exports = { attachContextMenu, registerFind, openFind, closeFind: closeBar }
