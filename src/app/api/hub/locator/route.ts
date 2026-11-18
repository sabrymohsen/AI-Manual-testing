import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireAnyHubWriter } from "@/lib/hub-access"
import { chromium } from "playwright"

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface LocatorElement {
  tag: string
  text: string
  locatorJava: string
  box: { x: number; y: number; width: number; height: number }
}

// POST /api/hub/locator — Smart Locator helper.
// Loads the given URL headlessly, returns a screenshot plus the interactive
// elements found on the page with ready-to-paste SHAFT locator code.
export async function POST(request: NextRequest) {
  // Opens a browser on the server against any URL: project writers only.
  const auth = await requireAnyHubWriter()
  if (!auth.ok) return auth.response

  let browser
  try {
    const { url } = await request.json()

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "A valid http(s) URL is required" }, { status: 400 })
    }

    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 })
    await page.waitForTimeout(1200)

    const elements: LocatorElement[] = await page.evaluate(() => {
      const cssEscape = (v: string) => (window as any).CSS?.escape ? (window as any).CSS.escape(v) : v

      const buildCss = (el: Element): string => {
        if (el.id) return `#${cssEscape(el.id)}`
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

      const buildJavaLocator = (el: Element): string => {
        if (el.id) return `By.id("${el.id}")`
        const name = el.getAttribute("name")
        if (name) return `By.name("${name}")`
        const testId = el.getAttribute("data-testid") || el.getAttribute("data-test-id")
        if (testId) return `By.cssSelector("[data-testid='${testId}']")`
        const text = (el.textContent || "").trim()
        if (el.tagName === "A" && text && text.length < 40) return `By.linkText("${text.replace(/"/g, '\\"')}")`
        return `By.cssSelector("${buildCss(el).replace(/"/g, "'")}")`
      }

      const selectors = "a, button, input, select, textarea, [role='button'], [onclick]"
      const found: any[] = []
      document.querySelectorAll(selectors).forEach((el) => {
        if (found.length >= 60) return
        const rect = el.getBoundingClientRect()
        if (rect.width < 4 || rect.height < 4) return
        if (rect.bottom < 0 || rect.top > 800 || rect.right < 0 || rect.left > 1280) return

        const label =
          (el.textContent || "").trim().slice(0, 60) ||
          el.getAttribute("placeholder") ||
          el.getAttribute("aria-label") ||
          el.getAttribute("name") ||
          el.getAttribute("type") ||
          el.tagName.toLowerCase()

        found.push({
          tag: el.tagName.toLowerCase(),
          text: label,
          locatorJava: buildJavaLocator(el),
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        })
      })
      return found
    })

    const screenshot = await page.screenshot({ type: "jpeg", quality: 60 })

    return NextResponse.json({
      url,
      viewport: { width: 1280, height: 800 },
      screenshot: `data:image/jpeg;base64,${screenshot.toString("base64")}`,
      elements
    })
  } catch (err: any) {
    console.error("POST hub locator error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
