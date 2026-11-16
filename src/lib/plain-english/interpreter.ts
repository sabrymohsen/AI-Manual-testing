/**
 * Run a plain-English step in Playwright. Server/worker only.
 *
 * The sentence is parsed by the same deterministic grammar the editor uses, at
 * run time, from the step's own text — so what a person reads in the test case is
 * exactly what runs. No AI is involved here.
 *
 * State that lives across steps of one run (variables, the implicit wait, which
 * tab is active, the last API reply) is kept per Playwright Page in a WeakMap,
 * so executeStep keeps its signature and every caller of it gets this for free.
 */
import type { Locator, Page } from "playwright"
import { ensureEvaluateShim } from "@/lib/playwright/evaluate-shim"
import { parseStep, type Command, type Comparison, type ElementKind, type Target } from "./grammar"

export interface PlainEnglishContext {
  variables: Record<string, unknown>
  implicitWaitMs: number
  activePage: Page | null
  /** Filled in by the runner so checkpoints know where they belong. */
  projectId?: string
  testCaseId?: string
  testRunId?: string
  lastStatus?: number | null
  /** The test's steps in order, so a step can see whether the NEXT one handles a browser dialog. */
  steps?: { id?: string; actionDescription?: string; actionMetadata?: any }[]
  /** What to do with a dialog the moment it opens. Playwright stalls the triggering action until it is handled. */
  dialogPolicy: "accept" | "dismiss"
  lastDialog: { message: string; accepted: boolean } | null
}

const contexts = new WeakMap<Page, PlainEnglishContext>()

export function getPlainEnglishContext(page: Page): PlainEnglishContext {
  let ctx = contexts.get(page)
  if (!ctx) {
    ctx = { variables: {}, implicitWaitMs: 10_000, activePage: null, dialogPolicy: "dismiss", lastDialog: null }
    contexts.set(page, ctx)
    const c = ctx
    const onDialog = (d: import("playwright").Dialog) => {
      const accept = c.dialogPolicy === "accept"
      c.lastDialog = { message: d.message(), accepted: accept }
      ;(accept ? d.accept() : d.dismiss()).catch(() => {})
    }
    page.on("dialog", onDialog)
    // Tabs opened later (a link with target=_blank, "Open a new tab") get the same handling.
    page.context().on("page", p => p.on("dialog", onDialog))
    // Remember the HTTP status of each top-level navigation for "Verify that the status of the page is 401".
    page.on("response", res => {
      try {
        if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) ctx!.lastStatus = res.status()
      } catch {}
    })
  }
  return ctx
}

export function setPlainEnglishContext(page: Page, patch: Partial<PlainEnglishContext>): void {
  const ctx = getPlainEnglishContext(page)
  Object.assign(ctx, { ...patch, variables: { ...ctx.variables, ...(patch.variables || {}) } })
}

export function isPlainEnglishStep(step: { actionMetadata?: any }): boolean {
  const meta = typeof step.actionMetadata === "string" ? safeJson(step.actionMetadata) : step.actionMetadata
  return !!meta && meta.plainEnglish === true
}

function safeJson(s: string) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// ─── Variables ───────────────────────────────────────────────────────────────

function lookup(vars: Record<string, unknown>, path: string): unknown {
  // {response.body.items[0].id}
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)
  let cur: any = vars
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[p]
  }
  return cur
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return ""
  return typeof v === "object" ? JSON.stringify(v) : String(v)
}

