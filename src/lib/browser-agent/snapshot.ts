/**
 * Reading playwright-cli page snapshots (the accessibility tree with [ref=eN]
 * tags), and turning an element into what a tester keeps: a Playwright
 * locator (JavaScript and Python) and a no-code Automation Hub step.
 *
 * Pure functions: used by the server (AI prompts) and the Browser Agent page.
 */

export interface SnapElement {
  ref: string
  role: string
  name: string
  /** Text after the colon: a field's value, a heading's text, etc. */
  value?: string
  level?: number
  checked?: boolean
  disabled?: boolean
  depth: number
}

/** Roles a tester acts on or checks. */
export const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "option",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "slider",
  "spinbutton",
  "treeitem",
])
export const CHECKABLE_ROLES = new Set(["heading", "cell", "row", "img", "alert", "status", "dialog"])

const FIELD_ROLES = new Set(["textbox", "searchbox", "spinbutton"])

function unquoteYaml(s: string): string {
  const t = s.trim()
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'")
  return t
}

/** Every element with a ref, in page order. */
export function parseSnapshot(yaml: string): SnapElement[] {
  const out: SnapElement[] = []
  if (typeof yaml !== "string") return out
  for (const line of yaml.split("\n")) {
    const m = line.match(/^(\s*)- (.*)$/)
    if (!m) continue
    let body = m[2]
    // A trailing ":" opens children; "...: value" carries the value (outside the quotes).
    let value: string | undefined
    const quotedWhole = body.match(/^('(?:[^']|'')*')(?::\s*(.*))?$/)
    if (quotedWhole) {
      value = quotedWhole[2]
      body = unquoteYaml(quotedWhole[1])
    } else {
      const v = body.match(/^(.*?\[ref=[^\]]+\](?:\s*\[[^\]]*\])*)\s*:\s*(.*)$/)
      if (v) {
        body = v[1]
        value = v[2]
      }
    }
    const ref = body.match(/\[ref=([^\]]+)\]/)?.[1]
    if (!ref) continue
    const head = body.match(/^([a-zA-Z]+)(?:\s+"((?:[^"\\]|\\.)*)")?/)
    if (!head) continue
    const el: SnapElement = {
      ref,
      role: head[1],
      // Icon-font glyphs (private-use characters) are not part of what a tester reads.
      name: (head[2] || "").replace(/\\"/g, '"').replace(/[\uE000-\uF8FF]/g, "").replace(/\s+/g, " ").trim(),
      depth: Math.floor(m[1].length / 2),
    }
    const level = body.match(/\[level=(\d+)\]/)?.[1]
    if (level) el.level = Number(level)
    if (/\[checked(?:=true)?\]/.test(body)) el.checked = true
    if (/\[disabled\]/.test(body)) el.disabled = true
    const v = value?.trim()
    if (v) el.value = unquoteYaml(v).replace(/^"(.*)"$/, "$1").replace(/[\uE000-\uF8FF]/g, "").trim() || undefined
    out.push(el)
  }
  return out
}

/** Elements worth listing to a tester: things to act on, and headings/alerts to check. */
/** Text on the page (to check or remember), listed when it says something. */
const TEXT_ROLES = new Set(["paragraph", "listitem", "strong", "emphasis", "code", "term", "definition", "caption", "time", "blockquote", "note", "text"])

export function listedElements(els: SnapElement[]): SnapElement[] {
  return els.filter((e) => INTERACTIVE_ROLES.has(e.role) || ((CHECKABLE_ROLES.has(e.role) || TEXT_ROLES.has(e.role)) && (e.name || e.value)))
}

/** The snapshot made compact for an AI prompt: no link targets or cursor hints, capped. */
export function compactSnapshot(yaml: string, limit = 12000): string {
  const lines = (yaml || "")
    .split("\n")
    .filter((l) => !/^\s*- \/url:/.test(l))
    .map((l) => l.replace(/ \[cursor=pointer\]/g, "").replace(/[-]/g, "").trimEnd())
    .filter((l) => l.trim() && l.trim() !== "-")
  let text = lines.join("\n")
  if (text.length > limit) text = text.slice(0, limit) + "\n… (page outline cut here)"
  return text
}

/** Hides secret test-data values that the page shows (e.g. a filled password field). */
export function redactSecrets(text: string, secrets: Record<string, string>): string {
  let out = text || ""
  for (const [name, value] of Object.entries(secrets)) {
    if (value && value.length >= 3) out = out.split(value).join(`{${name}}`)
  }
  return out
}

