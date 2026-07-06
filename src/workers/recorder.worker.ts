import http from "node:http"
import { URL } from "node:url"
import { randomUUID } from "node:crypto"
import { WebSocketServer, WebSocket } from "ws"
import type { Page, CDPSession } from "playwright"
import { saveFile } from "@/lib/storage"
import { prisma } from "@/lib/db"
import {
  startSession,
  pauseSession,
  resumeSession,
  finishSession,
  cancelSession,
  startNewRecordedTestCase,
  saveCurrentRecordedTestCase,
  validateStepLocator,
  validateRecordedFlow,
  getSessionStats,
  getSessionConnectionStatus,
  activeSessions,
} from "@/lib/recording/session-manager"
import {
  startPickerSession,
  getPickerSessionState,
  ackPickerCommand,
  pausePickerSession,
  clearPickerElements,
  removePickerElement,
  stopPickerSession,
  createBugFromPickerElement,
  activePickerSessions,
} from "@/lib/recording/picker-session-manager"

const PORT = Number(process.env.RECORDER_WORKER_PORT) || 3847

// Protocol version, checked by the Next.js side on every request. Bump this
// (together with REQUIRED_WORKER_VERSION in worker-client.ts) whenever the
// worker's HTTP/WS contract changes, so a stale worker process fails loudly
// instead of silently missing endpoints.
export const WORKER_VERSION = "2.1.0"

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return {}
  }
}

async function checkPlaywrightInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright")
    return !!chromium
  } catch {
    return false
  }
}

// ── Live-view input: shared by the REST fallback and the WebSocket stream ──
// Playwright dispatches these as trusted input events, so the injected
// recorder captures them as steps exactly like direct interaction.
async function applyInput(
  page: Page,
  body: any
): Promise<{ success: boolean; error?: string; unknown?: boolean }> {
  try {
    switch (body.type) {
      case "mousedown":
        await page.mouse.move(body.x || 0, body.y || 0)
        await page.mouse.down({ button: body.button || "left" })
        break
      case "mouseup":
        await page.mouse.move(body.x || 0, body.y || 0)
        await page.mouse.up({ button: body.button || "left" })
        break
      case "mousemove":
        await page.mouse.move(body.x || 0, body.y || 0)
        break
      case "wheel":
        await page.mouse.move(body.x || 0, body.y || 0)
        await page.mouse.wheel(body.deltaX || 0, body.deltaY || 0)
        break
      case "key":
        await page.keyboard.press(body.key)
        break
      case "type":
        await page.keyboard.insertText(body.text || "")
        break
      case "resize": {
        // Live view fit-to-container: the client sends its visible area so the
        // remote viewport matches it exactly (no letterboxing). Clamped to
        // sane bounds; the CDP screencast follows the new size per-frame.
        const w = Math.max(320, Math.min(1920, Math.round(body.width || 0)))
        const h = Math.max(320, Math.min(1920, Math.round(body.height || 0)))
        if (w > 0 && h > 0) {
          const current = page.viewportSize()
          if (!current || current.width !== w || current.height !== h) {
            await page.setViewportSize({ width: w, height: h })
          }
        }
        break
      }
      case "back":
        await page.goBack({ timeout: 15000 }).catch(() => null)
        break
      case "forward":
        await page.goForward({ timeout: 15000 }).catch(() => null)
        break
      case "reload":
        await page.reload({ timeout: 30000 }).catch(() => null)
        break
      case "goto":
        if (body.url) {
          await page
            .goto(body.url, { waitUntil: "domcontentloaded", timeout: 30000 })
            .catch(() => null)
        }
        break
      default:
        return { success: false, unknown: true }
    }
    return { success: true }
  } catch (err: any) {
    // Invalid key names / detached frames should not kill the session
    return { success: false, error: err?.message }
  }
}

// ── Live-view streaming: CDP screencast → WebSocket viewers ────────────────
// One screencast per session, broadcast to every connected viewer. Starts on
// the first viewer, stops when the last one disconnects. Chromium-only; the
// client falls back to REST frame polling for Firefox/WebKit.

const streamTokens = new Map<string, { sessionId: string; expires: number }>()

function mintStreamToken(sessionId: string): string {
  // Sweep expired tokens opportunistically
  const now = Date.now()
  for (const [t, entry] of streamTokens) {
    if (entry.expires < now) streamTokens.delete(t)
  }
  const token = randomUUID()
  streamTokens.set(token, { sessionId, expires: now + 60_000 })
  return token
}

