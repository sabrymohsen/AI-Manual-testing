// Server-side Visual Recorder session manager.
// Holds one live Playwright browser session, injects capture listeners into the
// target page, and exposes frames + recorded actions to the /api/hub/recorder routes.
// Stored on globalThis so the session survives Next.js dev hot-reloads.

import { chromium, firefox, devices, Browser, Page } from "playwright"
import { randomUUID } from "crypto"
import type { RecordedAction } from "@/lib/recorder-codegen"

export interface RecorderSession {
  id: string
  url: string
  device: string
  browserName: string
  viewport: { width: number; height: number }
  recording: boolean
  startedAt: number
  actions: RecordedAction[]
  browser: Browser
  page: Page
  capturing: boolean
}

const g = globalThis as any

export function getActiveSession(): RecorderSession | null {
  return g.__hubRecorderSession || null
}

const DEVICE_MAP: Record<string, string | null> = {
  Desktop: null,
  "iPhone 14": "iPhone 14",
  "Pixel 7": "Pixel 7",
  iPad: "iPad (gen 7)"
}

export async function stopActiveSession(): Promise<RecordedAction[]> {
  const session: RecorderSession | null = g.__hubRecorderSession || null
  if (!session) return []
  session.recording = false
  await session.browser.close().catch(() => {})
  // keep the session record (actions) available for generate/save after stop
  return session.actions
}

function pushAction(session: RecorderSession, action: Omit<RecordedAction, "id" | "step" | "at">) {
  // Coalesce consecutive typing into the same field into a single action
  const last = session.actions[session.actions.length - 1]
  if (action.kind === "type" && last?.kind === "type" && last.locator === action.locator) {
    last.value = action.value
    last.isPassword = action.isPassword
    last.rect = action.rect
    last.at = Date.now()
    return
  }
  // Dedupe repeated navigations to the same URL
  if (action.kind === "navigate" && last?.kind === "navigate" && last.url === action.url) return

  session.actions.push({
    ...action,
    id: randomUUID(),
    step: session.actions.length + 1,
    at: Date.now()
  })
}

