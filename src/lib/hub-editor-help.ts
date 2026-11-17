/**
 * Checks and snippets for the Automation Hub's JavaScript editor.
 *
 * The editor used to validate Java: it asked for a `package` line and an
 * `@Test` annotation, so every valid Playwright test showed warnings. These
 * checks catch the mistakes people actually make in Playwright JavaScript.
 */

export interface LintIssue {
  line: number // 1-based
  startColumn: number
  endColumn: number
  severity: "error" | "warning" | "info"
  message: string
}

// Calls that return a Promise and silently do nothing useful without `await`.
const ASYNC_ACTIONS =
  "goto|click|dblclick|fill|press|pressSequentially|check|uncheck|setChecked|selectOption|setInputFiles|hover|focus|clear|dragTo|waitForURL|waitForResponse|waitForLoadState|waitForTimeout|reload|goBack|goForward|screenshot|evaluate|route|setViewportSize|waitFor|innerText|textContent|inputValue|getAttribute|isVisible|isChecked|count|title|get|post|put|patch|delete|json|text"
const WEB_FIRST =
  "toBeVisible|toBeHidden|toBeEnabled|toBeDisabled|toBeChecked|toBeEditable|toBeFocused|toBeEmpty|toBeAttached|toBeInViewport|toHaveText|toContainText|toHaveValue|toHaveAttribute|toHaveClass|toHaveCSS|toHaveCount|toHaveURL|toHaveTitle|toHaveScreenshot|toBeOK|toHaveAccessibleName"

