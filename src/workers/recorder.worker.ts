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
  setStepRecording,
  finishSession,
  cancelSession,
  startNewRecordedTestCase,
  saveCurrentRecordedTestCase,
  validateStepLocator,
  validateRecordedFlow,
  getSessionStats,
  getSessionConnectionStatus,
  activeSessions,
  getSessionLogs,
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

// Railway (and most PaaS) inject PORT and expect the service to listen on it;
// fall back to RECORDER_WORKER_PORT for local/self-hosted, then a default.
const PORT = Number(process.env.PORT) || Number(process.env.RECORDER_WORKER_PORT) || 3847
// Bind all interfaces in containers so the platform proxy / other services can
// reach us. Override with RECORDER_WORKER_HOST=127.0.0.1 for a local-only bind.
const HOST = process.env.RECORDER_WORKER_HOST || "0.0.0.0"
// Optional shared secret guarding the control endpoints. When set, the Next.js
// app must send it as x-recorder-secret. /health and the token-gated WS stream
// stay open. Strongly recommended whenever the worker is publicly reachable.
const RECORDER_WORKER_SECRET = process.env.RECORDER_WORKER_SECRET || ""

// Protocol version, checked by the Next.js side on every request. Bump this
// (together with REQUIRED_WORKER_VERSION in worker-client.ts) whenever the
// worker's HTTP/WS contract changes, so a stale worker process fails loudly
// instead of silently missing endpoints.
export const WORKER_VERSION = "2.2.0"

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
  body: any,
  sessionId?: string
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
      case "click":
        await page.mouse.click(body.x || 0, body.y || 0, {
          button: (body.button as any) || "left",
          clickCount: body.clickCount || 1,
        })
        break
      case "mousemove":
        await page.mouse.move(body.x || 0, body.y || 0)
        break
      case "wheel":
        await page.mouse.move(body.x || 0, body.y || 0)
        await page.mouse.wheel(body.deltaX || 0, body.deltaY || 0)
        break
      case "key":
      case "keydown": {
        const key = String(body.key || "")
        if (key) {
          if (key.length === 1 && !body.ctrlKey && !body.metaKey) {
            await page.keyboard.insertText(key).catch(() => null)
          } else {
            await page.keyboard.press(key).catch(() => null)
          }
        }
        break
      }
      case "keyup":
        break
      case "type":
        if (body.text) {
          await page.keyboard.insertText(String(body.text)).catch(() => null)
        }
        break
      case "resize": {
        // Live view fit-to-container + browser-style zoom: the client sends its
        // visible area divided by the zoom factor, so the remote viewport
        // reflows to match (no letterboxing). Wider bounds than the raw
        // container allow zoom-in (smaller viewport) and zoom-out (larger).
        // The CDP screencast follows the new size per-frame.
        const w = Math.max(240, Math.min(2560, Math.round(body.width || 0)))
        const h = Math.max(240, Math.min(2560, Math.round(body.height || 0)))
        if (w > 0 && h > 0) {
          const current = page.viewportSize()
          if (!current || current.width !== w || current.height !== h) {
            await page.setViewportSize({ width: w, height: h })
            // Re-bound the screencast to the new viewport, otherwise a resize
            // leaves frames scaled for the previous one.
            if (sessionId) {
              await restreamAtViewport(sessionId, page)
              const s = sessionStreams.get(sessionId)
              if (s) broadcastJson(s, { type: "viewport", width: w, height: h })
            }
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

// Live frames are JPEG, not PNG. Frames are captured at 2x device scale (see
// session-manager's --force-device-scale-factor), so a Live QA frame is 3024x1556
// (~4.7 MP). Measured on that geometry:
//
//   encode latency  PNG ~617ms/frame  vs  JPEG q70 ~50ms   (fast laptop; worse on a shared vCPU)
//   frame size      flat UI        168 KB -> 131 KB  (1.3x)
//                   gradients     1798 KB -> 177 KB (10.2x)
//                   photographic 11413 KB -> 1576 KB (7.2x)
//
// Encode time is the dominant cost: PNG caps the stream near 2 fps no matter how
// much bandwidth exists, which is why the loop below asks for 30 FPS and never
// gets close. Size only matters on gradient/photo-heavy pages, but there PNG also
// blows past what the WAN hop to a deployed worker can carry.
// Override with RECORDER_STREAM_QUALITY (20-100) if a run needs crisper frames.
//
// Measured on a text-heavy page, 1400x800 viewport, scrolling continuously
// (the worst case — every pixel changes), frames as sent to the viewer:
//
//   3840 cap, q70 (was)   22 fps   367 KB/frame   8.3 MB/s   ~67 Mbps
//   CSS bounds, q70       22 fps   132 KB/frame   2.9 MB/s   ~23 Mbps
//   CSS bounds, q60       22 fps   109 KB/frame   2.5 MB/s   ~20 Mbps
//   CSS bounds, q60, n=2  11 fps   109 KB/frame   1.2 MB/s   ~10 Mbps
//
// 67 Mbps is far past what a WAN hop to a tester carries, so the ack pacing
// below throttled the stream and the view fell behind the browser — the lag
// testers saw while scrolling. The defaults now target ~10 Mbps.
const STREAM_QUALITY = Math.min(100, Math.max(20, Number(process.env.RECORDER_STREAM_QUALITY) || 60))

// Send every Nth captured frame. Viewers that acknowledge frames (see
// pushFrame) get flow control that drops stale frames to fit their link, so the
// full rate costs nothing on a slow connection and is smooth on a fast one.
// RECORDER_STREAM_EVERY_NTH_FRAME=2 halves the capture rate if CPU is tight.
const STREAM_EVERY_NTH_FRAME = Math.min(
  10,
  Math.max(1, Number(process.env.RECORDER_STREAM_EVERY_NTH_FRAME) || 1)
)

// Flow control. Behind a reverse proxy (Caddy on production) the worker's own
// socket buffer never fills — the proxy takes every frame at once and the
// backlog builds between the proxy and the tester, where `bufferedAmount`
// can't see it. Measured on production: a ~5 Mbps link to the tester vs ~10
// Mbps of frames while scrolling, so the view fell seconds behind. Viewers now
// acknowledge each frame they finish drawing; at most FRAMES_IN_FLIGHT are
// unacknowledged per viewer and only the NEWEST waiting frame is kept, so
// latency stays at about one frame whatever the link speed.
const FRAMES_IN_FLIGHT = 2
// A viewer that stops acknowledging (tab frozen, ack lost) is not starved forever.
const ACK_TIMEOUT_MS = 1500

// When the page stops changing, send one frame at full device resolution, so
// text is crisp while the tester reads. Motion frames stay small for speed;
// the sharp frame replaces the last blurry one. WebP: about half the bytes of
// a JPEG of the same quality (measured at 2x: login page 30 KB vs 80 KB, a
// dense table 285 KB vs 532 KB) for ~170 ms more encoding, which a still
// frame can afford.
const STILL_DELAY_MS = 250
const STILL_QUALITY = Math.min(100, Math.max(40, Number(process.env.RECORDER_STILL_QUALITY) || 80))

// Sessions launch with --force-device-scale-factor=2, so a 1400x800 viewport
// produces 2800x1600 frames — roughly 4x the pixels and 3-4x the bytes of what
// the live view can actually display, on a WAN hop to the tester. Capping the
// screencast at the viewport's CSS size streams 1 device-independent pixel per
// displayed pixel: same apparent sharpness, a fraction of the bandwidth and of
// the JPEG encode cost. Retina is kept where it's actually consumed — evidence
// screenshots still capture at `scale: "device"`.
// RECORDER_STREAM_MAX_WIDTH (480-3840) raises or lowers the ceiling.
const STREAM_MAX_EDGE = Math.min(
  3840,
  Math.max(480, Number(process.env.RECORDER_STREAM_MAX_WIDTH) || 1600)
)

/**
 * Stream quality profiles. "fast" is the WAN-tuned default described above;
 * "sharp" sends device-resolution frames (2x on Retina) at high JPEG quality
 * and full frame rate — right when the worker runs on the tester's own machine
 * (desktop app) or on a fast link. The viewer can switch per session.
 */
type StreamProfileName = "sharp" | "balanced" | "fast"
interface StreamProfile { quality: number; everyNthFrame: number; deviceScale: boolean; maxEdge: number }
const STREAM_PROFILES: Record<StreamProfileName, StreamProfile> = {
  sharp: { quality: 90, everyNthFrame: 1, deviceScale: true, maxEdge: 3840 },
  balanced: { quality: 75, everyNthFrame: 1, deviceScale: false, maxEdge: 2400 },
  fast: { quality: STREAM_QUALITY, everyNthFrame: STREAM_EVERY_NTH_FRAME, deviceScale: false, maxEdge: STREAM_MAX_EDGE },
}
function isProfileName(v: unknown): v is StreamProfileName {
  return v === "sharp" || v === "balanced" || v === "fast"
}
const DEFAULT_STREAM_PROFILE: StreamProfileName = isProfileName(process.env.RECORDER_STREAM_PROFILE)
  ? process.env.RECORDER_STREAM_PROFILE
  : "fast"

function streamParams(page: Page, stream: { profile: StreamProfileName; dsf: number } | undefined) {
  const prof = STREAM_PROFILES[stream?.profile || DEFAULT_STREAM_PROFILE]
  return {
    format: "jpeg" as const,
    quality: prof.quality,
    everyNthFrame: prof.everyNthFrame,
    ...screencastBounds(page, prof.deviceScale ? stream?.dsf || 1 : 1, prof.maxEdge),
  }
}

/**
 * Screencast bounds for a page: the viewport's CSS size (times the device
 * scale for the sharp profile), never above the configured ceiling. CDP scales frames to fit these bounds and preserves the
 * aspect ratio, so the client's coordinate mapping (which scales by the
 * displayed rect) stays exact at any bound.
 */
function screencastBounds(page: Page, dsf = 1, maxEdge = STREAM_MAX_EDGE): { maxWidth: number; maxHeight: number } {
  const vp = page.viewportSize()
  const w = (vp?.width || maxEdge) * dsf
  const h = (vp?.height || maxEdge) * dsf
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  return {
    maxWidth: Math.max(240, Math.round(w * scale)),
    maxHeight: Math.max(240, Math.round(h * scale)),
  }
}

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
  timer?: any
  viewers: Set<WebSocket>
  starting: Promise<void> | null
  // Remote devicePixelRatio — frames arrive at CSS px × dsf; the client needs
  // it to map mouse coordinates back to CSS pixels.
  dsf: number
  profile: StreamProfileName
  /** Per-viewer flow control, only for viewers that said they acknowledge frames. */
  flow?: Map<WebSocket, ViewerFlow>
  stillTimer?: ReturnType<typeof setTimeout> | null
  /** Bumped by every motion frame; a sharp capture that started earlier is stale. */
  frameSeq?: number
  /** Last screencast frame (base64), to skip byte-identical repeats. */
  lastCast?: string
}

interface ViewerFlow {
  inFlight: number
  waiting: Buffer | null
  lastSentAt: number
}

const sessionStreams = new Map<string, SessionStream>()

function broadcastJson(stream: SessionStream, payload: unknown) {
  const msg = JSON.stringify(payload)
  for (const ws of stream.viewers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  }
}

/**
 * Send a frame to every viewer. Acknowledging viewers get at most
 * FRAMES_IN_FLIGHT unacknowledged frames; beyond that the frame waits, and a
 * newer frame replaces it (stale frames are never queued). Older viewers that
 * don't acknowledge keep the previous socket-buffer check.
 */
function pushFrame(stream: SessionStream, buf: Buffer) {
  const now = Date.now()
  for (const ws of stream.viewers) {
    if (ws.readyState !== WebSocket.OPEN) continue
    const flow = stream.flow?.get(ws)
    if (!flow) {
      if (ws.bufferedAmount < buf.length * 2) ws.send(buf)
      continue
    }
    if (flow.inFlight >= FRAMES_IN_FLIGHT && now - flow.lastSentAt > ACK_TIMEOUT_MS) flow.inFlight = 0
    if (flow.inFlight < FRAMES_IN_FLIGHT) {
      flow.inFlight++
      flow.lastSentAt = now
      flow.waiting = null
      ws.send(buf)
    } else {
      flow.waiting = buf
    }
  }
}

/** A viewer finished drawing a frame: send the newest waiting one, if any. */
function onFrameAck(stream: SessionStream, ws: WebSocket) {
  const flow = stream.flow?.get(ws)
  if (!flow) return
  flow.inFlight = Math.max(0, flow.inFlight - 1)
  if (flow.waiting && ws.readyState === WebSocket.OPEN) {
    const buf = flow.waiting
    flow.waiting = null
    flow.inFlight++
    flow.lastSentAt = Date.now()
    ws.send(buf)
  }
}

/**
 * After STILL_DELAY_MS without a new frame, capture one at full device
 * resolution and high quality. Skipped for the "sharp" profile, whose motion
 * frames are already full quality.
 */
function armStillFrame(sessionId: string, stream: SessionStream, page: Page, force = false) {
  if (stream.stillTimer) clearTimeout(stream.stillTimer)
  stream.stillTimer = null
  if (stream.profile === "sharp" && !force) return
  const seq = (stream.frameSeq = (stream.frameSeq || 0) + 1)
  stream.stillTimer = setTimeout(async () => {
    stream.stillTimer = null
    const cur = sessionStreams.get(sessionId)
    if (cur !== stream || !stream.cdp || stream.viewers.size === 0) return
    try {
      const shot: any = await stream.cdp.send("Page.captureScreenshot", {
        format: "webp",
        quality: STILL_QUALITY,
        // Device pixels (2x): crisp text on Retina screens.
        captureBeyondViewport: false,
        optimizeForSpeed: true,
      } as any)
      // The page moved while we captured: the motion frame is newer, keep it.
      if (stream.frameSeq !== seq || sessionStreams.get(sessionId) !== stream) return
      pushFrame(stream, Buffer.from(shot.data, "base64"))
    } catch {
      // navigating or closing — the next motion frame re-arms
    }
  }, force ? 0 : STILL_DELAY_MS)
}

function teardownStream(sessionId: string) {
  const stream = sessionStreams.get(sessionId)
  if (!stream) return
  sessionStreams.delete(sessionId)
  if (stream.stillTimer) clearTimeout(stream.stillTimer)
  stream.stillTimer = null
  if (stream.timer) {
    clearInterval(stream.timer)
    stream.timer = null
  }
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

async function ensureGenericScreencast(sessionId: string, page: Page): Promise<void> {
  let stream = sessionStreams.get(sessionId)
  if (!stream) {
    stream = { cdp: null, viewers: new Set(), starting: null, dsf: 1, profile: DEFAULT_STREAM_PROFILE }
    sessionStreams.set(sessionId, stream)
  }
  if (stream.cdp || stream.timer || stream.starting) {
    if (stream.starting) await stream.starting
    return
  }

  stream.starting = (async () => {
    stream!.dsf = await page.evaluate(() => window.devicePixelRatio).catch(() => 1)

    let isRunning = true
    let isCapturing = false

    const timer = setInterval(async () => {
      if (!isRunning || isCapturing) return
      const currentStream = sessionStreams.get(sessionId)
      if (!currentStream || currentStream.viewers.size === 0) {
        clearInterval(timer)
        return
      }
      isCapturing = true
      try {
        const prof = STREAM_PROFILES[currentStream.profile || DEFAULT_STREAM_PROFILE]
        const buf = await page.screenshot({
          type: "jpeg",
          quality: prof.quality,
          // CSS scale keeps WAN frames small; the sharp profile sends device
          // pixels so text stays crisp on Retina screens. Clicks map by the
          // viewport size, so either works.
          scale: prof.deviceScale ? "device" : "css",
        })
        pushFrame(currentStream, buf)
      } catch {
        // page closed or navigating
      } finally {
        isCapturing = false
      }
    }, 33) // ~30 FPS loop

    stream!.timer = timer

    page.once("close", () => {
      isRunning = false
      clearInterval(timer)
      teardownStream(sessionId)
    })
  })()

  try {
    await stream.starting
  } finally {
    stream.starting = null
  }
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
      // Chrome repeats the last frame unchanged (e.g. right after the sharp
      // capture below). Re-sending it would replace the sharp frame with a
      // blurry copy and restart the cycle, so identical frames are skipped.
      if (ev.data === current.lastCast) {
        cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {})
        return
      }
      current.lastCast = ev.data
      const buf = Buffer.from(ev.data, "base64")
      pushFrame(current, buf)
      armStillFrame(sessionId, current, page)
      const deadline = Date.now() + 400
      const ackWhenDrained = () => {
        const cur = sessionStreams.get(sessionId)
        if (!cur || (cur.cdp && cur.cdp !== cdp)) return
        // Gate on the *slowest* viewer. Taking the min acked as soon as the
        // best-connected client drained, so a slow viewer never applied any
        // backpressure and fell further behind with every frame.
        const buffered = Math.max(
          ...[...cur.viewers]
            .filter((v) => v.readyState === WebSocket.OPEN)
            .map((v) => v.bufferedAmount),
          0
        )
        if (buffered > buf.length && Date.now() < deadline) {
          setTimeout(ackWhenDrained, 15)
          return
        }
        cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {})
      }
      ackWhenDrained()
    })
    cdp.on("Page.frameNavigated", (ev: any) => {
      const current = sessionStreams.get(sessionId)
      if (current && !ev.frame.parentId) {
        broadcastJson(current, { type: "url", url: ev.frame.url })
      }
    })
    await cdp.send("Page.enable")
    stream.dsf = await page.evaluate(() => window.devicePixelRatio).catch(() => 1)
    // JPEG (CDP ignores `quality` for png). Bounds, quality and frame rate come
    // from the stream's profile and are re-issued on resize or profile change.
    await cdp.send("Page.startScreencast", streamParams(page, stream))
    stream.cdp = cdp
    page.once("close", () => teardownStream(sessionId))
  })()

  try {
    await stream.starting
  } finally {
    stream.starting = null
  }
}

