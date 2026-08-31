/**
 * Read a Playwright trace.zip into the shape the Trace Viewer already renders.
 *
 * The hub used to read SHAFT's own bundle — a single shaft-trace.json holding
 * pre-shaped actions, console and network arrays. Playwright's trace is a
 * different thing: NDJSON event streams, one line per event, where an action is
 * a `before` and a matching `after` joined on callId. Everything the viewer
 * needs is in there, just not pre-assembled.
 *
 * Entries inside the zip:
 *   test.trace       runner-level steps (fixtures, hooks, expects)
 *   0-trace.trace    library events: before/after, console, log, snapshots
 *   0-trace.network  one NDJSON line per request/response
 *   resources/       bodies and screencast frames
 *
 * Nothing here throws on a malformed line: a trace truncated by a crashed run
 * is exactly when someone most wants to look at it, so unparsable lines are
 * skipped rather than failing the whole read.
 */
import { unzipEntry, zipEntries } from "@/lib/hub-traces"

export interface PwAction {
  id: string
  category: string
  name: string
  status: string
  startTime: string
  durationMs: number
  locator: string
  url: string
  message: string
  exception: { type: string; message: string }
  attachments: string[]
  metadata: Record<string, any>
}

export interface PwConsoleMsg {
  source: string
  level: string
  message: string
  timestamp: number
}

export interface PwNetworkEntry {
  id: string
  startedDateTime: string | null
  method: string
  url: string
  status: number | null
  statusText: string
  durationMs: number | null
  size: number | null
  mimeType: string
  request: any
  response: any
}

/**
 * Playwright's error messages carry terminal colour codes, which are meaningless
 * in a web view and render as literal "[2m[31m" noise in the trace panel.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return (text || "").replace(/\u001b\[[0-9;]*m/g, "")
}

function parseNdjson(raw: string): any[] {
  const out: any[] = []
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t))
    } catch {
      // Truncated or partial line — skip it, keep the rest of the trace.
    }
  }
  return out
}

/** Which of the viewer's icon categories an event belongs to. */
function categorise(cls: string, method: string, title = ""): string {
  const m = `${method || ""} ${title || ""}`.toLowerCase()
  // Runner-level scaffolding: real, but not what someone reads a timeline for.
  if (m.includes("fixture") || m.includes("hook")) return "setup"
  if (m.includes("launch browser") || m.includes("create context") || m.includes("create page")) {
    return "setup"
  }
  if (m.includes("goto") || m.includes("navigate")) return "navigation"
  if (m.startsWith("expect") || m.includes("assert")) return "assertion"
  if (["click", "fill", "press", "check", "uncheck", "selectoption", "hover", "type", "setinputfiles", "dragto"].some((a) => m.includes(a))) {
    return "interaction"
  }
  if (m.includes("screenshot") || m.includes("video")) return "evidence"
  if (m.includes("waitfor")) return "wait"
  if ((cls || "").toLowerCase().includes("browser")) return "browser"
  return "other"
}

/**
 * A readable label.
 *
 * Playwright's runner-level steps carry a written title ("Launch browser",
 * "Set content"); the library-level ones carry a method and the selector it
 * acted on. Prefer the title, then method + selector, so the timeline reads as
 * steps rather than as API names.
 */
function actionName(method: string, params: any, title?: string): string {
  const sel = params?.selector || params?.url || params?.expression
  if (title && sel) return `${title} — ${String(sel).slice(0, 60)}`
  if (title) return title
  return sel ? `${method} ${String(sel).slice(0, 80)}` : method
}

export interface ParsedPwTrace {
  actions: PwAction[]
  console: PwConsoleMsg[]
  network: PwNetworkEntry[]
  browserName: string
  startedAtMs: number | null
}

