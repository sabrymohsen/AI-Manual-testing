// Playwright code generation from Visual Recorder actions.
// Used by the live client-side preview and by POST /api/hub/recorder/generate.
//
// This emitted SHAFT/TestNG Java, which the hub had no way to run — the Maven
// workspace it targeted held no pom.xml and no sources. Recorded flows now come
// out as @playwright/test specs, the same thing Test Studio stores and the
// runner executes, so a recording can be saved and run without a rewrite.

export interface RecordedAction {
  id: string
  step: number
  kind: "navigate" | "click" | "type" | "select" | "press"
  label: string // human readable element / target name
  locator?: string // selector captured for the element
  value?: string
  isPassword?: boolean
  url?: string
  // last known element position, used for the red highlight overlay
  rect?: { x: number; y: number; width: number; height: number }
  at: number
}

const escapeJs = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")

/**
 * Turn a captured locator into a Playwright one.
 *
 * The recorder stores whatever the page gave it, and older recordings hold
 * Selenium `By.id("x")` strings from when this emitted Java. Those are
 * translated rather than dropped, so a flow recorded before this change still
 * generates a runnable spec.
 */
export function toPlaywrightLocator(raw?: string): string | null {
  if (!raw) return null
  const s = raw.trim()

  const by = s.match(/^By\.(\w+)\(\s*"(.*)"\s*\)$/)
  if (by) {
    const [, kind, rawValue] = by
    const value = escapeJs(rawValue)
    switch (kind.toLowerCase()) {
      case "id": return `page.locator("#${value}")`
      case "cssselector": return `page.locator("${value}")`
      case "xpath": return `page.locator("xpath=${value}")`
      case "name": return `page.locator("[name='${value}']")`
      case "linktext": return `page.getByRole("link", { name: "${value}" })`
      case "classname": return `page.locator(".${value}")`
      default: return `page.locator("${value}")`
    }
  }

  if (s.startsWith("page.")) return s
  return `page.locator("${escapeJs(s)}")`
}

export function actionToPlaywrightLine(action: RecordedAction): string | null {
  const loc = toPlaywrightLocator(action.locator)

  switch (action.kind) {
    case "navigate":
      return action.url ? `await page.goto("${escapeJs(action.url)}");` : null
    case "click":
      return loc ? `await ${loc}.click();` : null
    case "type": {
      if (!loc) return null
      // A recorded password is never written into the spec. It is emitted as an
      // env lookup so the file can be committed and still run.
      if (action.isPassword) {
        return `await ${loc}.fill(process.env.RECORDED_PASSWORD ?? "");`
      }
      return `await ${loc}.fill("${escapeJs(action.value || "")}");`
    }
    case "select":
      return loc ? `await ${loc}.selectOption("${escapeJs(action.value || "")}");` : null
    case "press":
      return loc ? `await ${loc}.press("${escapeJs(action.value || "Enter")}");` : null
    default:
      return null
  }
}

export function generatePlaywrightSpec(
  actions: RecordedAction[],
  className = "RecordedFlowTest"
): string {
  const title = className.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  const lines: string[] = []
  let step = 0

  for (const action of actions) {
    const code = actionToPlaywrightLine(action)
    if (!code) continue
    step++
    const label = (action.label || "").replace(/\s+/g, " ").trim().slice(0, 60)
    lines.push(`  // Step ${step}: ${action.kind} — ${label}`)
    lines.push(`  ${code}`)
  }

  const body =
    lines.length > 0
      ? lines.join("\n")
      : "  // No actions recorded yet — interact with the browser view to capture steps"

  return `import { test, expect } from "@playwright/test"

test("${title}", async ({ page }) => {
${body}
})
`
}

/** @deprecated Kept so older imports resolve; emits Playwright now. */
export const generateShaftJava = generatePlaywrightSpec
/** @deprecated Renamed to actionToPlaywrightLine. */
export const actionToJavaLine = actionToPlaywrightLine