/**
 * Re-issue the screencast with bounds for the current viewport. CDP treats a
 * second startScreencast as a parameter update, so this needs no stop/start
 * (which would blank the viewer). No-op when the session isn't streaming.
 */
async function restreamAtViewport(sessionId: string, page: Page): Promise<void> {
  const stream = sessionStreams.get(sessionId)
  if (!stream?.cdp) return
  await stream.cdp
    .send("Page.startScreencast", streamParams(page, stream))
    .catch(() => {
      // Session tearing down mid-resize — the next viewer restarts it.
    })
}

async function handleViewer(ws: WebSocket, sessionId: string) {
  const activeSess = activeSessions.get(sessionId)
  if (!activeSess) {
    ws.close()
    return
  }

  let stream = sessionStreams.get(sessionId)
  if (!stream) {
    stream = { cdp: null, viewers: new Set(), starting: null, dsf: 1, profile: DEFAULT_STREAM_PROFILE }
    sessionStreams.set(sessionId, stream)
  }
  stream.viewers.add(ws)

  // Inputs run one at a time, in order. A Playwright wheel step takes ~70 ms
  // but the page sends one per animation frame, so they used to pile up and
  // the page kept scrolling for seconds after the tester stopped. While a step
  // runs, consecutive wheel steps merge (deltas add up) and consecutive mouse
  // moves keep only the latest position; clicks and keys are never merged or
  // reordered.
  const inputQueue: any[] = []
  let inputBusy = false
  const queueInput = (payload: any) => {
    const last = inputQueue[inputQueue.length - 1]
    if (last && payload?.type === "wheel" && last.type === "wheel") {
      last.deltaX = (last.deltaX || 0) + (payload.deltaX || 0)
      last.deltaY = (last.deltaY || 0) + (payload.deltaY || 0)
      last.x = payload.x
      last.y = payload.y
    } else if (last && payload?.type === "mousemove" && last.type === "mousemove") {
      inputQueue[inputQueue.length - 1] = payload
    } else {
      inputQueue.push({ ...payload })
    }
    if (inputBusy) return
    inputBusy = true
    void (async () => {
      try {
        while (inputQueue.length) {
          const next = inputQueue.shift()
          const sess = activeSessions.get(sessionId)
          if (!sess) break
          await applyInput(sess.page, next, sessionId).catch(() => null)
        }
      } finally {
        inputQueue.length = 0
        inputBusy = false
      }
    })()
  }

  // Listen before the screencast starts: the client sends its hello, quality
  // and first resize as soon as the socket opens, and messages that arrive
  // with no listener are lost.
  ws.on("message", async (data, isBinary) => {
    if (isBinary) return
    try {
      const payload = JSON.parse(data.toString())
      const sess = activeSessions.get(sessionId)
      if (payload?.type === "ack") {
        const cur = sessionStreams.get(sessionId)
        if (cur) onFrameAck(cur, ws)
        return
      }
      if (payload?.type === "hello") {
        // The viewer acknowledges every frame it draws: turn on flow control.
        const cur = sessionStreams.get(sessionId)
        if (cur && payload.acks === true) {
          if (!cur.flow) cur.flow = new Map()
          cur.flow.set(ws, { inFlight: 0, waiting: null, lastSentAt: 0 })
        }
        return
      }
      if (payload?.type === "quality") {
        // Viewer picked a stream quality (Sharp / Balanced / Fast).
        const cur = sessionStreams.get(sessionId)
        if (cur && sess && isProfileName(payload.profile) && cur.profile !== payload.profile) {
          cur.profile = payload.profile
          await restreamAtViewport(sessionId, sess.page)
          broadcastJson(cur, { type: "quality", profile: cur.profile })
        }
        return
      }
      if (sess) queueInput(payload)
    } catch {
      // malformed message — ignore
    }
  })

  ws.on("close", () => {
    const current = sessionStreams.get(sessionId)
    if (!current) return
    current.viewers.delete(ws)
    current.flow?.delete(ws)
    if (current.viewers.size === 0) teardownStream(sessionId)
  })

  try {
    if (activeSess.browserType === "Chromium") {
      await ensureScreencast(sessionId, activeSess.page)
    } else {
      await ensureGenericScreencast(sessionId, activeSess.page)
    }
  } catch (err) {
    console.error("[RECORDER WORKER] Screencast failed, falling back to polling:", err)
    ws.send(JSON.stringify({ type: "mode", mode: "polling" }))
    stream.viewers.delete(ws)
    ws.close()
    if (stream.viewers.size === 0) teardownStream(sessionId)
    return
  }

  // A viewer joining a running stream (reconnect, second tab) would otherwise
  // see nothing until the page changes: send it a sharp frame now.
  if (stream.cdp) armStillFrame(sessionId, stream, activeSess.page, true)

  ws.send(JSON.stringify({ type: "mode", mode: "streaming" }))
  ws.send(JSON.stringify({ type: "dsf", dsf: stream.dsf || 1 }))
  ws.send(JSON.stringify({ type: "quality", profile: stream.profile }))
  // The remote viewport in CSS px. Frames are capped (CSS scale, or smaller
  // under RECORDER_STREAM_MAX_EDGE), so clients map clicks by this size, never
  // by the frame's pixel size.
  const vp = activeSess.page.viewportSize()
  if (vp) ws.send(JSON.stringify({ type: "viewport", width: vp.width, height: vp.height }))
  ws.send(JSON.stringify({ type: "url", url: activeSess.page.url() }))

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

    // Guard control endpoints with the shared secret when configured. /health
    // (above) and the WS stream upgrade (own one-time token) are exempt.
    if (RECORDER_WORKER_SECRET && req.headers["x-recorder-secret"] !== RECORDER_WORKER_SECRET) {
      sendJson(res, 401, { error: "Unauthorized", code: "WORKER_UNAUTHORIZED" })
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

    // Live preview frame: PNG snapshot of the controlled browser, base64,
    // never persisted to disk (polled by the workstation page).
    if (req.method === "GET" && path.match(/^\/sessions\/[^/]+\/frame$/)) {
      const sessionId = path.split("/")[2]
      const activeSess = activeSessions.get(sessionId)
      if (!activeSess) {
        sendJson(res, 404, { error: "Active session not found" })
        return
      }
      try {
        // CSS scale: polling frames are a fallback view, and the client maps
        // clicks by the displayed rect rather than by frame pixels, so device
        // pixels only cost bandwidth here.
        const buffer = await activeSess.page.screenshot({
          type: "jpeg",
          quality: STREAM_QUALITY,
          scale: "css",
        })
        sendJson(res, 200, {
          frame: `data:image/jpeg;base64,${buffer.toString("base64")}`,
          url: activeSess.page.url(),
          fileChooserOpen: !!activeSess.activeFileChooser,
        })
      } catch {
        // Screenshot can fail transiently mid-navigation — not an error state.
        sendJson(res, 200, { frame: null, url: null })
      }
      return
    }

    // Live preview file upload: receive base64 content and write to temporary path to complete file selection
    if (req.method === "POST" && path.match(/^\/sessions\/[^/]+\/upload-file$/)) {
      const sessionId = path.split("/")[2]
      const activeSess = activeSessions.get(sessionId)
      if (!activeSess) {
        sendJson(res, 404, { error: "Active session not found" })
        return
      }
      const body = await readBody(req)
      const { filename, contentBase64 } = body
      if (!contentBase64 || !activeSess.activeFileChooser) {
        sendJson(res, 400, { error: "No file content or active file chooser" })
        return
      }
      try {
        const fs = await import("node:fs/promises")
        const pathModule = await import("node:path")
        const os = await import("node:os")
        
        // Write the base64 content to a temp file
        const tempDir = os.tmpdir()
        const tempFilePath = pathModule.join(tempDir, filename || "upload.tmp")
        await fs.writeFile(tempFilePath, Buffer.from(contentBase64, "base64"))
        
        // Resolve Playwright fileChooser
        await activeSess.activeFileChooser.setFiles(tempFilePath)
        activeSess.activeFileChooser = null
        
        // Clean up the temp file after Playwright consumes it
        fs.unlink(tempFilePath).catch(() => {})
        
        sendJson(res, 200, { success: true })
      } catch (err: any) {
        sendJson(res, 500, { error: err.message })
      }
      return
    }

    // Live preview cancel file chooser
    if (req.method === "POST" && path.match(/^\/sessions\/[^/]+\/cancel-file$/)) {
      const sessionId = path.split("/")[2]
      const activeSess = activeSessions.get(sessionId)
      if (!activeSess) {
        sendJson(res, 404, { error: "Active session not found" })
        return
      }
      activeSess.activeFileChooser = null
      sendJson(res, 200, { success: true })
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
      const sid = result.session?.id
      if (sid) {
        const activeSess = activeSessions.get(sid)
        if (activeSess) {
          activeSess.onFileChooser = (fileChooser) => {
            const stream = sessionStreams.get(sid)
            if (stream) {
              broadcastJson(stream, { type: "filechooser", open: true })
            }
          }
        }
      }
      sendJson(res, 201, result)
      return
    }

    const sessionMatch = path.match(/^\/sessions\/([^/]+)\/(.+)$/)
    if (sessionMatch && req.method === "POST") {
      const sessionId = sessionMatch[1]
      const action = sessionMatch[2]
      const body = await readBody(req)

      switch (action) {
        case "logs": {
          // Live console/network errors for the Logs panel.
          sendJson(res, 200, getSessionLogs(sessionId))
          return
        }
        case "pause":
          await pauseSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "resume":
          await resumeSession(sessionId)
          sendJson(res, 200, { success: true })
          return
        case "step-recording": {
          // Live QA scenario recording start/stop. In-memory flag on the
          // active session — no DB write.
          const result = setStepRecording(sessionId, body.enabled !== false)
          sendJson(res, 200, { success: true, ...result })
          return
        }
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
          const result = await applyInput(activeSess.page, body, sessionId)
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

server.listen(PORT, HOST, () => {
  console.log(`[RECORDER WORKER] Listening on http://${HOST}:${PORT}`)
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
