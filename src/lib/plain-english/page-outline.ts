/**
 * A compact, text-only outline of a page — headings, form fields with their
 * labels and options, buttons, links — for the AI that writes steps. Server only.
 *
 * Text, not a screenshot: it is a fraction of the tokens (the project's model
 * is a slow reasoning model), and it gives the AI the exact labels the grammar
 * will look for at run time, so the steps it writes resolve.
 */
import { chromium } from "playwright"
import { ensureEvaluateShim } from "@/lib/playwright/evaluate-shim"

export async function fetchPageOutline(url: string, timeoutMs = 25_000): Promise<string | null> {
  const browser = await chromium.launch({ headless: true }).catch(() => null)
  if (!browser) return null
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs })
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {})
    await ensureEvaluateShim(page)
    const outline = await page.evaluate(() => {
      const visible = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        const st = getComputedStyle(el as HTMLElement)
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"
      }
      const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim().slice(0, 80)
      const labelOf = (el: Element) => {
        const id = el.getAttribute("id")
        const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null
        return clean(byFor?.textContent || el.closest("label")?.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name"))
      }
      const lines: string[] = [`Title: ${clean(document.title)}`]
      document.querySelectorAll("h1, h2, h3").forEach(h => visible(h) && lines.push(`Heading: "${clean(h.textContent)}"`))
      document.querySelectorAll("input, textarea, select, [role=combobox]").forEach(el => {
        if (!visible(el)) return
        const type = (el as HTMLInputElement).type || el.tagName.toLowerCase()
        if (["hidden", "submit", "button", "image", "reset"].includes(type)) return
        const label = labelOf(el)
        const req = (el as HTMLInputElement).required ? " required" : ""
        if (el.tagName === "SELECT") {
          const opts = Array.from((el as HTMLSelectElement).options).map(o => clean(o.textContent)).filter(Boolean).slice(0, 12)
          lines.push(`Dropdown "${label}"${req}: options ${opts.map(o => `"${o}"`).join(", ")}`)
        } else if (type === "checkbox" || type === "radio") {
          lines.push(`${type === "checkbox" ? "Checkbox" : "Radio"} "${label}"`)
        } else {
          const ph = el.getAttribute("placeholder")
          lines.push(`Field "${label}" (${type})${req}${ph && clean(ph) !== label ? ` placeholder "${clean(ph)}"` : ""}`)
        }
      })
      document.querySelectorAll("button, [role=button], input[type=submit]").forEach(b => {
        if (!visible(b)) return
        const t = clean((b as HTMLInputElement).value || b.textContent || b.getAttribute("aria-label"))
        if (t) lines.push(`Button "${t}"`)
      })
      let links = 0
      document.querySelectorAll("a[href]").forEach(a => {
        if (links >= 30 || !visible(a)) return
        const t = clean(a.textContent || a.getAttribute("aria-label"))
        if (t) {
          lines.push(`Link "${t}"`)
          links++
        }
      })
      return [...new Set(lines)].slice(0, 160).join("\n")
    })
    return outline
  } catch {
    return null
  } finally {
    await browser.close().catch(() => {})
  }
}