export function lintPlaywrightJs(code: string): LintIssue[] {
  const issues: LintIssue[] = []
  const lines = code.split("\n")
  const whole = (line: number, severity: LintIssue["severity"], message: string) =>
    issues.push({ line, startColumn: 1, endColumn: (lines[line - 1]?.length || 0) + 1, severity, message })

  if (!code.trim()) return issues

  // Leftover Java from the SHAFT era.
  const javaLine = lines.findIndex((l) => /^\s*(package\s+[\w.]+;|import\s+(org|com)\.[\w.]+;|public\s+class\b|@Test\b)/.test(l))
  if (javaLine !== -1) {
    whole(javaLine + 1, "error", "This is Java. Hub tests are Playwright JavaScript: start from the New test menu or a snippet.")
  }

  if (!/@playwright\/test/.test(code)) {
    whole(1, "error", 'Add the import at the top: import { test, expect } from "@playwright/test"')
  }
  if (!/\btest(\.(only|fail|skip))?\s*\(/.test(code)) {
    whole(1, "warning", "No test() found, so nothing will run. Type “test” and pick the snippet.")
  }

  let inBlockComment = false
  lines.forEach((raw, i) => {
    const n = i + 1
    let l = raw
    if (inBlockComment) {
      if (!l.includes("*/")) return
      l = l.slice(l.indexOf("*/") + 2)
      inBlockComment = false
    }
    if (l.includes("/*") && !l.includes("*/")) inBlockComment = true
    const codePart = l.replace(/\/\/.*$/, "")
    if (!codePart.trim()) return

    const col = (re: RegExp) => {
      const m = codePart.match(re)
      const start = m ? codePart.indexOf(m[0]) + 1 : 1
      return { startColumn: start, endColumn: m ? start + m[0].length : raw.length + 1 }
    }

    // page.click(...) / locator.fill(...) / request.get(...) without await.
    // Judged on the statement's first word, so `await x.click()`,
    // `const p = page.waitForResponse()` and chained continuation lines pass.
    const stmt = codePart.trimStart()
    const startsPlain = /^[A-Za-z_$][\w$]*\s*[.(]/.test(stmt) && !/^(await|return|const|let|var|expect|test|describe|if|for|while|switch|throw|yield|new|typeof|function|async|console)\b/.test(stmt)
    if (startsPlain && new RegExp(`\\.(${ASYNC_ACTIONS})\\(`).test(stmt)) {
      issues.push({ line: n, ...col(/\.\w+\(/), severity: "warning", message: "Missing await: this step returns a Promise and won't finish before the next line runs." })
    }

    // expect(locator).toBeVisible() without await — the check never happens
    if (new RegExp(`^\\s*expect(\\.soft)?\\(.*\\)\\s*(\\.not)?\\.(${WEB_FIRST})\\(`).test(codePart)) {
      issues.push({ line: n, ...col(new RegExp(`\\.(${WEB_FIRST})\\(`)), severity: "warning", message: "Missing await before expect(): this check waits and retries, so it must be awaited." })
    }

    if (/\.waitForTimeout\s*\(/.test(codePart)) {
      issues.push({ line: n, ...col(/\.waitForTimeout\s*\(/), severity: "warning", message: "Fixed waits make tests slow and flaky. Wait for something specific instead, e.g. await expect(locator).toBeVisible()." })
    }
    if (/\btest(\.describe)?\.only\s*\(/.test(codePart)) {
      issues.push({ line: n, ...col(/\.only\s*\(/), severity: "warning", message: ".only runs just this test. Remove it before saving." })
    }
    if (/["'`]xpath=|["'`]\/\/\w/.test(codePart)) {
      issues.push({ line: n, ...col(/xpath=|\/\/\w/), severity: "info", message: "XPath breaks easily when the page changes. Prefer page.getByRole(), getByLabel() or getByTestId()." })
    }
    if (/:nth-(child|of-type)\(/.test(codePart)) {
      issues.push({ line: n, ...col(/:nth-(child|of-type)\(/), severity: "info", message: "Position-based selectors break when the layout changes. Prefer a role, label or test id." })
    }
    if (/\bconsole\.log\(.*password/i.test(codePart)) {
      issues.push({ line: n, ...col(/console\.log/), severity: "warning", message: "Don't log passwords: run logs are stored and shown to the team." })
    }
  })

  return issues
}

export interface EditorSnippet {
  label: string
  /** Shown next to the label in the suggestion list and the Snippets menu. */
  detail: string
  /** Monaco snippet syntax: ${1:placeholder}, $0 = final cursor. */
  insertText: string
  group: "Test" | "Find & act" | "Check" | "API" | "Advanced"
}

export const PLAYWRIGHT_SNIPPETS: EditorSnippet[] = [
  { group: "Test", label: "test", detail: "New test", insertText: 'test("${1:does something}", async ({ page }) => {\n\t$0\n})' },
  { group: "Test", label: "describe", detail: "Group of tests", insertText: 'test.describe("${1:Feature}", () => {\n\ttest.beforeEach(async ({ page }) => {\n\t\tawait page.goto("${2:https://example.com}")\n\t})\n\n\ttest("${3:does something}", async ({ page }) => {\n\t\t$0\n\t})\n})' },
  { group: "Test", label: "beforeEach", detail: "Run before every test", insertText: "test.beforeEach(async ({ page }) => {\n\t$0\n})" },
  { group: "Test", label: "step", detail: "Named step (shows in the report)", insertText: 'await test.step("${1:step name}", async () => {\n\t$0\n})' },
  { group: "Find & act", label: "goto", detail: "Open a page", insertText: 'await page.goto("${1:https://example.com}")' },
  { group: "Find & act", label: "click button", detail: "Click a button by its text", insertText: 'await page.getByRole("button", { name: "${1:Save}" }).click()' },
  { group: "Find & act", label: "click link", detail: "Click a link by its text", insertText: 'await page.getByRole("link", { name: "${1:Sign in}" }).click()' },
  { group: "Find & act", label: "fill by label", detail: "Type into a field by its label", insertText: 'await page.getByLabel("${1:Email}").fill("${2:user@example.com}")' },
  { group: "Find & act", label: "fill by placeholder", detail: "Type into a field by its placeholder", insertText: 'await page.getByPlaceholder("${1:Search}").fill("${2:text}")' },
  { group: "Find & act", label: "select option", detail: "Choose from a dropdown", insertText: 'await page.getByLabel("${1:Country}").selectOption({ label: "${2:Egypt}" })' },
  { group: "Find & act", label: "check box", detail: "Tick a checkbox", insertText: 'await page.getByLabel("${1:I agree}").check()' },
  { group: "Find & act", label: "press key", detail: "Press Enter / Tab / …", insertText: 'await page.getByLabel("${1:Search}").press("${2:Enter}")' },
  { group: "Find & act", label: "upload file", detail: "Upload a file", insertText: 'await page.getByLabel("${1:Upload}").setInputFiles("${2:path/to/file.pdf}")' },
  { group: "Find & act", label: "by test id", detail: "Find by data-testid", insertText: 'page.getByTestId("${1:submit-button}")' },
  { group: "Check", label: "expect visible", detail: "Element is shown", insertText: 'await expect(page.getByText("${1:Welcome}")).toBeVisible()' },
  { group: "Check", label: "expect hidden", detail: "Element is not shown", insertText: 'await expect(page.getByText("${1:Loading}")).toBeHidden()' },
  { group: "Check", label: "expect text", detail: "Element contains text", insertText: 'await expect(page.getByRole("${1:heading}")).toContainText("${2:Dashboard}")' },
  { group: "Check", label: "expect URL", detail: "Page URL matches", insertText: "await expect(page).toHaveURL(/${1:dashboard}/)" },
  { group: "Check", label: "expect title", detail: "Page title matches", insertText: "await expect(page).toHaveTitle(/${1:Home}/)" },
  { group: "Check", label: "expect value", detail: "Field has value", insertText: 'await expect(page.getByLabel("${1:Email}")).toHaveValue("${2:user@example.com}")' },
  { group: "Check", label: "expect count", detail: "Number of elements", insertText: 'await expect(page.getByRole("${1:listitem}")).toHaveCount(${2:3})' },
  { group: "Check", label: "expect checked", detail: "Checkbox is ticked", insertText: 'await expect(page.getByLabel("${1:Remember me}")).toBeChecked()' },
  { group: "API", label: "api get", detail: "GET request + checks", insertText: 'test("${1:GET returns data}", async ({ request }) => {\n\tconst res = await request.get("${2:https://dummyjson.com/users/1}")\n\texpect(res.status()).toBe(200)\n\n\tconst body = await res.json()\n\texpect(body).toHaveProperty("${3:id}")$0\n})' },
  { group: "API", label: "api post", detail: "POST JSON + checks", insertText: 'test("${1:POST creates an item}", async ({ request }) => {\n\tconst res = await request.post("${2:https://dummyjson.com/posts/add}", {\n\t\tdata: { ${3:title: "New item", userId: 1} },\n\t})\n\texpect(res.status()).toBe(201)\n\n\tconst body = await res.json()\n\texpect(body.id).toBeTruthy()$0\n})' },
  { group: "Advanced", label: "mock api", detail: "Fake a network response", insertText: 'await page.route("**/${1:api/items}", (route) =>\n\troute.fulfill({ json: ${2:[{ id: 1, name: "Mocked" }]} })\n)' },
  { group: "Advanced", label: "wait for response", detail: "Wait for a request to finish", insertText: 'const response = page.waitForResponse("**/${1:api/save}")\nawait page.getByRole("button", { name: "${2:Save}" }).click()\nexpect((await response).ok()).toBeTruthy()' },
  { group: "Advanced", label: "mobile viewport", detail: "Run this file at phone size", insertText: "test.use({ viewport: { width: ${1:390}, height: ${2:844} } })" },
  { group: "Advanced", label: "dialog accept", detail: "Accept alert/confirm dialogs", insertText: 'page.on("dialog", (dialog) => dialog.accept())' },
  { group: "Advanced", label: "env secret", detail: "Read a password from settings", insertText: 'process.env.${1:APP_PASSWORD} ?? ""' },
]