function consumeStreamToken(token: string, sessionId: string): boolean {
  const entry = streamTokens.get(token)
  streamTokens.delete(token) // single use
  return !!entry && entry.sessionId === sessionId && entry.expires > Date.now()
}

interface SessionStream {
  cdp: CDPSession | null
  viewers: Set<WebSocket>
  starting: Promise<void> | null
  // Remote devicePixelRatio — frames arrive at CSS px × dsf; the client needs
  // it to map mouse coordinates back to CSS pixels.
  dsf: number
}

const sessionStreams = new Map<string, SessionStream>()

function broadcastJson(stream: SessionStream, payload: unknown) {
  const msg = JSON.stringify(payload)
  for (const ws of stream.viewers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  }
}

function teardownStream(sessionId: string) {
  const stream = sessionStreams.get(sessionId)
  if (!stream) return
  sessionStreams.delete(sessionId)
  const cdp = stream.cdp
  stream.cdp = null
  if (cdp) {
    cdp.send("Page.stopScreencast").catch(() => {})
    cdp.detach().catch(() => {})
  }
  for (const ws of stream.viewers) {
    try { ws.close() } catch {}
  }
  stream.viewers.clear()
}

async function ensureScreencast(sessionId: string, page: Page): Promise<void> {
  const stream = sessionStreams.get(sessionId)
  if (!stream) return
  if (stream.cdp) return
  if (stream.starting) return stream.starting

  stream.starting = (async () => {
    const cdp = await page.context().newCDPSession(page)
    cdp.on("Page.screencastFrame", (ev: any) => {
      const current = sessionStreams.get(sessionId)
      if (!current) return
      const buf = Buffer.from(ev.data, "base64")
      for (const ws of current.viewers) {
        // Latest-frame-wins: frames are self-contained JPEGs, so when a viewer
        // can't keep up (send buffer still holds ~2 frames), drop this frame
        // for that viewer instead of queueing lag behind the socket.
        if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < buf.length * 2) {
          ws.send(buf)
        }
      }
      cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {})
    })
    cdp.on("Page.frameNavigated", (ev: any) => {
      const current = sessionStreams.get(sessionId)
      // Only top-level navigations update the URL bar
      if (current && !ev.frame.parentId) {
        broadcastJson(current, { type: "url", url: ev.frame.url })
      }
    })
    await cdp.send("Page.enable")
    // Caps sized for 2x (retina) frames of up to ~1920 CSS px viewports.
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 70,
      maxWidth: 3840,
      maxHeight: 3840,
      everyNthFrame: 1,
    })
    stream.dsf = await page.evaluate(() => window.devicePixelRatio).catch(() => 1)
    stream.cdp = cdp
    // End the stream cleanly when the session's page goes away
    page.once("close", () => teardownStream(sessionId))
  })()

  try {
    await stream.starting
  } finally {
    stream.starting = null
  }
}

