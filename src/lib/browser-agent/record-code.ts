/**
 * Recorded Browser Agent actions as Playwright code: a JavaScript test
 * (@playwright/test) or a Python pytest-playwright test.
 */
import { jsLocatorToPython, type RecordAction } from "./snapshot"

export interface RecordedAction {
  action: RecordAction
  /** Plain-English step (the no-code test). */
  sentence: string
  /** JavaScript locator without "page." (from generate-locator, or a role locator). */
  locator?: string
  value?: string
}

const jsStr = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`
const pyStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
const dataRef = (v: string) => v.match(/^\{([\p{L}\p{N}_]+)\}$/u)?.[1]

function jsValue(v: string) {
  const name = dataRef(v)
  return name ? `process.env.${name.toUpperCase()} ?? ''` : jsStr(v)
}
function pyValue(v: string) {
  const name = dataRef(v)
  return name ? `os.environ.get(${pyStr(name.toUpperCase())}, "")` : pyStr(v)
}

function jsLine(a: RecordedAction): string {
  const loc = a.locator ? `page.${a.locator.replace(/^page\./, "")}` : null
  const v = a.value ?? ""
  switch (a.action) {
    case "goto":
      return `await page.goto(${jsStr(v)});`
    case "press":
      return `await page.keyboard.press(${jsStr(v.replace(/^\w/, (c) => c.toUpperCase()))});`
    case "verify-text":
      return `await expect(page.getByText(${jsStr(v)}).first()).toBeVisible();`
  }
  if (!loc) return `// ${a.sentence}`
  switch (a.action) {
    case "click":
      return `await ${loc}.click();`
    case "fill":
      return `await ${loc}.fill(${jsValue(v)});`
    case "select":
      return `await ${loc}.selectOption(${jsStr(v)});`
    case "check":
      return `await ${loc}.check();`
    case "uncheck":
      return `await ${loc}.uncheck();`
    case "hover":
      return `await ${loc}.hover();`
    case "verify-visible":
      return `await expect(${loc}).toBeVisible();`
  }
  return `// ${a.sentence}`
}

function pyLine(a: RecordedAction): string {
  const loc = a.locator ? jsLocatorToPython(a.locator) : null
  const v = a.value ?? ""
  switch (a.action) {
    case "goto":
      return `page.goto(${pyStr(v)})`
    case "press":
      return `page.keyboard.press(${pyStr(v.replace(/^\w/, (c) => c.toUpperCase()))})`
    case "verify-text":
      return `expect(page.get_by_text(${pyStr(v)}).first).to_be_visible()`
  }
  if (!loc) return `# ${a.sentence}`
  switch (a.action) {
    case "click":
      return `${loc}.click()`
    case "fill":
      return `${loc}.fill(${pyValue(v)})`
    case "select":
      return `${loc}.select_option(${pyStr(v)})`
    case "check":
      return `${loc}.check()`
    case "uncheck":
      return `${loc}.uncheck()`
    case "hover":
      return `${loc}.hover()`
    case "verify-visible":
      return `expect(${loc}).to_be_visible()`
  }
  return `# ${a.sentence}`
}

export function toJavaScript(name: string, actions: RecordedAction[]): string {
  return [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test(${jsStr(name || "recorded test")}, async ({ page }) => {`,
    ...actions.map((a) => `  ${jsLine(a)}`),
    `});`,
    ``,
  ].join("\n")
}

export function toPython(name: string, actions: RecordedAction[]): string {
  const fn =
    "test_" +
    ((name || "recorded")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "recorded")
  const needsOs = actions.some((a) => a.action === "fill" && dataRef(a.value ?? ""))
  return [
    ...(needsOs ? ["import os", ""] : []),
    `from playwright.sync_api import Page, expect`,
    ``,
    ``,
    `def ${fn}(page: Page) -> None:`,
    ...(actions.length ? actions.map((a) => `    ${pyLine(a)}`) : ["    pass"]),
    ``,
  ].join("\n")
}