/** Replace {name} with its value. An unknown variable is an error, not an empty string. */
export function interpolate(text: string, vars: Record<string, unknown>, mode: "text" | "js" = "text"): string {
  return text.replace(/\{([A-Za-z_][\w-]*(?:(?:\.[\w-]+)|(?:\[\d+\]))*)\}/g, (whole, path: string) => {
    const value = lookup(vars, path)
    if (value === undefined) {
      // JSON bodies are full of braces; leave anything that is not a known name alone.
      if (mode === "text" && !/^[A-Za-z_][\w-]*$/.test(path.split(/[.[]/)[0])) return whole
      throw new Error(`The variable {${path}} has no value. Set it in an earlier step (Set variable ${path.split(/[.[]/)[0]} = "…") or in the test data.`)
    }
    return mode === "js" ? JSON.stringify(value) : stringify(value)
  })
}

// ─── Finding elements ────────────────────────────────────────────────────────

const ROLE_OF: Partial<Record<ElementKind, Parameters<Page["getByRole"]>[0]>> = {
  button: "button",
  link: "link",
  checkbox: "checkbox",
  radio: "radio",
  dropdown: "combobox",
  heading: "heading",
  tab: "tab",
  image: "img",
  option: "option",
  menuitem: "menuitem",
  row: "row",
}

const CANDIDATES_OF: Record<ElementKind, string> = {
  any: "a, button, input, select, textarea, label, [role], h1, h2, h3, h4, h5, h6, p, span, div, td, th, li",
  text: "p, span, div, td, th, li, dd, dt, strong, b, em, label, h1, h2, h3, h4, h5, h6, output, [role=status]",
  button: "button, [role=button], input[type=submit], input[type=button]",
  link: "a[href], [role=link]",
  field: "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, [contenteditable=true], [role=textbox]",
  checkbox: "input[type=checkbox], [role=checkbox], [role=switch]",
  radio: "input[type=radio], [role=radio]",
  dropdown: "select, [role=combobox], [role=listbox]",
  heading: "h1, h2, h3, h4, h5, h6, [role=heading]",
  tab: "[role=tab]",
  image: "img, svg, [role=img]",
  option: "option, [role=option]",
  menuitem: "[role=menuitem]",
  row: "tr, [role=row]",
}

function byName(page: Page, name: string, kind: ElementKind): Locator {
  const role = ROLE_OF[kind]
  if (kind === "field") {
    return page
      .getByLabel(name, { exact: false })
      .or(page.getByPlaceholder(name, { exact: false }))
      .or(page.getByRole("textbox", { name, exact: false }))
      .or(page.locator(`[name="${cssEscape(name)}"], #${cssIdent(name)}`))
  }
  if (kind === "dropdown") {
    return page.getByLabel(name, { exact: false }).or(page.getByRole("combobox", { name, exact: false })).or(page.locator(`select[name="${cssEscape(name)}"]`))
  }
  if (kind === "checkbox" || kind === "radio") {
    return page.getByRole(role!, { name, exact: false }).or(page.getByLabel(name, { exact: false }))
  }
  if (role) return page.getByRole(role, { name, exact: false })
  if (kind === "text") return page.getByText(name, { exact: false })
  // Anything: prefer what a person would click — buttons and links — then any visible text.
  return page
    .getByRole("button", { name, exact: false })
    .or(page.getByRole("link", { name, exact: false }))
    .or(page.getByRole("menuitem", { name, exact: false }))
    .or(page.getByRole("tab", { name, exact: false }))
    .or(page.getByLabel(name, { exact: false }))
    .or(page.getByText(name, { exact: false }))
}

function cssEscape(s: string) {
  return s.replace(/["\\]/g, "\\$&")
}
function cssIdent(s: string) {
  return /^[A-Za-z][\w-]*$/.test(s) ? s : "__no_such_id__"
}

async function pickVisible(locator: Locator, ordinal: number | undefined, timeoutMs: number, describe: string): Promise<Locator> {
  const visible = locator.filter({ visible: true })
  try {
    await visible.first().waitFor({ state: "visible", timeout: timeoutMs })
  } catch {
    throw new Error(`Could not find ${describe} on the page within ${Math.round(timeoutMs / 1000)} s.`)
  }
  if (!ordinal || ordinal === 1) return visible.first()
  if (ordinal === -1) return visible.last()
  const count = await visible.count()
  if (count < ordinal) throw new Error(`Only ${count} match(es) for ${describe}; the step asks for number ${ordinal}.`)
  return visible.nth(ordinal - 1)
}

/**
 * Relative targets: find the anchor text, then the nearest candidate of the
 * right kind in the requested direction. Distance is edge-to-edge, and a
 * candidate must overlap the anchor's column (below/above) or row (left/right),
 * so "the field below Email" is not the field below Password in the next column.
 */
async function resolveRelative(page: Page, target: Extract<Target, { by: "relative" }>, timeoutMs: number, vars: Record<string, unknown>): Promise<Locator> {
  const anchorText = interpolate(target.anchor, vars)
  const anchor = await pickVisible(page.getByText(anchorText, { exact: false }), 1, timeoutMs, `"${anchorText}"`)
  const box = await anchor.boundingBox()
  if (!box) throw new Error(`"${anchorText}" is on the page but not visible.`)
  const candidates = page.locator(CANDIDATES_OF[target.kind === "any" ? "any" : target.kind])
  const index: number = await candidates.evaluateAll(
    (els, args) => {
      const { a, relation, kind, anchorText } = args
      let best = -1
      let bestScore = Infinity
      els.forEach((el, i) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return
        const style = getComputedStyle(el as HTMLElement)
        if (style.visibility === "hidden" || style.display === "none") return
        // Skip the anchor itself and anything containing it.
        if ((el as HTMLElement).contains(document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2))) return
        const text = ((el as HTMLElement).innerText || (el as HTMLInputElement).value || "").trim()
        if ((kind === "text" || kind === "any") && (!text || text.length > 400 || text.includes(anchorText))) return
        // For text, prefer the innermost element: skip ones whose child elements carry all the text.
        if ((kind === "text" || kind === "any") && el.children.length > 0 && Array.from(el.children).some(ch => ((ch as HTMLElement).innerText || "").trim() === text)) return
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const overlapX = Math.min(r.right, a.x + a.width) - Math.max(r.left, a.x)
        const overlapY = Math.min(r.bottom, a.y + a.height) - Math.max(r.top, a.y)
        let d = Infinity
        if (relation === "below" && r.top >= a.y + a.height - 2 && overlapX > -40) d = r.top - (a.y + a.height) + Math.abs(cx - (a.x + a.width / 2)) * 0.2
        else if (relation === "above" && r.bottom <= a.y + 2 && overlapX > -40) d = a.y - r.bottom + Math.abs(cx - (a.x + a.width / 2)) * 0.2
        else if (relation === "rightOf" && r.left >= a.x + a.width - 2 && overlapY > -8) d = r.left - (a.x + a.width) + Math.abs(cy - (a.y + a.height / 2)) * 0.5
        else if (relation === "leftOf" && r.right <= a.x + 2 && overlapY > -8) d = a.x - r.right + Math.abs(cy - (a.y + a.height / 2)) * 0.5
        else if (relation === "near") d = Math.hypot(cx - (a.x + a.width / 2), cy - (a.y + a.height / 2))
        if (d < bestScore) {
          bestScore = d
          best = i
        }
      })
      return best
    },
    { a: box, relation: target.relation, kind: target.kind, anchorText }
  )
  if (index < 0) {
    const where = target.relation === "rightOf" ? "to the right of" : target.relation === "leftOf" ? "to the left of" : target.relation
    throw new Error(`Found "${anchorText}", but no ${target.kind === "any" ? "element" : target.kind} ${where} it.`)
  }
  return candidates.nth(index)
}

async function resolveTarget(page: Page, target: Target, ctx: PlainEnglishContext, timeoutMs: number): Promise<Locator> {
  const vars = ctx.variables
  switch (target.by) {
    case "css":
      return pickVisible(page.locator(interpolate(target.selector, vars)), 1, timeoutMs, `the element matching ${target.selector}`)
    case "testid":
      return pickVisible(page.getByTestId(interpolate(target.id, vars)), 1, timeoutMs, `test id "${target.id}"`)
    case "ordinal":
      return pickVisible(page.locator(CANDIDATES_OF[target.kind]), target.ordinal, timeoutMs, `the ${target.kind}`)
    case "relative":
      return resolveRelative(page, target, timeoutMs, vars)
    case "name": {
      const name = interpolate(target.name, vars)
      return pickVisible(byName(page, name, target.kind), target.ordinal, timeoutMs, `${target.kind === "any" ? "" : `the ${target.kind} `}"${name}"`)
    }
  }
}

// ─── Comparisons ─────────────────────────────────────────────────────────────

export function compareValues(actual: string, comparison: Comparison, expected: string): boolean {
  const a = actual.trim()
  const e = expected.trim()
  const num = (s: string) => parseFloat(s.replace(/[^\d.\-]/g, ""))
  switch (comparison) {
    case "equals":
      return a === e || a.replace(/\s+/g, " ").toLowerCase() === e.replace(/\s+/g, " ").toLowerCase()
    case "notEquals":
      return !compareValues(actual, "equals", expected)
    case "contains":
      return a.replace(/\s+/g, " ").toLowerCase().includes(e.replace(/\s+/g, " ").toLowerCase())
    case "notContains":
      return !compareValues(actual, "contains", expected)
    case "startsWith":
      return a.toLowerCase().startsWith(e.toLowerCase())
    case "endsWith":
      return a.toLowerCase().endsWith(e.toLowerCase())
    case "greaterThan":
      return num(a) > num(e)
    case "lessThan":
      return num(a) < num(e)
    case "matches": {
      const m = /^\/(.+)\/([a-z]*)$/.exec(e)
      const re = m ? new RegExp(m[1], m[2]) : new RegExp(e)
      return re.test(a)
    }
  }
}

const CMP_WORD: Record<Comparison, string> = {
  equals: "be", notEquals: "not be", contains: "contain", notContains: "not contain", startsWith: "start with",
  endsWith: "end with", greaterThan: "be greater than", lessThan: "be less than", matches: "match",
}

async function expectEventually(check: () => Promise<{ ok: boolean; actual: string }>, timeoutMs: number, message: (_actual: string) => string) {
  const deadline = Date.now() + timeoutMs
  let last = ""
  for (;;) {
    const r = await check()
    if (r.ok) return
    last = r.actual
    if (Date.now() > deadline) throw new Error(message(last))
    await new Promise(res => setTimeout(res, 250))
  }
}

// ─── Execution ───────────────────────────────────────────────────────────────

export interface PlainEnglishStepResult {
  skipped?: boolean
  note?: string
}

export async function executePlainEnglishStep(
  rootPage: Page,
  step: { id?: string; actionDescription?: string; timeoutMs?: number; inputValue?: string | null }
): Promise<PlainEnglishStepResult> {
  const text = step.actionDescription || ""
  const parsed = parseStep(text)
  if (!parsed.ok) throw new Error(`This step could not be understood: ${parsed.error}`)
  const ctx = getPlainEnglishContext(rootPage)
  const page = ctx.activePage && !ctx.activePage.isClosed() ? ctx.activePage : rootPage
  await ensureEvaluateShim(page)
  const timeout = Math.max(step.timeoutMs && step.timeoutMs !== 10000 ? step.timeoutMs : ctx.implicitWaitMs, 1000)

  // A dialog opens DURING the action that triggers it, before the next step
  // ("Accept the alert") runs. Decide now how the next dialog will be answered.
  if (parsed.command.type !== "dialog") {
    ctx.lastDialog = null
    const idx = ctx.steps?.findIndex(s => s.id && s.id === step.id) ?? -1
    const next = idx >= 0 ? ctx.steps![idx + 1] : undefined
    const nextParsed = next && isPlainEnglishStep(next) ? parseStep(next.actionDescription || "") : null
    ctx.dialogPolicy = nextParsed?.ok && nextParsed.command.type === "dialog" && nextParsed.command.accept ? "accept" : "dismiss"
  }

  try {
    await run(parsed.command, page, rootPage, ctx, timeout, step)
    return {}
  } catch (err: any) {
    if (parsed.optional) return { skipped: true, note: `Optional step skipped: ${err?.message || err}` }
    throw err
  }
}

async function run(cmd: Command, page: Page, rootPage: Page, ctx: PlainEnglishContext, timeout: number, step: { id?: string }): Promise<void> {
  const v = (s: string) => interpolate(s, ctx.variables)
  switch (cmd.type) {
    case "goto": {
      const res = await page.goto(v(cmd.url), { waitUntil: "domcontentloaded", timeout: Math.max(timeout, 30_000) })
      ctx.lastStatus = res?.status() ?? ctx.lastStatus
      await ensureEvaluateShim(page)
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {})
      return
    }
    case "back":
      await page.goBack({ timeout })
      return
    case "forward":
      await page.goForward({ timeout })
      return
    case "reload":
      await page.reload({ timeout: Math.max(timeout, 30_000) })
      return
    case "click": {
      const el = await resolveTarget(page, cmd.target, ctx, timeout)
      if (cmd.clickType === "double") await el.dblclick({ timeout })
      else if (cmd.clickType === "right") await el.click({ button: "right", timeout })
      else await el.click({ timeout }).catch(async err => {
        // An overlay (custom checkbox, styled button) can intercept a normal click.
        try {
          await el.click({ force: true, timeout: 3000 })
        } catch {
          throw err
        }
      })
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {})
      return
    }
    case "hover":
      await (await resolveTarget(page, cmd.target, ctx, timeout)).hover({ timeout })
      return
    case "type": {
      const value = cmd.value === "***" ? stringify(ctx.variables.password ?? "") : v(cmd.value)
      if (!cmd.target) {
        await page.keyboard.type(value)
        return
      }
      const el = await resolveTarget(page, cmd.target, ctx, timeout)
      if (cmd.append) await el.pressSequentially(value, { timeout })
      else await el.fill(value, { timeout })
      return
    }
    case "clear":
      await (await resolveTarget(page, cmd.target, ctx, timeout)).fill("", { timeout })
      return
    case "select": {
      const el = await resolveTarget(page, cmd.target, ctx, timeout)
      const tag = await el.evaluate(n => n.tagName.toLowerCase())
      const option = v(cmd.option)
      if (tag === "select") {
        if (option.startsWith("#")) {
          const values = await el.locator("option").evaluateAll(opts => opts.map(o => (o as HTMLOptionElement).value))
          const idx = parseInt(option.slice(1), 10) - 1
          if (!values[idx] && values[idx] !== "") throw new Error(`The dropdown has only ${values.length} options.`)
          await el.selectOption({ index: idx }, { timeout })
        } else {
          await el.selectOption({ label: option }, { timeout }).catch(() => el.selectOption(option, { timeout }))
        }
        return
      }
      // A custom dropdown: open it, then choose the option by its text.
      await el.click({ timeout })
      const opt = option.startsWith("#")
        ? page.getByRole("option").nth(parseInt(option.slice(1), 10) - 1)
        : page.getByRole("option", { name: option, exact: false }).or(page.locator("[role=listbox] *, .dropdown-menu *, ul li").filter({ hasText: option }))
      await (await pickVisible(opt, 1, timeout, `the option "${option}"`)).click({ timeout })
      return
    }
    case "check":
    case "uncheck": {
      const el = await resolveTarget(page, cmd.target, ctx, timeout)
      const want = cmd.type === "check"
      try {
        await el.setChecked(want, { timeout })
      } catch {
        // Styled toggles often hide the real input; click when the state is wrong.
        const now = await el.evaluate(n => (n as HTMLInputElement).checked ?? n.getAttribute("aria-checked") === "true").catch(() => !want)
        if (now !== want) await el.click({ force: true, timeout })
      }
      return
    }
    case "press":
      await page.keyboard.press(cmd.key)
      return
    case "scroll": {
      if (cmd.direction === "to") {
        await (await resolveTarget(page, cmd.target!, ctx, timeout)).scrollIntoViewIfNeeded({ timeout })
        return
      }
      await page.evaluate(
        ({ direction, pixels, half }) => {
          if (direction === "top") return window.scrollTo(0, 0)
          if (direction === "bottom") return window.scrollTo(0, document.documentElement.scrollHeight)
          const amount = pixels ?? (half ? window.innerHeight / 2 : window.innerHeight * 0.9)
          window.scrollBy(0, direction === "up" ? -amount : amount)
        },
        { direction: cmd.direction, pixels: cmd.pixels ?? null, half: !!cmd.half }
      )
      await page.waitForTimeout(250)
      return
    }
    case "wait":
      await page.waitForTimeout(cmd.ms)
      return
    case "implicitWait":
      ctx.implicitWaitMs = cmd.ms
      return
    case "waitFor": {
      const wait = cmd.timeoutMs ?? Math.max(timeout, 10_000)
      if (cmd.state === "visible") {
        await resolveTarget(page, cmd.target, ctx, wait)
      } else {
        const deadline = Date.now() + wait
        for (;;) {
          const stillThere = await resolveTarget(page, cmd.target, ctx, 500).then(() => true, () => false)
          if (!stillThere) return
          if (Date.now() > deadline) throw new Error(`Still visible after ${Math.round(wait / 1000)} s.`)
          await page.waitForTimeout(250)
        }
      }
      return
    }
    case "waitForUrl": {
      const expected = v(cmd.expected)
      await expectEventually(async () => ({ ok: compareValues(page.url(), cmd.comparison, expected), actual: page.url() }), cmd.timeoutMs ?? Math.max(timeout, 10_000), a => `Expected the address to ${CMP_WORD[cmd.comparison]} "${expected}", but it is ${a}.`)
      return
    }
    case "assertVisible": {
      if (!cmd.negate) {
        await resolveTarget(page, cmd.target, ctx, timeout)
        return
      }
      const found = await resolveTarget(page, cmd.target, ctx, 1500).then(() => true, () => false)
      if (found) throw new Error("Expected it not to be visible, but it is.")
      return
    }
    case "assertEnabled": {
      const el = await resolveTarget(page, cmd.target, ctx, timeout)
      const enabled = await el.isEnabled()
      if (enabled === cmd.negate) throw new Error(`Expected it to be ${cmd.negate ? "disabled" : "enabled"}, but it is ${enabled ? "enabled" : "disabled"}.`)
      return
    }
    case "assertChecked": {
      const el = await resolveTarget(page, cmd.target, ctx, timeout)
      const checked = await el.isChecked().catch(async () => (await el.getAttribute("aria-checked")) === "true")
      if (checked === cmd.negate) throw new Error(`Expected it to be ${cmd.negate ? "not ticked" : "ticked"}, but it is ${checked ? "ticked" : "not ticked"}.`)
      return
    }
    case "assertText": {
      const expected = v(cmd.expected)
      if (!cmd.target) {
        await expectEventually(async () => {
          const body = await page.locator("body").innerText().catch(() => "")
          return { ok: compareValues(body, cmd.comparison, expected), actual: body.slice(0, 120) }
        }, timeout, () => `Expected the page to ${CMP_WORD[cmd.comparison]} "${expected}".`)
        return
      }
      const el = await resolveTarget(page, cmd.target, ctx, timeout)
      await expectEventually(async () => {
        const actual = ((await el.innerText().catch(() => "")) || (await el.inputValue().catch(() => "")) || "").trim()
        return { ok: compareValues(actual, cmd.comparison, expected), actual }
      }, Math.min(timeout, 5000), a => `Expected the text to ${CMP_WORD[cmd.comparison]} "${expected}", but it is "${a.slice(0, 200)}".`)
      return
    }
    case "assertUrl": {
      const expected = v(cmd.expected)
      await expectEventually(async () => ({ ok: compareValues(page.url(), cmd.comparison, expected), actual: page.url() }), Math.min(timeout, 5000), a => `Expected the address to ${CMP_WORD[cmd.comparison]} "${expected}", but it is ${a}.`)
      return
    }
    case "assertTitle": {
      const expected = v(cmd.expected)
      await expectEventually(async () => {
        const title = await page.title()
        return { ok: compareValues(title, cmd.comparison, expected), actual: title }
      }, Math.min(timeout, 5000), a => `Expected the title to ${CMP_WORD[cmd.comparison]} "${expected}", but it is "${a}".`)
      return
    }
    case "assertStatus":
      if (ctx.lastStatus !== cmd.status) throw new Error(`Expected the page to answer HTTP ${cmd.status}, but it answered ${ctx.lastStatus ?? "nothing yet"}.`)
      return
    case "assertValue": {
      const left = cmd.left.startsWith("{") ? v(cmd.left) : cmd.left
      const right = v(cmd.right)
      if (!compareValues(left, cmd.comparison, right)) throw new Error(`Expected ${cmd.left} ("${left.slice(0, 200)}") to ${CMP_WORD[cmd.comparison]} "${right}".`)
      return
    }
    case "setVariable": {
      let value: unknown
      if (cmd.source.from === "literal") value = v(cmd.source.value)
      else if (cmd.source.from === "url") value = page.url()
      else if (cmd.source.from === "title") value = await page.title()
      else {
        const el = await resolveTarget(page, cmd.source.target, ctx, timeout)
        value = ((await el.inputValue().catch(() => null)) ?? (await el.innerText())).trim()
      }
      ctx.variables[cmd.name] = value
      return
    }
    case "executeJs": {
      const code = interpolate(cmd.code, ctx.variables, "js")
      // An expression returns its value; statements run as a function body.
      const wrapped = /^\s*(return\b|const\b|let\b|var\b|if\b|for\b|while\b|function\b)|;\s*\S/.test(code) ? `(async () => { ${code} })()` : `(async () => (${code}))()`
      ctx.variables["js-result"] = await page.evaluate(wrapped)
      return
    }
    case "api": {
      const url = v(cmd.url).startsWith("/") ? new URL(v(cmd.url), page.url()).toString() : v(cmd.url)
      const headers = Object.fromEntries(Object.entries(cmd.headers).map(([k, val]) => [k, v(val)]))
      const body = cmd.body !== null ? v(cmd.body) : undefined
      // page.request shares the browser's cookies, so a signed-in UI session can call its own API.
      const res = await page.request.fetch(url, { method: cmd.method, headers, data: body, timeout: Math.max(timeout, 30_000), failOnStatusCode: false })
      const raw = await res.text()
      let parsedBody: unknown = raw
      try {
        parsedBody = JSON.parse(raw)
      } catch {}
      ctx.variables.response = { status: res.status(), headers: res.headers(), body: parsedBody, text: raw }
      return
    }
    case "upload": {
      const el = await resolveTarget(page, cmd.target, ctx, timeout).catch(() => null)
      const input = el && (await el.evaluate(n => n.tagName === "INPUT" && (n as HTMLInputElement).type === "file")) ? el : page.locator("input[type=file]").first()
      const path = await import("node:path")
      const file = v(cmd.file)
      const candidates = [file, path.join(process.env.STORAGE_ROOT || "./storage", "test-files", file), path.join(process.cwd(), "storage", "test-files", file)]
      const fs = await import("node:fs")
      const found = candidates.find(c => fs.existsSync(c))
      if (!found) throw new Error(`The file "${file}" was not found. Put it in storage/test-files/ so every run can reach it.`)
      await input.setInputFiles(found, { timeout })
      return
    }
    case "dialog": {
      // Usually the dialog was already answered while the previous step ran (see dialogPolicy).
      ctx.dialogPolicy = cmd.accept ? "accept" : "dismiss"
      if (!ctx.lastDialog && !cmd.ifVisible) {
        await page.waitForEvent("dialog", { timeout: Math.min(timeout, 5000) }).catch(() => {})
      }
      const seen = ctx.lastDialog
      ctx.lastDialog = null
      ctx.dialogPolicy = "dismiss"
      if (!seen && !cmd.ifVisible) throw new Error("No browser dialog appeared.")
      if (seen && seen.accepted !== cmd.accept) {
        throw new Error(`The dialog "${seen.message.slice(0, 120)}" was ${seen.accepted ? "accepted" : "dismissed"} before this step could answer it.`)
      }
      return
    }
    case "newTab": {
      const newPage = await page.context().newPage()
      if (cmd.url) await newPage.goto(v(cmd.url), { waitUntil: "domcontentloaded", timeout: Math.max(timeout, 30_000) })
      ctx.activePage = newPage
      return
    }
    case "switchTab": {
      // A link with target=_blank opens its tab a moment after the click returns.
      if (cmd.index !== "first" && page.context().pages().filter(p => !p.isClosed()).length < (cmd.index === "last" ? 2 : cmd.index)) {
        await page.context().waitForEvent("page", { timeout: Math.min(timeout, 5000) }).catch(() => {})
      }
      const pages = page.context().pages().filter(p => !p.isClosed())
      const target = cmd.index === "last" ? pages[pages.length - 1] : cmd.index === "first" ? pages[0] : pages[cmd.index - 1]
      if (!target) throw new Error(`There are only ${pages.length} tab(s) open.`)
      await target.bringToFront()
      await target.waitForLoadState("domcontentloaded", { timeout: Math.max(timeout, 10_000) }).catch(() => {})
      ctx.activePage = target === rootPage ? null : target
      return
    }
    case "closeTab": {
      if (page === rootPage) throw new Error("This is the test's first tab; it cannot be closed while the test runs.")
      await page.close()
      ctx.activePage = null
      await rootPage.bringToFront().catch(() => {})
      return
    }
    case "checkpoint": {
      if (!ctx.projectId || !ctx.testCaseId) throw new Error("Visual checks run only as part of a test case run.")
      const { captureFlowCheckpoint } = await import("@/lib/visual-tests/checkpoint")
      await captureFlowCheckpoint(page, {
        projectId: ctx.projectId,
        testCaseId: ctx.testCaseId,
        testRunId: ctx.testRunId ?? null,
        stepId: step.id ?? `step-${Date.now()}`,
        name: cmd.name,
        fullPage: cmd.fullPage,
      })
      return
    }
  }
}