async function handleViewer(ws: WebSocket, sessionId: string) {
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) {
    ws.close()
    return
  }

  // CDP screencast is Chromium-only — tell the client to keep polling.
  if (activeSess.browserType !== "Chromium") {
    ws.send(JSON.stringify({ type: "mode", mode: "polling" }))
    ws.close()
    return
  }

  let stream = sessionStreams.get(sessionId)
  if (!stream) {
    stream = { cdp: null, viewers: new Set(), starting: null, dsf: 1 }
    sessionStreams.set(sessionId, stream)
  }
  stream.viewers.add(ws)

  try {
    await ensureScreencast(sessionId, activeSess.page)
  } catch (err) {
    console.error("[RECORDER WORKER] Screencast failed, falling back to polling:", err)
    ws.send(JSON.stringify({ type: "mode", mode: "polling" }))
    stream.viewers.delete(ws)
    ws.close()
    if (stream.viewers.size === 0) teardownStream(sessionId)
    return
  }

  ws.send(JSON.stringify({ type: "mode", mode: "streaming" }))
  ws.send(JSON.stringify({ type: "dsf", dsf: stream.dsf || 1 }))
  ws.send(JSON.stringify({ type: "url", url: activeSess.page.url() }))

  // Inputs arrive as JSON messages on the same socket (lower latency than REST)
  ws.on("message", async (data, isBinary) => {
    if (isBinary) return
    try {
      const payload = JSON.parse(data.toString())
      const sess = activeSessions.get(sessionId)
      if (sess) await applyInput(sess.page, payload)
    } catch {
      // malformed message — ignore
    }
  })

  ws.on("close", () => {
    const current = sessionStreams.get(sessionId)
    if (!current) return
    current.viewers.delete(ws)
    if (current.viewers.size === 0) teardownStream(sessionId)
  })
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "Invalid request" })
    return
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname

  try {
    if (req.method === "GET" && path === "/health") {
      const playwrightInstalled = await checkPlaywrightInstalled()
      sendJson(res, 200, {
        online: true,
        playwrightInstalled,
        activeSessionCount: activeSessions.size,
        version: WORKER_VERSION,
      })
      return
    }

    if (req.method === "GET" && path.match(/^\/sessions\/[^/]+\/connection$/)) {
      const sessionId = path.split("/")[2]
      const status = await getSessionConnectionStatus(sessionId)
      sendJson(res, 200, status)
      return
    }

    if (req.method === "GET" && path.match(/^\/sessions\/[^/]+\/stats$/)) {
      const sessionId = path.split("/")[2]
      const stats = await getSessionStats(sessionId)
      sendJson(res, 200, stats)
      return
    }

    // Live preview frame: JPEG snapshot of the controlled browser, base64,
    // never persisted to disk (polled by the workstation page).
    if (req.method === "GET" && path.match(/^\/sessions\/[^/]+\/frame$/)) {
      const sessionId = path.split("/")[2]
      const activeSess = activeSessions.get(sessionId)
      if (!activeSess) {
        sendJson(res, 404, { error: "Active session not found" })
        return
      }
      try {
        // scale "css" keeps polling frames at CSS pixels so mouse-coordinate
        // mapping stays 1:1 regardless of the context's deviceScaleFactor.
        const buffer = await activeSess.page.screenshot({ type: "jpeg", quality: 55, scale: "css" })
        sendJson(res, 200, {
          frame: `data:image/jpeg;base64,${buffer.toString("base64")}`,
          url: activeSess.page.url(),
        })
      } catch {
        // Screenshot can fail transiently mid-navigation — not an error state.
        sendJson(res, 200, { frame: null, url: null })
      }
      return
    }

    if (req.method === "POST" && path === "/sessions/start") {
      const body = await readBody(req)
      const { projectId, userId, options } = body
      if (!projectId || !userId || !options) {
        sendJson(res, 400, { error: "projectId, userId, and options are required" })
        return
      }
      const result = await startSession(projectId, userId, options)
      sendJson(res, 201, result)
      return
    }

    const sessionMatch = path.match(/^\/sessions\/([^/]+)\/(.+)$/)
    if (sessionMatch && req.method === "POST") {
      const sessionId = sessionMatch[1]
      const action = sessionMatch[2]
      const body = await readBody(req)

      switch (action) {
        case "pause":
          await pauseSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "resume":
          await resumeSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "finish":
          await finishSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "cancel":
          await cancelSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "validate-flow": {
          const result = await validateRecordedFlow(sessionId, { replay: body.replay !== false })
          sendJson(res, 200, result)
          return
        }
        case "test-case/start-new": {
          const testCase = await startNewRecordedTestCase(sessionId, body)
          sendJson(res, 200, { testCase })
          return
        }
        case "test-case/save-current": {
          const { testCaseId } = body
          if (!testCaseId) {
            sendJson(res, 400, { error: "testCaseId is required" })
            return
          }
          const saved = await saveCurrentRecordedTestCase(sessionId, testCaseId)
          sendJson(res, 200, { testCase: saved })
          return
        }
        case "screenshot": {
          const activeSess = activeSessions.get(sessionId)
          if (!activeSess) {
            sendJson(res, 400, { error: "Active session not found" })
            return
          }
          const buffer = await activeSess.page.screenshot({
            type: "png",
            fullPage: !!body.fullPage,
          })
          // Deliberately NOT persisted here: the tester can still cancel in
          // the annotation editor. Persistence happens only on explicit save
          // via POST /api/recording/[sessionId]/screenshot/annotated.
          sendJson(res, 200, {
            imageData: `data:image/png;base64,${buffer.toString("base64")}`,
            pageUrl: activeSess.page.url() || null,
            fullPage: !!body.fullPage,
          })
          return
        }
        // Embedded live view input forwarding over REST (fallback path; the
        // WebSocket stream uses the same applyInput). These dispatch trusted
        // input events, so the injected recorder captures them as steps
        // exactly like direct interaction.
        case "input": {
          const activeSess = activeSessions.get(sessionId)
          if (!activeSess) {
            sendJson(res, 400, { error: "Active session not found" })
            return
          }
          const result = await applyInput(activeSess.page, body)
          if (result.unknown) {
            sendJson(res, 400, { error: "Unknown input type" })
          } else {
            sendJson(res, 200, result)
          }
          return
        }
        // One-time token for the live-view WebSocket (ownership is verified
        // by the Next.js proxy before this is called).
        case "stream-token": {
          if (!activeSessions.has(sessionId)) {
            sendJson(res, 400, { error: "Active session not found" })
            return
          }
          sendJson(res, 200, { token: mintStreamToken(sessionId) })
          return
        }
        default:
          sendJson(res, 404, { error: "Unknown session action" })
          return
      }
    }

    const stepMatch = path.match(/^\/steps\/([^/]+)\/validate-locator$/)
    if (stepMatch && req.method === "POST") {
      const stepId = stepMatch[1]
      const result = await validateStepLocator(stepId)
      sendJson(res, 200, result)
      return
    }

    // ---- Multi-element picker ----
    if (req.method === "POST" && path === "/picker/start") {
      const body = await readBody(req)
      const { projectId, url, credentialId } = body
      if (!projectId || !url) {
        sendJson(res, 400, { error: "projectId and url are required" })
        return
      }
      const state = await startPickerSession({ projectId, url, credentialId: credentialId || null })
      sendJson(res, 201, state)
      return
    }

    const pickerElementsMatch = path.match(/^\/picker\/([^/]+)\/elements$/)
    if (pickerElementsMatch && req.method === "GET") {
      sendJson(res, 200, getPickerSessionState(pickerElementsMatch[1]))
      return
    }

    const pickerActionMatch = path.match(/^\/picker\/([^/]+)\/(.+)$/)
    if (pickerActionMatch && req.method === "POST") {
      const sessionId = pickerActionMatch[1]
      const action = pickerActionMatch[2]
      const body = await readBody(req)
      switch (action) {
        case "pause":
          sendJson(res, 200, await pausePickerSession(sessionId, true))
          return
        case "resume":
          sendJson(res, 200, await pausePickerSession(sessionId, false))
          return
        case "clear":
          sendJson(res, 200, await clearPickerElements(sessionId))
          return
        case "ack":
          sendJson(res, 200, ackPickerCommand(sessionId))
          return
        case "remove-element":
          sendJson(res, 200, removePickerElement(sessionId, body.elementId))
          return
        case "stop":
          sendJson(res, 200, await stopPickerSession(sessionId))
          return
        case "bug": {
          const bug = await createBugFromPickerElement(sessionId, body.elementId || null, body)
          sendJson(res, 200, { bug })
          return
        }
        default:
          sendJson(res, 404, { error: "Unknown picker action" })
          return
      }
    }

    sendJson(res, 404, { error: "Not found" })
  } catch (err: any) {
    console.error("[RECORDER WORKER]", err)
    sendJson(res, 500, {
      error: err.message || "Internal recorder worker error",
      code: err.code || "INTERNAL_ERROR",
      details: err.stack,
    })
  }
})