const jsStr = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
const pyStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`

/** Role locator built from the snapshot; null when the element has no accessible name. */
export function roleLocator(el: Pick<SnapElement, "role" | "name">, lang: "js" | "python"): string | null {
  if (!el.name) return null
  return lang === "js"
    ? `page.getByRole(${jsStr(el.role)}, { name: ${jsStr(el.name)} })`
    : `page.get_by_role(${pyStr(el.role)}, name=${pyStr(el.name)})`
}

/**
 * playwright-cli's generate-locator output (JavaScript, without "page.") as
 * Python: getByRole('x', { name: 'y' }) → get_by_role("x", name="y").
 */
export function jsLocatorToPython(js: string): string {
  let s = js.trim().replace(/^page\./, "")
  s = s.replace(/\bget([A-Z]\w*)\(/g, (_, w: string) => `get_${w.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()).replace(/^_/, "")}(`)
  s = s.replace(/\.nth\(/g, ".nth(").replace(/\.first\(\)/g, ".first").replace(/\.last\(\)/g, ".last")
  // { name: 'x', exact: true } → name="x", exact=True
  s = s.replace(/,\s*\{([^{}]*)\}\)/g, (_, inner: string) => {
    const kw = inner
      .split(/,(?=\s*\w+\s*:)/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [k, ...rest] = p.split(":")
        const v = rest.join(":").trim()
        const key = k.trim().replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())
        return `${key}=${v === "true" ? "True" : v === "false" ? "False" : v}`
      })
    return `, ${kw.join(", ")})`
  })
  s = s.replace(/\{\s*hasText:\s*([^}]+?)\s*\}/g, "has_text=$1")
  // Single-quoted JS strings → double-quoted Python strings.
  s = s.replace(/'((?:[^'\\]|\\.)*)'/g, (_, body: string) => `"${body.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`)
  return `page.${s}`
}

export type RecordAction = "click" | "fill" | "select" | "check" | "uncheck" | "hover" | "verify-visible" | "verify-text" | "press" | "goto" | "remember"

const q = (s: string) => `"${s.replace(/"/g, "'")}"`

/** The no-code step (Automation Hub plain English) for a recorded action. */
export function stepSentence(action: RecordAction, el: Pick<SnapElement, "role" | "name" | "value"> | null, value?: string): string | null {
  const label = el?.name || el?.value || ""
  switch (action) {
    case "goto":
      return value ? `Go to ${q(value)}` : null
    case "press":
      return value ? `Press ${value.replace(/^\w/, (c) => c.toUpperCase())}` : null
    case "verify-text":
      return value ? `Verify that the page contains ${q(value)}` : null
  }
  if (!label) return null
  switch (action) {
    case "click":
      if (el!.role === "button") return `Click the ${q(label)} button`
      if (el!.role === "link") return `Click the ${q(label)} link`
      return `Click ${q(label)}`
    case "fill": {
      const v = value ?? ""
      const typed = /^\{[\p{L}\p{N}_ -]+\}$/u.test(v) ? v : q(v)
      return `Type ${typed} in the ${q(label)} field`
    }
    case "select":
      return value ? `Select ${q(value)} from the ${q(label)} dropdown` : null
    case "check":
      return `Check the ${q(label)} checkbox`
    case "uncheck":
      return `Uncheck the ${q(label)} checkbox`
    case "hover":
      return `Hover over ${q(label)}`
    case "verify-visible":
      return el!.role === "heading" ? `Verify that the ${q(label)} heading is visible` : `Verify that ${q(label)} is visible`
    case "remember": {
      // value = the variable name; later steps use it as {name}.
      if (!value) return null
      const plan = rememberPlan(el!)
      if (plan.after) return `Save the text after ${q(plan.after)} as {${value}}`
      const kind = el!.role === "heading" ? " heading" : el!.role === "link" ? " link" : FIELD_ROLES.has(el!.role) ? " field" : ""
      return `Save the text of ${kind ? "the " : ""}${q(label)}${kind} as {${value}}`
    }
  }
  return null
}

/**
 * How to remember an element's text so a replay finds it again: text like
 * "Your request number is REQ-1042" changes every run, so keep the word after
 * the fixed part ("Your request number is"). Otherwise the element's own text.
 */
export function rememberPlan(el: Pick<SnapElement, "role" | "name" | "value">): { value: string; after?: string } {
  const text = (el.value || el.name || "").replace(/\s+/g, " ").trim()
  const words = text.split(" ")
  const i = words.findIndex((w) => /\d/.test(w))
  const prefix = i > 0 ? words.slice(0, i).join(" ").replace(/[\s:#=\-–—]+$/, "") : ""
  if (prefix.length >= 3 && /\p{L}/u.test(prefix) && !FIELD_ROLES.has(el.role)) {
    return { value: words[i].replace(/^[#:]+/, "").replace(/[.,;:!?)\]"'»]+$/, ""), after: prefix }
  }
  return { value: text }
}

/** Prefixes a step with the user who does it ("As reviewer: …"). */
export function asUser(sentence: string, user?: string | null): string {
  return user ? `As ${user}: ${sentence}` : sentence
}

/** Actions that make sense for an element (Record mode's menu). */
export function actionsFor(el: Pick<SnapElement, "role">): RecordAction[] {
  if (FIELD_ROLES.has(el.role)) return ["fill", "verify-visible", "click", "remember"]
  if (el.role === "combobox" || el.role === "listbox") return ["select", "fill", "click", "verify-visible"]
  if (el.role === "checkbox" || el.role === "switch" || el.role === "radio") return ["check", "uncheck", "verify-visible"]
  if (INTERACTIVE_ROLES.has(el.role)) return ["click", "hover", "verify-visible", "remember"]
  return ["verify-visible", "remember", "click"]
}

/** "- 0: (current) [Title](url)" from tab-list → the current page. */
export function currentTab(tabList: string): { title: string; url: string } | null {
  const m = (tabList || "").match(/\(current\)\s*\[(.*)\]\((\S+)\)/)
  return m ? { title: m[1], url: m[2] } : null
}