export async function parsePlaywrightTrace(zipPath: string): Promise<ParsedPwTrace> {
  // zipEntries reports either a name or a {name,size} record depending on the
  // caller; normalise before matching so both shapes work.
  const rawEntries = await zipEntries(zipPath).catch(() => [] as Array<string | { name: string }>)
  const entries: string[] = (rawEntries as Array<string | { name: string }>).map((e) =>
    typeof e === "string" ? e : e.name
  )
  const traceFiles = entries.filter((e) => e.endsWith(".trace"))
  const networkFiles = entries.filter((e) => e.endsWith(".network"))

  const events: any[] = []
  for (const f of traceFiles) {
    events.push(...parseNdjson(await unzipEntry(zipPath, f).catch(() => "")))
  }

  const ctx = events.find((e) => e.type === "context-options")
  const browserName = ctx?.browserName || ""
  // wallTime pins the monotonic timestamps to a real clock; without it the
  // viewer still gets correct ordering and durations, just relative times.
  const wallTime: number | null =
    typeof ctx?.wallTime === "number" ? ctx.wallTime : typeof ctx?.startTime === "number" ? null : null
  const monotonicBase: number | null = typeof ctx?.monotonicTime === "number" ? ctx.monotonicTime : null

  const toIso = (t: number): string => {
    if (wallTime !== null && monotonicBase !== null) {
      return new Date(wallTime + (t - monotonicBase)).toISOString()
    }
    if (wallTime !== null) return new Date(wallTime + t).toISOString()
    // No wall clock in this trace: report the offset, which is still useful
    // and honest, rather than inventing a date.
    return `+${t.toFixed(0)}ms`
  }

  const befores = new Map<string, any>()
  const actions: PwAction[] = []

  for (const e of events) {
    if (e.type === "before" && e.callId) {
      befores.set(e.callId, e)
      continue
    }
    if (e.type !== "after" || !e.callId) continue

    const b = befores.get(e.callId)
    if (!b) continue
    befores.delete(e.callId)

    const params = b.params || {}
    const method = b.method || b.apiName || "step"
    const start = typeof b.startTime === "number" ? b.startTime : 0
    const end = typeof e.endTime === "number" ? e.endTime : start
    const err = e.error?.error || e.error

    actions.push({
      id: String(e.callId),
      category: categorise(b.class, method, b.title),
      name: actionName(method, params, b.title),
      status: err ? "failed" : "passed",
      startTime: toIso(start),
      durationMs: Math.max(0, Math.round(end - start)),
      locator: params.selector || "",
      url: params.url || "",
      message: b.stepId || "",
      exception: { type: stripAnsi(err?.name || ""), message: stripAnsi(err?.message || "") },
      attachments: [],
      metadata: params,
    })
  }

  // Anything still open never got an `after`: the run died mid-action, which is
  // usually the most interesting row on the page.
  for (const [callId, b] of befores) {
    actions.push({
      id: String(callId),
      category: categorise(b.class, b.method, b.title),
      name: actionName(b.method || "step", b.params || {}, b.title),
      status: "failed",
      startTime: toIso(typeof b.startTime === "number" ? b.startTime : 0),
      durationMs: 0,
      locator: b.params?.selector || "",
      url: b.params?.url || "",
      message: "Action did not complete — the run ended while it was in flight.",
      exception: { type: "Incomplete", message: "No completion event was recorded for this action." },
      attachments: [],
      metadata: b.params || {},
    })
  }

  actions.sort((a, b) => a.startTime.localeCompare(b.startTime))

  /*
   * Playwright records the same operation twice: once as a runner step in
   * test.trace ("Click locator('#go')") and once as the library call in
   * 0-trace.trace ("click #go"). Both are real, but showing both doubles the
   * timeline and makes a four-line test look like twenty steps.
   *
   * The pair is recognised by near-identical start and duration — they are the
   * same work, measured at two levels — and the titled runner step is kept,
   * since that is the one written in the reader's vocabulary.
   */
  const deduped: PwAction[] = []
  for (const a of actions) {
    const twin = deduped.find(
      (b) =>
        Math.abs(b.durationMs - a.durationMs) <= 5 &&
        b.startTime === a.startTime &&
        b.category === a.category
    )
    if (twin) continue
    const near = deduped.find(
      (b) =>
        Math.abs(b.durationMs - a.durationMs) <= 5 &&
        b.locator === a.locator &&
        b.locator !== "" &&
        b.category === a.category
    )
    if (near) continue
    deduped.push(a)
  }

  const consoleMsgs: PwConsoleMsg[] = events
    .filter((e) => e.type === "console")
    .map((e) => ({
      source: e.location?.url || "page",
      level: e.messageType || "log",
      message: stripAnsi(e.text || ""),
      timestamp: typeof e.time === "number" ? e.time : 0,
    }))

  const network: PwNetworkEntry[] = []
  for (const f of networkFiles) {
    for (const e of parseNdjson(await unzipEntry(zipPath, f).catch(() => ""))) {
      const snap = e.snapshot || e
      if (!snap?.request && !snap?.url) continue
      const started = snap.startedDateTime || snap.time || null
      network.push({
        id: String(snap._monotonicTime ?? snap.requestId ?? network.length),
        startedDateTime: typeof started === "string" ? started : null,
        method: snap.request?.method || snap.method || "",
        url: snap.request?.url || snap.url || "",
        status: snap.response?.status ?? null,
        statusText: snap.response?.statusText || "",
        durationMs: typeof snap.time === "number" ? Math.round(snap.time) : null,
        size: snap.response?.content?.size ?? snap.response?.bodySize ?? null,
        mimeType: snap.response?.content?.mimeType || "",
        request: snap.request || null,
        response: snap.response || null,
      })
    }
  }

  return {
    actions: deduped,
    console: consoleMsgs,
    network,
    browserName,
    startedAtMs: wallTime,
  }
}