// WebSocket upgrade: ws://127.0.0.1:PORT/sessions/:id/stream?token=<one-time>
const wss = new WebSocketServer({ noServer: true })

server.on("upgrade", (req, socket, head) => {
  try {
    const url = new URL(req.url || "", `http://127.0.0.1:${PORT}`)
    const match = url.pathname.match(/^\/sessions\/([^/]+)\/stream$/)
    const token = url.searchParams.get("token") || ""
    if (!match || !consumeStreamToken(token, match[1])) {
      socket.destroy()
      return
    }
    const sessionId = match[1]
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleViewer(ws, sessionId).catch(() => ws.close())
    })
  } catch {
    socket.destroy()
  }
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[RECORDER WORKER] Listening on http://127.0.0.1:${PORT}`)
})

process.on("SIGINT", async () => {
  console.log("[RECORDER WORKER] Shutting down, closing active browsers...")
  for (const sessionId of Array.from(sessionStreams.keys())) {
    teardownStream(sessionId)
  }
  for (const [sessionId, sess] of activeSessions.entries()) {
    try {
      await sess.browser.close()
    } catch {
      // ignore
    }
    activeSessions.delete(sessionId)
  }
  for (const [pickerId, pick] of activePickerSessions.entries()) {
    try {
      await pick.browser.close()
    } catch {
      // ignore
    }
    activePickerSessions.delete(pickerId)
  }
  server.close()
  process.exit(0)
})