export async function startSession(opts: {
  url: string
  device: string
  browserName: string
  customViewport?: { width: number; height: number }
  customUserAgent?: string
  customScaleFactor?: number
  isMobile?: boolean
}): Promise<RecorderSession> {
  // Only one live capture session at a time
  await stopActiveSession()
  g.__hubRecorderSession = null

  let contextOptions: any = {}

  if (opts.customViewport || opts.customUserAgent) {
    contextOptions = {
      viewport: opts.customViewport || { width: 1920, height: 1080 },
      userAgent: opts.customUserAgent || undefined,
      deviceScaleFactor: opts.customScaleFactor || 1,
      isMobile: opts.isMobile || false
    }
  } else {
    const deviceDescriptorName = DEVICE_MAP[opts.device] ?? null
    const descriptor = deviceDescriptorName ? (devices as any)[deviceDescriptorName] : null
    contextOptions = descriptor
      ? { ...descriptor }
      : { viewport: { width: 1920, height: 1080 } }
  }

  const engine = opts.browserName === "Firefox" ? firefox : chromium
  const launchOptions: any = { headless: true }
  if (opts.browserName === "Edge") launchOptions.channel = "msedge"

  let browser: Browser
  try {
    browser = await engine.launch(launchOptions)
  } catch {
    // e.g. Edge channel not installed — fall back to plain chromium
    browser = await chromium.launch({ headless: true })
  }

  // Firefox does not support the isMobile emulation flag
  if (opts.browserName === "Firefox") delete contextOptions.isMobile

  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()

  const session: RecorderSession = {
    id: randomUUID(),
    url: opts.url,
    device: opts.device,
    browserName: opts.browserName,
    viewport: contextOptions.viewport || { width: 1280, height: 800 },
    recording: true,
    startedAt: Date.now(),
    actions: [],
    browser,
    page,
    capturing: false
  }

  // In-page capture callback → recorded actions
  await context.exposeBinding("__hubRecord", (_source, payload: any) => {
    if (!session.recording) return
    if (payload?.kind === "click" || payload?.kind === "type" || payload?.kind === "select" || payload?.kind === "press") {
      pushAction(session, payload)
    }
  })

  // Capture listeners injected into every document (survives navigation)
  await context.addInitScript(() => {
    const esc = (v: string) => ((window as any).CSS?.escape ? (window as any).CSS.escape(v) : v)

    const buildCss = (el: Element): string => {
      if (el.id) return `#${esc(el.id)}`
      const name = el.getAttribute("name")
      if (name) return `${el.tagName.toLowerCase()}[name='${name}']`
      const parts: string[] = []
      let node: Element | null = el
      while (node && node !== document.body && parts.length < 4) {
        let part = node.tagName.toLowerCase()
        const cls = Array.from(node.classList).slice(0, 2).join(".")
        if (cls) part += `.${cls}`
        const parent = node.parentElement
        if (parent) {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName)
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
        }
        parts.unshift(part)
        node = node.parentElement
      }
      return parts.join(" > ")
    }

    const javaLocator = (el: Element): string => {
      if (el.id) return `By.id("${el.id}")`
      const name = el.getAttribute("name")
      if (name) return `By.name("${name}")`
      const testId = el.getAttribute("data-testid") || el.getAttribute("data-test-id")
      if (testId) return `By.cssSelector("[data-testid='${testId}']")`
      const text = (el.textContent || "").trim()
      if (el.tagName === "A" && text && text.length < 40) return `By.linkText("${text.replace(/"/g, '\\"')}")`
      return `By.cssSelector("${buildCss(el).replace(/"/g, "'")}")`
    }

    const labelFor = (el: Element): string => {
      const raw =
        (el as HTMLElement).innerText?.trim() ||
        el.getAttribute("placeholder") ||
        el.getAttribute("aria-label") ||
        el.getAttribute("name") ||
        el.getAttribute("id") ||
        el.tagName.toLowerCase()
      return raw.replace(/\s+/g, " ").slice(0, 50)
    }

    const rectOf = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }

    const record = (payload: any) => (window as any).__hubRecord?.(payload)

    document.addEventListener(
      "click",
      (e) => {
        const el = (e.target as Element)?.closest(
          "a, button, input, select, textarea, [role='button'], [onclick], label"
        ) || (e.target as Element)
        if (!el || !(el instanceof Element)) return
        // typing targets are captured by the input listener instead
        const tag = el.tagName.toLowerCase()
        const inputType = (el.getAttribute("type") || "").toLowerCase()
        const isTypable =
          tag === "textarea" ||
          (tag === "input" && !["button", "submit", "checkbox", "radio", "reset"].includes(inputType))
        if (isTypable || tag === "select") return
        record({ kind: "click", label: labelFor(el), locator: javaLocator(el), rect: rectOf(el) })
      },
      true
    )

    document.addEventListener(
      "input",
      (e) => {
        const el = e.target as HTMLInputElement
        if (!el || !("value" in el)) return
        const tag = el.tagName.toLowerCase()
        if (tag !== "input" && tag !== "textarea") return
        const isPassword =
          (el.getAttribute("type") || "").toLowerCase() === "password" ||
          /pass|pwd|secret|token/i.test(el.name || el.id || "")
        record({
          kind: "type",
          label: labelFor(el),
          locator: javaLocator(el),
          value: isPassword ? "[REDACTED]" : el.value,
          isPassword,
          rect: rectOf(el)
        })
      },
      true
    )

    document.addEventListener(
      "change",
      (e) => {
        const el = e.target as HTMLSelectElement
        if (!el || el.tagName?.toLowerCase() !== "select") return
        record({ kind: "select", label: labelFor(el), locator: javaLocator(el), value: el.value, rect: rectOf(el) })
      },
      true
    )

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter") return
        const el = e.target as Element
        if (!el || !(el instanceof Element)) return
        const tag = el.tagName.toLowerCase()
        if (tag !== "input" && tag !== "textarea") return
        record({ kind: "press", label: labelFor(el), locator: javaLocator(el), value: "ENTER", rect: rectOf(el) })
      },
      true
    )
  })

  // Track navigations (initial goto, link clicks, SPA pushState)
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return
    const url = frame.url()
    if (!url || url === "about:blank") return
    if (session.recording) pushAction(session, { kind: "navigate", label: url, url })
  })

  g.__hubRecorderSession = session

  await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((err) => {
    pushAction(session, { kind: "navigate", label: `Failed to load: ${err.message.slice(0, 80)}`, url: opts.url })
  })

  return session
}

export async function captureFrame(session: RecorderSession): Promise<string | null> {
  if (session.capturing) return null
  session.capturing = true
  try {
    const buffer = await session.page.screenshot({ type: "jpeg", quality: 90, timeout: 4000 })
    return `data:image/jpeg;base64,${buffer.toString("base64")}`
  } catch {
    return null
  } finally {
    session.capturing = false
  }
}
