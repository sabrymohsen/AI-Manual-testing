/**
 * Open a page in a real browser and take the screenshot a visual test compares.
 * Server/worker only.
 *
 * Most "visual flakiness" is the page not being finished, not the comparison
 * being too strict, so capture does the finishing: wait for the network to go
 * quiet (bounded — sockets never idle), freeze animations and the text caret,
 * scroll the page once so lazy images load, wait for web fonts, then run the
 * test's own script and wait. Only then the screenshot.
 */
import { chromium, firefox, webkit, devices, type Browser, type BrowserContext, type Page } from "playwright"
import type { VisualBrowser, VisualEnvironment } from "./environments"
import type { Rect } from "./image-diff"
import { ensureEvaluateShim } from "@/lib/playwright/evaluate-shim"

const FREEZE_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}`

export async function launchBrowser(browser: VisualBrowser): Promise<Browser> {
  const engine = browser === "firefox" ? firefox : browser === "webkit" ? webkit : chromium
  try {
    return await engine.launch({ headless: true })
  } catch (err: any) {
    const label = browser === "webkit" ? "Safari (WebKit)" : browser === "firefox" ? "Firefox" : "Chrome (Chromium)"
    throw new Error(
      `${label} is not installed where the worker runs, so screens on this browser could not be captured. ` +
        `(${String(err?.message || err).split("\n")[0]})`
    )
  }
}

export async function newEnvironmentContext(browser: Browser, env: VisualEnvironment): Promise<BrowserContext> {
  const descriptor = env.device ? devices[env.device] : undefined
  if (descriptor) {
    // A device descriptor carries its own user agent, touch and scale; the
    // environment's size wins so the key and the picture agree.
    const rest: Record<string, unknown> = { ...descriptor }
    // Chosen by the environment's browser, not the descriptor.
    delete rest.defaultBrowserType
    return browser.newContext({
      ...rest,
      viewport: { width: env.width, height: env.height },
      ignoreHTTPSErrors: true,
    })
  }
  return browser.newContext({
    viewport: { width: env.width, height: env.height },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
  })
}

export interface CaptureOptions {
  captureType: "FullPage" | "Viewport"
  waitBeforeCaptureMs: number
  beforeCaptureScript?: string | null
  collectDynamicText: boolean
  navigationTimeoutMs?: number
}

export interface OpenResult {
  httpStatus: number | null
  loadMs: number
  error: string | null
}

export async function openPage(page: Page, url: string, timeoutMs = 45_000): Promise<OpenResult> {
  const started = Date.now()
  try {
    const response = await page.goto(url, { waitUntil: "load", timeout: timeoutMs })
    const httpStatus = response?.status() ?? null
    return {
      httpStatus,
      loadMs: Date.now() - started,
      error: httpStatus !== null && httpStatus >= 400 ? `The page answered HTTP ${httpStatus}.` : null,
    }
  } catch (err: any) {
    const msg = String(err?.message || err)
    return {
      httpStatus: null,
      loadMs: Date.now() - started,
      error: /timeout/i.test(msg)
        ? `The page did not finish loading within ${Math.round(timeoutMs / 1000)} seconds.`
        : `The page could not be opened: ${msg.split("\n")[0]}`,
    }
  }
}

/** Let the page finish: quiet network, frozen motion, lazy content, fonts. Never throws. */
export async function settlePage(page: Page, captureType: "FullPage" | "Viewport"): Promise<void> {
  await ensureEvaluateShim(page)
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {})
  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {})
  if (captureType === "FullPage") {
    await page
      .evaluate(async () => {
        const step = Math.max(200, Math.floor(window.innerHeight * 0.8))
        const limit = Math.min(document.documentElement.scrollHeight, 30_000)
        for (let y = 0; y < limit; y += step) {
          window.scrollTo(0, y)
          await new Promise(r => setTimeout(r, 60))
        }
        window.scrollTo(0, 0)
      })
      .catch(() => {})
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {})
  }
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
}

/**
 * Boxes of text a Dynamic comparison should ignore: dates, times, numbers with
 * 2+ digits, prices, emails, URLs, and every form field's value. Coordinates are
 * document-relative for full-page captures and viewport-relative otherwise, so
 * they line up with the screenshot they will mask.
 */
export async function collectDynamicRects(page: Page, captureType: "FullPage" | "Viewport"): Promise<Rect[]> {
  await ensureEvaluateShim(page)
  return page
    .evaluate(fullPage => {
      const patterns = [
        /\b\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}\b/, // dates
        /\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?\b/i, // times
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}/i, // "Sep 17"
        /[$€£¥₹]\s?\d|\d\s?(usd|eur|egp|sar|aed|gbp)\b/i, // prices
        /[\w.+-]+@[\w-]+\.[\w.]+/, // emails
        /https?:\/\/\S+/i, // links shown as text
        /\d[\d,.]{1,}\d|\b\d{2,}\b/, // numbers with 2+ digits
      ]
      const sx = fullPage ? window.scrollX : 0
      const sy = fullPage ? window.scrollY : 0
      const rects: { x: number; y: number; width: number; height: number }[] = []
      const push = (r: DOMRect) => {
        if (r.width < 1 || r.height < 1) return
        rects.push({ x: Math.floor(r.left + sx) - 2, y: Math.floor(r.top + sy) - 2, width: Math.ceil(r.width) + 4, height: Math.ceil(r.height) + 4 })
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node: Node | null
      let count = 0
      while ((node = walker.nextNode()) && count < 3000) {
        const text = node.textContent || ""
        if (!text.trim() || !patterns.some(p => p.test(text))) continue
        const parent = node.parentElement
        if (!parent || parent.closest("script,style,noscript")) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of Array.from(range.getClientRects())) push(r)
        count++
      }
      document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select").forEach(el => {
        push((el as HTMLElement).getBoundingClientRect())
      })
      return rects
    }, captureType === "FullPage")
    .catch(() => [])
}

export interface CaptureResult {
  png: Buffer
  dynamicRects: Rect[] | null
  scriptError: string | null
}

export async function captureScreen(page: Page, opts: CaptureOptions): Promise<CaptureResult> {
  await settlePage(page, opts.captureType)

  let scriptError: string | null = null
  if (opts.beforeCaptureScript?.trim()) {
    try {
      // Wrapped so both statements and a returned promise work.
      await page.evaluate(`(async () => { ${opts.beforeCaptureScript} })()`)
    } catch (err: any) {
      scriptError = `The script before capture failed: ${String(err?.message || err).split("\n")[0]}`
    }
  }
  if (opts.waitBeforeCaptureMs > 0) await page.waitForTimeout(Math.min(opts.waitBeforeCaptureMs, 30_000))

  const dynamicRects = opts.collectDynamicText ? await collectDynamicRects(page, opts.captureType) : null
  const png = await page.screenshot({
    type: "png",
    fullPage: opts.captureType === "FullPage",
    animations: "disabled",
    caret: "hide",
    timeout: 60_000,
  })
  return { png, dynamicRects, scriptError }
}
