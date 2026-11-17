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

    // Playwright locators, most resilient first: test id, role + accessible
    // name, label, placeholder, id, name, then a short CSS path. Each candidate
    // is used only if it matches this one element on the page.
    const q = (v: string) => JSON.stringify(v)
    const clean = (v: string | null | undefined) => (v || "").replace(/\s+/g, " ").trim()
    const implicitRole = (el: Element): string | null => {
      const explicit = el.getAttribute("role")
      if (explicit) return explicit.split(" ")[0]
      const tag = el.tagName.toLowerCase()
      const type = (el.getAttribute("type") || "text").toLowerCase()
      if (tag === "a" && el.hasAttribute("href")) return "link"
      if (tag === "button") return "button"
      if (tag === "select") return (el as HTMLSelectElement).multiple ? "listbox" : "combobox"
      if (tag === "textarea") return "textbox"
      if (/^h[1-6]$/.test(tag)) return "heading"
      if (tag === "input") {
        if (["button", "submit", "reset", "image"].includes(type)) return "button"
        if (type === "checkbox") return "checkbox"
        if (type === "radio") return "radio"
        if (type === "range") return "slider"
        if (type === "number") return "spinbutton"
        if (type === "search") return "searchbox"
        if (["text", "email", "tel", "url"].includes(type)) return "textbox"
      }
      return null
    }
    const labelText = (el: Element): string => {
      const labelledBy = el.getAttribute("aria-labelledby")
      if (labelledBy) {
        const t = labelledBy.split(" ").map((id) => clean(document.getElementById(id)?.textContent)).join(" ").trim()
        if (t) return t
      }
      if (el.id) {
        const forLabel = document.querySelector(`label[for="${esc(el.id)}"]`)
        if (forLabel && clean(forLabel.textContent)) return clean(forLabel.textContent)
      }
      const wrap = el.closest("label")
      if (wrap) {
        const t = clean(wrap.textContent)
        if (t) return t
      }
      return ""
    }
    const accessibleName = (el: Element): string => {
      const aria = clean(el.getAttribute("aria-label"))
      if (aria) return aria
      const lbl = labelText(el)
      if (lbl) return lbl
      const tag = el.tagName.toLowerCase()
      if (tag === "input") {
        const type = (el.getAttribute("type") || "").toLowerCase()
        if (["button", "submit", "reset"].includes(type)) return clean((el as HTMLInputElement).value) || (type === "submit" ? "Submit" : "")
        return ""
      }
      const text = clean((el as HTMLElement).innerText || el.textContent)
      if (text) return text
      const img = el.querySelector("img[alt]")
      return clean(img?.getAttribute("alt")) || clean(el.getAttribute("title"))
    }
    const countWhere = (selector: string, test: (c: Element) => boolean) =>
      Array.from(document.querySelectorAll(selector)).filter(test).length
    const ROLE_SELECTOR = "a[href], button, input, select, textarea, h1, h2, h3, h4, h5, h6, [role]"

    // Playwright matches names case-insensitively by substring unless
    // `exact: true`. The page's own text can differ from the accessible name
    // Playwright computes (an icon drawn with CSS ::before is part of the name
    // but not of innerText), so `exact` is only added when the plain match
    // would hit more than one element.
    const contains = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase())
    const nameOpt = (name: string, matches: number) => (matches > 1 ? `{ name: ${q(name)}, exact: true }` : `{ name: ${q(name)} }`)
    const textOpt = (matches: number) => (matches > 1 ? ", { exact: true }" : "")

    const playwrightLocator = (el: Element): string => {
      const testId = el.getAttribute("data-testid") || el.getAttribute("data-test-id") || el.getAttribute("data-test") || el.getAttribute("data-qa")
      if (testId) {
        const attr = el.hasAttribute("data-testid") ? "data-testid" : el.hasAttribute("data-test-id") ? "data-test-id" : el.hasAttribute("data-test") ? "data-test" : "data-qa"
        if (attr === "data-testid") return `page.getByTestId(${q(testId)})`
        return `page.locator(${q(`[${attr}="${testId}"]`)})`
      }

      const role = implicitRole(el)
      const name = accessibleName(el)
      if (role && name && name.length <= 60) {
        const sameRole = Array.from(document.querySelectorAll(ROLE_SELECTOR)).filter((c) => implicitRole(c) === role)
        const loose = sameRole.filter((c) => contains(accessibleName(c), name)).length
        const exact = sameRole.filter((c) => accessibleName(c) === name).length
        if (loose === 1 || exact === 1) return `page.getByRole(${q(role)}, ${nameOpt(name, loose)})`
      }

      const tag = el.tagName.toLowerCase()
      if (["input", "textarea", "select"].includes(tag)) {
        const fields = Array.from(document.querySelectorAll("input, textarea, select"))
        const lbl = labelText(el) || clean(el.getAttribute("aria-label"))
        if (lbl && lbl.length <= 60) {
          const of = (c: Element) => labelText(c) || clean(c.getAttribute("aria-label"))
          const loose = fields.filter((c) => contains(of(c), lbl)).length
          if (loose === 1 || fields.filter((c) => of(c) === lbl).length === 1) return `page.getByLabel(${q(lbl)}${textOpt(loose)})`
        }
        const ph = clean(el.getAttribute("placeholder"))
        if (ph) {
          const loose = fields.filter((c) => contains(clean(c.getAttribute("placeholder")), ph)).length
          if (loose === 1 || document.querySelectorAll(`[placeholder="${esc(ph)}"]`).length === 1) return `page.getByPlaceholder(${q(ph)}${textOpt(loose)})`
        }
      }

      // Generated ids (react-select-3-input, ember123) change between builds.
      if (el.id && !/\d{3,}|^[a-f0-9-]{16,}$|:r\w+:/i.test(el.id)) return `page.locator(${q("#" + esc(el.id))})`
      const nm = el.getAttribute("name")
      if (nm && document.querySelectorAll(`[name="${esc(nm)}"]`).length === 1) return `page.locator(${q(`${tag}[name="${nm}"]`)})`
      if (role && name && name.length <= 60) return `page.getByRole(${q(role)}, { name: ${q(name)} }).first()`
      return `page.locator(${q(buildCss(el))})`
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
        record({ kind: "click", label: labelFor(el), locator: playwrightLocator(el), rect: rectOf(el) })
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
          locator: playwrightLocator(el),
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
        record({ kind: "select", label: labelFor(el), locator: playwrightLocator(el), value: el.value, rect: rectOf(el) })
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
        record({ kind: "press", label: labelFor(el), locator: playwrightLocator(el), value: "Enter", rect: rectOf(el) })
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
