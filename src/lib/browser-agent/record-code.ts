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
  /** remember: keep the word after this fixed text (instead of the element's whole text). */
  after?: string
  /** "Recording as": the user whose browser did this (own context in the code). */
  user?: string
}

const jsStr = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`
const pyStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
const dataRef = (v: string) => v.match(/^\{([\p{L}\p{N}_-]+)\}$/u)?.[1]
const ident = (s: string) => s.replace(/[^\p{L}\p{N}_]/gu, "_").replace(/^(\d)/, "_$1")
const FIELD = /\.(?:getByRole\('(?:textbox|searchbox|spinbutton)'|getByLabel|getByPlaceholder)/

/** What the generated code needs to know across lines. */
interface Ctx {
  /** {name} values saved from the page earlier in the test (local variables, not environment). */
  saved: Set<string>
  multi: boolean
}

const camel = (s: string) => ident(s).replace(/_+(\w)/g, (_, c: string) => c.toUpperCase())
const jsPage = (a: RecordedAction, c: Ctx) => (c.multi && a.user ? `${camel(a.user)}Page` : "page")
const pyPage = (a: RecordedAction, c: Ctx) => (c.multi && a.user ? `${ident(a.user).toLowerCase()}_page` : "page")

function jsValue(v: string, c: Ctx) {
  const name = dataRef(v)
  if (name && c.saved.has(name)) return camel(name)
  return name ? `process.env.${ident(name).toUpperCase()} ?? ''` : jsStr(v)
}
function pyValue(v: string, c: Ctx) {
  const name = dataRef(v)
  if (name && c.saved.has(name)) return ident(name)
  return name ? `os.environ.get(${pyStr(ident(name).toUpperCase())}, "")` : pyStr(v)
}

function jsLine(a: RecordedAction, c: Ctx): string {
  const p = jsPage(a, c)
  const loc = a.locator ? `${p}.${a.locator.replace(/^page\./, "")}` : null
  const v = a.value ?? ""
  if (a.action === "remember" && a.after) {
    return `const ${camel(v)} = ((await ${p}.getByText(${jsStr(a.after)}).first().innerText()).split(${jsStr(a.after)})[1] ?? '').trim().split(/\\s+/)[0].replace(/[.,;:!?]+$/, '');`
  }
  switch (a.action) {
    case "goto":
      return `await ${p}.goto(${jsStr(v)});`
    case "press":
      return `await ${p}.keyboard.press(${jsStr(v.replace(/^\w/, (ch) => ch.toUpperCase()))});`
    case "verify-text":
      return `await expect(${p}.getByText(${jsStr(v)}).first()).toBeVisible();`
  }
  if (!loc) return `// ${a.sentence}`
  switch (a.action) {
    case "click":
      return `await ${loc}.click();`
    case "fill":
      return `await ${loc}.fill(${jsValue(v, c)});`
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
    case "remember":
      return `const ${camel(v)} = ${FIELD.test(`.${a.locator}`) ? `await ${loc}.inputValue()` : `(await ${loc}.innerText()).trim()`};`
  }
  return `// ${a.sentence}`
}

function pyLine(a: RecordedAction, c: Ctx): string {
  const p = pyPage(a, c)
  const loc = a.locator ? jsLocatorToPython(a.locator).replace(/^page\./, `${p}.`) : null
  const v = a.value ?? ""
  if (a.action === "remember" && a.after) {
    return `${ident(v)} = (${p}.get_by_text(${pyStr(a.after)}).first.inner_text().split(${pyStr(a.after)}, 1)[-1].split() or [""])[0].rstrip(".,;:!?")`
  }
  switch (a.action) {
    case "goto":
      return `${p}.goto(${pyStr(v)})`
    case "press":
      return `${p}.keyboard.press(${pyStr(v.replace(/^\w/, (ch) => ch.toUpperCase()))})`
    case "verify-text":
      return `expect(${p}.get_by_text(${pyStr(v)}).first).to_be_visible()`
  }
  if (!loc) return `# ${a.sentence}`
  switch (a.action) {
    case "click":
      return `${loc}.click()`
    case "fill":
      return `${loc}.fill(${pyValue(v, c)})`
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
    case "remember":
      return `${ident(v)} = ${FIELD.test(`.${a.locator}`) ? `${loc}.input_value()` : `${loc}.inner_text().strip()`}`
  }
  return `# ${a.sentence}`
}

/** Users of the recording in order; "" is the first (default) page. */
function users(actions: RecordedAction[]) {
  const list: string[] = []
  for (const a of actions) if (a.user && !list.includes(a.user)) list.push(a.user)
  return list
}

/** Emits lines in order, tracking saved values so later lines use the variable. */
function body(actions: RecordedAction[], c: Ctx, line: (a: RecordedAction, c: Ctx) => string) {
  return actions.map((a) => {
    const out = line(a, c)
    if (a.action === "remember" && a.value) c.saved.add(a.value)
    return out
  })
}

export function toJavaScript(name: string, actions: RecordedAction[]): string {
  const us = users(actions)
  const c: Ctx = { saved: new Set(), multi: us.length > 0 }
  const usesDefault = actions.some((a) => !a.user)
  const fixtures = c.multi ? (usesDefault ? "{ page, browser }" : "{ browser }") : "{ page }"
  return [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test(${jsStr(name || "recorded test")}, async (${fixtures}) => {`,
    ...(c.multi ? [`  // Each user has their own browser context: their own login and cookies.`, ...us.map((u) => `  const ${camel(u)}Page = await (await browser.newContext()).newPage();`), ``] : []),
    ...body(actions, c, jsLine).map((l) => `  ${l}`),
    `});`,
    ``,
  ].join("\n")
}

export function toPython(name: string, actions: RecordedAction[]): string {
  const us = users(actions)
  const c: Ctx = { saved: new Set(), multi: us.length > 0 }
  const fn =
    "test_" +
    ((name || "recorded")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "recorded")
  const usesDefault = actions.some((a) => !a.user)
  const lines = body(actions, { ...c, saved: new Set() }, pyLine)
  const needsOs = lines.some((l) => l.includes("os.environ"))
  const params = c.multi ? (usesDefault ? "page: Page, browser: Browser" : "browser: Browser") : "page: Page"
  return [
    ...(needsOs ? ["import os", ""] : []),
    `from playwright.sync_api import ${c.multi ? "Browser, " : ""}Page, expect`,
    ``,
    ``,
    `def ${fn}(${params}) -> None:`,
    ...(c.multi ? [`    # Each user has their own browser context: their own login and cookies.`, ...us.map((u) => `    ${ident(u).toLowerCase()}_page = browser.new_context().new_page()`), ``] : []),
    ...(lines.length ? lines.map((l) => `    ${l}`) : ["    pass"]),
    ``,
  ].join("\n")
}
