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
    case "press": {
      if (!loc) return null
      // Older recordings stored Selenium's "ENTER"; Playwright's key name is "Enter".
      const key = /^enter$/i.test(action.value || "") ? "Enter" : action.value || "Enter"
      return `await ${loc}.press("${escapeJs(key)}");`
    }
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

  let previous: RecordedAction | null = null
  for (const action of actions) {
    // A page load right after a click or Enter is that action's result, not a
    // separate step: check the URL instead of opening it again (re-opening it
    // would hide a login or form that failed to submit).
    const caused = action.kind === "navigate" && action.url && previous && (previous.kind === "click" || previous.kind === "press")
    const code = caused
      ? `await expect(page).toHaveURL("${escapeJs(action.url!)}");`
      : actionToPlaywrightLine(action)
    previous = action
    if (!code) continue
    step++
    const label = (action.label || "").replace(/\s+/g, " ").trim().slice(0, 60)
    lines.push(`  // Step ${step}: ${caused ? "check page" : action.kind} — ${label}`)
    lines.push(`  ${code}`)
  }

  const body =
    lines.length > 0
      ? lines.join("\n")
      : "  // No actions recorded yet — interact with the browser view to capture steps"

  // A recording proves nothing until it checks something. Point at where the
  // check goes, rather than emitting one that would pass no matter what.
  const check = lines.length > 0
    ? `\n\n  // TODO: check the result, for example:\n  // await expect(page.getByText("Welcome")).toBeVisible()`
    : ""

  return `import { test, expect } from "@playwright/test"

test("${title}", async ({ page }) => {
${body}${check}
})
`
}

/** @deprecated Kept so older imports resolve; emits Playwright now. */
export const generateShaftJava = generatePlaywrightSpec
/** @deprecated Renamed to actionToPlaywrightLine. */
export const actionToJavaLine = actionToPlaywrightLine
