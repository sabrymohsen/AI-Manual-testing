/**
 * Plain-English test steps: parse a sentence into a command, deterministically.
 * Browser-safe (the step editor parses as you type) and dependency-free.
 *
 * Why a grammar and not an LLM at run time: a test must do the same thing every
 * time it runs. AI may WRITE steps (see /plain-english/generate), but what runs
 * is always one of the commands below, decided by these rules. A sentence the
 * rules do not understand is an authoring error shown in the editor — never a
 * guess at execution time.
 *
 * The wording follows what testers already write (and what Applitools Autonomous
 * accepts), e.g.
 *   type "demo user" in the "Username" field
 *   Verify that the element below "Total Balance" contains 350
 *   Wait up to 20 seconds for the "Financial Overview" heading to appear
 *   Optionally click "Accept All"
 *   Set variable requestid = text to the right of "use this id to track your request"
 *   GET https://api.example.com/status?id={requestid} with header "accesskey: secret"
 *   Assert that {response.body.data.status} equals "SUBMITTED"
 */

export type ElementKind =
  | "any"
  | "button"
  | "link"
  | "field"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "heading"
  | "tab"
  | "image"
  | "text"
  | "option"
  | "menuitem"
  | "row"

export type Relation = "below" | "above" | "rightOf" | "leftOf" | "near"

export type Target =
  | { by: "name"; name: string; kind: ElementKind; ordinal?: number; exact?: boolean }
  | { by: "ordinal"; kind: ElementKind; ordinal: number }
  | { by: "relative"; kind: ElementKind; relation: Relation; anchor: string }
  | { by: "css"; selector: string }
  | { by: "testid"; id: string }

export type Comparison = "equals" | "contains" | "matches" | "startsWith" | "endsWith" | "greaterThan" | "lessThan" | "notEquals" | "notContains"

export type Command =
  | { type: "goto"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "click"; target: Target; clickType: "single" | "double" | "right" }
  | { type: "hover"; target: Target }
  | { type: "type"; value: string; target: Target | null; append: boolean }
  | { type: "clear"; target: Target }
  | { type: "select"; option: string; target: Target }
  | { type: "check" | "uncheck"; target: Target }
  | { type: "press"; key: string }
  | { type: "scroll"; direction: "up" | "down" | "top" | "bottom" | "to"; pixels?: number; half?: boolean; target?: Target }
  | { type: "wait"; ms: number }
  | { type: "waitFor"; target: Target; timeoutMs: number | null; state: "visible" | "hidden" }
  | { type: "waitForUrl"; comparison: Comparison; expected: string; timeoutMs: number | null }
  | { type: "implicitWait"; ms: number }
  | { type: "assertVisible"; target: Target; negate: boolean }
  | { type: "assertText"; target: Target | null; comparison: Comparison; expected: string }
  | { type: "assertUrl"; comparison: Comparison; expected: string }
  | { type: "assertTitle"; comparison: Comparison; expected: string }
  | { type: "assertStatus"; status: number }
  | { type: "assertValue"; left: string; comparison: Comparison; right: string }
  | { type: "assertEnabled"; target: Target; negate: boolean }
  | { type: "assertChecked"; target: Target; negate: boolean }
  | { type: "setVariable"; name: string; source: { from: "literal"; value: string } | { from: "element"; target: Target } | { from: "url" } | { from: "title" } }
  | { type: "executeJs"; code: string }
  | { type: "api"; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; url: string; headers: Record<string, string>; body: string | null }
  | { type: "upload"; file: string; target: Target }
  | { type: "dialog"; accept: boolean; ifVisible: boolean }
  | { type: "newTab"; url: string | null }
  | { type: "switchTab"; index: number | "last" | "first" }
  | { type: "closeTab" }
  | { type: "checkpoint"; name: string | null; fullPage: boolean | null }

export interface ParsedStep {
  ok: true
  command: Command
  optional: boolean
  /** Human-readable reading of what will happen, shown under the input. */
  meaning: string
  /** The sentence after auto-correction. */
  text: string
}

export interface ParseError {
  ok: false
  error: string
  text: string
  suggestion?: string
}

export type ParseResult = ParsedStep | ParseError

// ─── Normalisation & auto-correction ─────────────────────────────────────────

const VERBS = [
  "go", "navigate", "browse", "open", "visit", "click", "tap", "press", "hit", "double-click", "right-click", "hover", "type", "enter",
  "fill", "input", "write", "clear", "select", "choose", "pick", "check", "uncheck", "tick", "untick", "scroll", "wait", "pause", "delay",
  "verify", "assert", "expect", "confirm", "ensure", "set", "store", "save", "execute", "run", "upload", "attach", "accept", "dismiss",
  "cancel", "switch", "close", "refresh", "reload", "optionally", "visually", "get", "post", "put", "patch", "delete", "implicitly",
]

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length][b.length]
}

/** Fix what people type in a hurry: smart quotes, spacing, a misspelt first verb, a trailing full stop. */
export function normalizeSentence(input: string): string {
  let s = (input || "")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
  // A full stop at the end is punctuation, not part of a value — unless it closes a quote or a URL.
  if (/[^.]\.$/.test(s) && !/https?:\/\/\S+\.$/.test(s) && !/\d\.$/.test(s)) s = s.slice(0, -1).trimEnd()
  if (!s) return s

  const words = s.split(" ")
  const first = words[0].toLowerCase()
  if (!VERBS.includes(first) && /^[a-z-]{4,}$/.test(first)) {
    let best: string | null = null
    let bestD = 3
    for (const v of VERBS) {
      const d = levenshtein(first, v)
      if (d < bestD && d <= (v.length > 5 ? 2 : 1)) {
        best = v
        bestD = d
      }
    }
    if (best) words[0] = best
  }
  s = words.join(" ")
  s = s.replace(/\bin to\b/gi, "into").replace(/\bon to\b/gi, "onto")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Tokenising quoted values ────────────────────────────────────────────────

interface Tokenized {
  /** Sentence with each quoted value replaced by ⟦n⟧. */
  shape: string
  values: string[]
}

function tokenize(s: string): Tokenized | { error: string } {
  const values: string[] = []
  let shape = ""
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '"' || (ch === "'" && (i === 0 || /[\s(=:,]/.test(s[i - 1])))) {
      let end = i + 1
      while (end < s.length && !(s[end] === ch && s[end - 1] !== "\\")) end++
      if (end >= s.length) return { error: `A quote is opened but never closed: ${s.slice(i, i + 30)}` }
      // \" inside a value is a literal quote (JSON bodies).
      values.push(s.slice(i + 1, end).replace(new RegExp(`\\\\${ch}`, "g"), ch))
      shape += `⟦${values.length - 1}⟧`
      i = end + 1
      continue
    }
    shape += ch
    i++
  }
  return { shape, values }
}

// ─── Small vocabularies ──────────────────────────────────────────────────────

const ORDINALS: Record<string, number> = {
  first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5,
  sixth: 6, "6th": 6, seventh: 7, "7th": 7, eighth: 8, "8th": 8, ninth: 9, "9th": 9, tenth: 10, "10th": 10, last: -1,
}
const ORDINAL_RE = "(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\\d+(?:st|nd|rd|th))"

const KIND_WORDS: [RegExp, ElementKind][] = [
  [/^(button|btn)s?$/, "button"],
  [/^(link|hyperlink)s?$/, "link"],
  [/^(field|input|textbox|text box|text field|box|textarea|input field)s?$/, "field"],
  [/^(checkbox|check box|tick box)(es)?$/, "checkbox"],
  [/^(radio|radio button|option button)s?$/, "radio"],
  [/^(dropdown|drop-down|drop down|select|select box|combobox|combo box|list box|menu)s?$/, "dropdown"],
  [/^(heading|header|title)s?$/, "heading"],
  [/^tabs?$/, "tab"],
  [/^(image|icon|logo|picture)s?$/, "image"],
  [/^(text|label|message|element|item|value)s?$/, "text"],
  [/^options?$/, "option"],
  [/^(menu item|menuitem)s?$/, "menuitem"],
  [/^rows?$/, "row"],
]
const KIND_ALTERNATION =
  "(button|btn|link|hyperlink|input field|text field|text box|textbox|field|input|textarea|box|check box|checkbox|tick box|radio button|option button|radio|drop-down|drop down|dropdown|select box|select|combo box|combobox|list box|menu item|menuitem|menu|heading|header|title|tab|image|icon|logo|picture|text|label|message|element|item|value|option|row)"

function kindOf(word: string | undefined): ElementKind {
  if (!word) return "any"
  const w = word.toLowerCase().trim()
  for (const [re, kind] of KIND_WORDS) if (re.test(w)) return kind
  return "any"
}

const RELATION_RE = "(below|under|underneath|beneath|above|over|to the right of|right of|to the left of|left of|next to|near|beside|after|before)"
function relationOf(word: string): Relation {
  const w = word.toLowerCase()
  if (/below|under|beneath/.test(w)) return "below"
  if (/above|over/.test(w)) return "above"
  if (/right|after/.test(w)) return "rightOf"
  if (/left|before/.test(w)) return "leftOf"
  return "near"
}

const KEYS: Record<string, string> = {
  enter: "Enter", return: "Enter", tab: "Tab", escape: "Escape", esc: "Escape", space: "Space", spacebar: "Space",
  backspace: "Backspace", delete: "Delete", del: "Delete", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  "arrow up": "ArrowUp", "arrow down": "ArrowDown", "arrow left": "ArrowLeft", "arrow right": "ArrowRight",
  "up arrow": "ArrowUp", "down arrow": "ArrowDown", "left arrow": "ArrowLeft", "right arrow": "ArrowRight",
  home: "Home", end: "End", "page up": "PageUp", "page down": "PageDown", pageup: "PageUp", pagedown: "PageDown",
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────

class Ctx {
  readonly t: Tokenized
  constructor(t: Tokenized) {
    this.t = t
  }
  /** Resolve a raw fragment to a value: ⟦n⟧ → quoted text, {var} or bare word kept as written. */
  value(fragment: string | undefined): string | null {
    if (fragment === undefined) return null
    const f = fragment.trim()
    const m = /^⟦(\d+)⟧$/.exec(f)
    if (m) return this.t.values[Number(m[1])]
    if (!f) return null
    // A value may be a quoted piece plus text (rare); expand placeholders inline.
    return f.replace(/⟦(\d+)⟧/g, (_, n) => this.t.values[Number(n)])
  }
  isValue(fragment: string): boolean {
    const f = fragment.trim()
    return /^⟦\d+⟧$/.test(f) || /^\{[\w.\-\[\]]+\}$/.test(f) || /^\*{3}$/.test(f) || /^-?\d+(\.\d+)?$/.test(f)
  }
  expand(fragment: string): string {
    return fragment.replace(/⟦(\d+)⟧/g, (_, n) => `"${this.t.values[Number(n)]}"`)
  }
}

function secondsOrMs(amount: string, unit: string | undefined): number {
  const n = parseFloat(amount)
  const u = (unit || "seconds").toLowerCase()
  if (/^(ms|millisecond)/.test(u)) return Math.round(n)
  if (/^(m|min|minute)/.test(u)) return Math.round(n * 60_000)
  return Math.round(n * 1000)
}

const UNIT_RE = "(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?)"

/**
 * Parse the noun phrase naming an element. Accepts:
 *   "Sign in"                          → anything named Sign in
 *   the "Sign in" button               → a button named Sign in
 *   on the "Email" field               → leading "on"/"in"/"into" is dropped
 *   the second "Edit" link / the 2nd link / the last button
 *   the element below "Total Balance" / the dropdown below "Contact Reason"
 *   css "#id" / the element with test id "save"
 */
export function parseTarget(fragment: string, ctx: Ctx): Target | null {
  let f = fragment.trim().replace(/^(on|in|into|onto|at|from|of|to|for|over)\s+/i, "").replace(/^(the|a|an)\s+/i, "").trim()
  if (!f) return null

  let m: RegExpExecArray | null
  if ((m = /^(?:css|selector|css selector|element matching|xpath)\s+(⟦\d+⟧)$/i.exec(f))) return { by: "css", selector: ctx.value(m[1])! }
  if ((m = /^(?:element with )?(?:test ?id|data-testid|testid)\s+(⟦\d+⟧)$/i.exec(f))) return { by: "testid", id: ctx.value(m[1])! }

  // Relative: [kind] below "anchor"
  m = new RegExp(`^(?:${KIND_ALTERNATION}\\s+)?(?:that is\\s+|which is\\s+|located\\s+)?${RELATION_RE}\\s+(?:the\\s+)?(⟦\\d+⟧)(?:\\s+${KIND_ALTERNATION})?$`, "i").exec(f)
  if (m) return { by: "relative", kind: kindOf(m[1]), relation: relationOf(m[2]), anchor: ctx.value(m[3])! }

  // Ordinal with a name: the second "Edit" link
  m = new RegExp(`^${ORDINAL_RE}\\s+(⟦\\d+⟧)(?:\\s+${KIND_ALTERNATION})?$`, "i").exec(f)
  if (m) return { by: "name", name: ctx.value(m[2])!, kind: kindOf(m[3]), ordinal: ordinalValue(m[1]) }

  // Ordinal without a name: the 2nd link
  m = new RegExp(`^${ORDINAL_RE}\\s+${KIND_ALTERNATION}(?:\\s+(?:on the page|in the (?:dialog|popup|list|table)))?$`, "i").exec(f)
  if (m) return { by: "ordinal", kind: kindOf(m[2]), ordinal: ordinalValue(m[1]) }

  // Name with optional kind before or after: "Sign in" button / button "Sign in"
  m = new RegExp(`^(?:${KIND_ALTERNATION}\\s+)?(⟦\\d+⟧|\\{[\\w.\\-]+\\})(?:\\s+${KIND_ALTERNATION})?$`, "i").exec(f)
  if (m) return { by: "name", name: ctx.value(m[2])!, kind: kindOf(m[3] || m[1]) }

  // Unquoted single name for common cases: click Submit / the username field
  m = new RegExp(`^([\\w][\\w .'&-]{0,40}?)\\s+${KIND_ALTERNATION}$`, "i").exec(f)
  if (m && !/^(first|second|third|last)$/i.test(m[1])) return { by: "name", name: m[1].trim(), kind: kindOf(m[2]) }
  if (/^[\w][\w .'&-]{0,40}$/.test(f) && !/\b(below|above|right|left|near|next)\b/i.test(f)) return { by: "name", name: f, kind: "any" }
  return null
}

function ordinalValue(word: string): number {
  const w = word.toLowerCase()
  if (w in ORDINALS) return ORDINALS[w]
  return parseInt(w, 10) || 1
}

function comparisonOf(phrase: string): Comparison | null {
  const p = phrase.toLowerCase().trim()
  if (/^(does not|doesn't|do not) (contain|include|have)$|^(not contains?|excludes?)$/.test(p)) return "notContains"
  if (/^(is not|isn't|does not equal|doesn't equal|not equals?|!=)$/.test(p)) return "notEquals"
  if (/^(contains?|includes?|has)$/.test(p)) return "contains"
  if (/^(is|equals?|is equal to|=|==|has the value|reads|shows|is exactly)$/.test(p)) return "equals"
  if (/^(matches|match|matches the pattern|matches regex)$/.test(p)) return "matches"
  if (/^(starts with|begins with)$/.test(p)) return "startsWith"
  if (/^(ends with)$/.test(p)) return "endsWith"
  if (/^(is greater than|is more than|>|is above|is bigger than)$/.test(p)) return "greaterThan"
  if (/^(is less than|is fewer than|<|is below|is smaller than)$/.test(p)) return "lessThan"
  return null
}
const COMPARISON_RE =
  "(does not contain|doesn't contain|does not include|not contains|is not|isn't|does not equal|doesn't equal|not equals|!=|contains|contain|includes|include|has the value|is equal to|equals|equal|==|=|is exactly|reads|shows|matches the pattern|matches regex|matches|starts with|begins with|ends with|is greater than|is more than|is bigger than|>|is less than|is fewer than|is smaller than|<|is)"

function describeTarget(t: Target | null): string {
  if (!t) return "the focused field"
  const kindLabel = (k: ElementKind) => (k === "any" ? "element" : k === "field" ? "field" : k)
  switch (t.by) {
    case "css":
      return `the element matching ${t.selector}`
    case "testid":
      return `the element with test id "${t.id}"`
    case "relative":
      return `the ${kindLabel(t.kind)} ${t.relation === "rightOf" ? "to the right of" : t.relation === "leftOf" ? "to the left of" : t.relation} "${t.anchor}"`
    case "ordinal":
      return `the ${t.ordinal === -1 ? "last" : ordinalWord(t.ordinal)} ${kindLabel(t.kind)}`
    case "name":
      return `${t.ordinal ? `the ${t.ordinal === -1 ? "last" : ordinalWord(t.ordinal)} ` : ""}${t.kind === "any" ? "" : `${kindLabel(t.kind)} `}"${t.name}"`
  }
}
function ordinalWord(n: number) {
  return ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][n] || `${n}th`
}

// ─── The rules ───────────────────────────────────────────────────────────────

type Rule = (_shape: string, _ctx: Ctx) => Command | string | null

const RULES: Rule[] = [
  // Navigation
  (s, c) => {
    const m = /^(?:go|navigate|browse)\s+(?:to\s+)?(?:the\s+)?(?:url\s+|page\s+)?(⟦\d+⟧|https?:\/\/\S+|\{[\w.\-]+\}\S*)$/i.exec(s) || /^(?:open|visit)\s+(?:the\s+)?(?:url\s+|page\s+)?(⟦\d+⟧|https?:\/\/\S+|\{[\w.\-]+\}\S*)$/i.exec(s)
    return m ? { type: "goto", url: c.value(m[1])! } : null
  },
  s => (/^(?:go|navigate)\s+back$/i.test(s) ? { type: "back" } : null),
  s => (/^(?:go|navigate)\s+forward$/i.test(s) ? { type: "forward" } : null),
  s => (/^(?:(?:hard|soft)\s+)?(?:refresh|reload)(?:\s+the\s+page)?$/i.test(s) ? { type: "reload" } : null),

  // Tabs
  (s, c) => {
    const m = /^open\s+(?:a\s+)?new\s+(?:browser\s+)?tab(?:\s+(?:with|at|to|on)\s+(?:the\s+)?(?:url\s+)?(⟦\d+⟧|https?:\/\/\S+|\{[\w.\-]+\}))?$/i.exec(s)
    return m ? { type: "newTab", url: m[1] ? c.value(m[1]) : null } : null
  },
  s => {
    const m = new RegExp(`^(?:switch|change|go)\\s+to\\s+(?:the\\s+)?${ORDINAL_RE}\\s+(?:browser\\s+)?tab$`, "i").exec(s)
    if (m) {
      const n = ordinalValue(m[1])
      return { type: "switchTab", index: n === -1 ? "last" : n }
    }
    const m2 = /^(?:switch|change|go)\s+to\s+(?:the\s+)?(new|newest|latest|previous|original)\s+tab$/i.exec(s)
    return m2 ? { type: "switchTab", index: /previous|original/i.test(m2[1]) ? "first" : "last" } : null
  },
  s => (/^close\s+(?:the\s+)?(?:current\s+)?(?:browser\s+)?tab$/i.test(s) ? { type: "closeTab" } : null),

  // Dialogs
  s => {
    const m = /^(accept|confirm|ok|dismiss|cancel|close)\s+(?:the\s+)?(?:alert|dialog|confirm(?:ation)?|prompt|popup)(\s+if\s+(?:it\s+is\s+)?(?:visible|shown|present|it appears))?$/i.exec(s)
    if (m) return { type: "dialog", accept: /accept|confirm|ok/i.test(m[1]), ifVisible: !!m[2] }
    const m2 = /^click\s+(?:the\s+)?alert\s+(ok|cancel)(?:\s+button)?$/i.exec(s)
    return m2 ? { type: "dialog", accept: /ok/i.test(m2[1]), ifVisible: false } : null
  },

  // Visual checkpoint
  (s, c) => {
    const m = /^(?:visually\s+(?:check|verify|validate)|take\s+a\s+(?:visual\s+)?checkpoint(?:\s+of)?|check\s+visually)\s*(?:this|the)?\s*(?:screen|page|window)?(?:\s+(full page|viewport|visible area))?(?:\s+(?:as|named|called)\s+(⟦\d+⟧))?$/i.exec(s)
    return m ? { type: "checkpoint", name: m[2] ? c.value(m[2]) : null, fullPage: m[1] ? /full/i.test(m[1]) : null } : null
  },

  // Implicit wait
  s => {
    const m = new RegExp(`^(?:set\\s+(?:the\\s+)?implicit\\s+wait(?:\\s+time)?\\s+(?:to|=)\\s+|implicitly\\s+wait\\s+(?:for\\s+elements\\s+)?(?:up\\s+to\\s+)?)(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}?$`, "i").exec(s)
    return m ? { type: "implicitWait", ms: secondsOrMs(m[1], m[2]) } : null
  },

  // Waits
  (s, c) => {
    const m = new RegExp(`^wait\\s+(?:up\\s+to\\s+|for\\s+up\\s+to\\s+|at\\s+most\\s+)?(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}\\s+(?:for|until)\\s+(.+?)\\s+(?:to\\s+)?(appear|appears|be visible|is visible|to be visible|disappear|disappears|to disappear|be hidden|is hidden|to be hidden|is gone|to be gone|load|to load)$`, "i").exec(s)
    if (m) {
      const target = parseTarget(m[3], c)
      if (!target) return `I could not tell which element to wait for in "${c.expand(m[3])}"`
      return { type: "waitFor", target, timeoutMs: secondsOrMs(m[1], m[2]), state: /disappear|hidden|gone/i.test(m[4]) ? "hidden" : "visible" }
    }
    const m2 = /^wait\s+(?:for|until)\s+(.+?)\s+(?:to\s+)?(appear|appears|be visible|is visible|to be visible|disappear|disappears|be hidden|is hidden|to be hidden|is gone|to be gone)$/i.exec(s)
    if (m2) {
      const target = parseTarget(m2[1], c)
      if (!target) return `I could not tell which element to wait for in "${c.expand(m2[1])}"`
      return { type: "waitFor", target, timeoutMs: null, state: /disappear|hidden|gone/i.test(m2[2]) ? "hidden" : "visible" }
    }
    const m3 = new RegExp(`^wait\\s+(?:(?:up\\s+to\\s+)(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}\\s+)?(?:for|until)\\s+(?:the\\s+)?(?:url|address)\\s+(?:to\\s+)?${COMPARISON_RE}\\s+(⟦\\d+⟧|\\S+)$`, "i").exec(s)
    if (m3) {
      const cmp = comparisonOf(m3[3]) || "contains"
      return { type: "waitForUrl", comparison: cmp, expected: c.value(m3[4])!, timeoutMs: m3[1] ? secondsOrMs(m3[1], m3[2]) : null }
    }
    const m4 = new RegExp(`^(?:wait|pause|delay|sleep)\\s+(?:for\\s+)?(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}?$`, "i").exec(s)
    if (m4) return { type: "wait", ms: Math.min(secondsOrMs(m4[1], m4[2]), 10 * 60_000) }
    return null
  },

  // Keyboard
  s => {
    const m = /^(?:press|hit)\s+(?:the\s+)?(.+?)(?:\s+key)?$/i.exec(s)
    if (!m) return null
    const raw = m[1].replace(/⟦\d+⟧/g, "").trim().toLowerCase()
    if (KEYS[raw]) return { type: "press", key: KEYS[raw] }
    if (/^(ctrl|control|cmd|command|meta|shift|alt|option)\s*\+\s*\w+/i.test(raw)) {
      return {
        type: "press",
        key: raw
          .split(/\s*\+\s*/)
          .map(k => ({ ctrl: "Control", control: "Control", cmd: "Meta", command: "Meta", meta: "Meta", shift: "Shift", alt: "Alt", option: "Alt" } as Record<string, string>)[k] || (k.length === 1 ? k.toUpperCase() : KEYS[k] || k))
          .join("+"),
      }
    }
    if (/^[a-z0-9]$/.test(raw)) return { type: "press", key: raw }
    return null
  },

  // Scrolling
  (s, c) => {
    let m = /^scroll\s+(?:the\s+(?:page|viewport|window)\s+)?(?:(halfway)\s+)?(up|down)(?:\s+(?:by\s+|up\s+to\s+|to\s+)?(\d+)\s*(?:pixels?|px))?(?:\s+(?:the\s+)?(?:page|viewport))?$/i.exec(s)
    if (m) return { type: "scroll", direction: m[2].toLowerCase() as "up" | "down", pixels: m[3] ? parseInt(m[3], 10) : undefined, half: !!m[1] }
    m = /^scroll\s+(?:(?:the\s+(?:viewport|page|window)\s+)(halfway)\s+(up|down))$/i.exec(s)
    if (m) return { type: "scroll", direction: m[2].toLowerCase() as "up" | "down", half: true }
    m = /^scroll\s+(?:up\s+|down\s+)?to\s+(?:the\s+)?(top|bottom)(?:\s+of\s+(?:the\s+)?page)?$/i.exec(s)
    if (m) return { type: "scroll", direction: m[1].toLowerCase() as "top" | "bottom" }
    m = /^scroll\s+(?:down\s+|up\s+)?(?:to|until)\s+(.+?)(?:\s+is\s+visible)?$/i.exec(s)
    if (m) {
      const target = parseTarget(m[1], c)
      return target ? { type: "scroll", direction: "to", target } : `I could not tell what to scroll to in "${c.expand(m[1])}"`
    }
    return null
  },

  // Upload
  (s, c) => {
    const m = /^(?:upload|attach|select)\s+(?:the\s+)?file\s+(⟦\d+⟧|\S+)\s+(?:to|into|in|on|using|with)\s+(.+)$/i.exec(s) || /^(?:upload|attach)\s+(⟦\d+⟧|\S+)\s+(?:to|into|in|on|using|with)\s+(.+)$/i.exec(s)
    if (!m) return null
    const target = parseTarget(m[2], c)
    return target ? { type: "upload", file: c.value(m[1])!, target } : `I could not tell which upload field in "${c.expand(m[2])}"`
  },

  // Variables
  (s, c) => {
    const m = /^(?:set|store|save|remember)\s+(?:the\s+)?(?:variable|var|param(?:eter)?)\s+\{?([A-Za-z_][\w-]*)\}?\s*(?:=|to|as)\s*(.+)$/i.exec(s) ||
      /^(?:set|store|save)\s+\{([A-Za-z_][\w-]*)\}\s*(?:=|to|as)\s*(.+)$/i.exec(s) ||
      /^(?:set|store|save)\s+([A-Za-z_][\w-]*)\s+(?:as|=)\s+(⟦\d+⟧|\{[\w.\-]+\})$/i.exec(s)
    const m2 = /^(?:save|store|remember)\s+(.+?)\s+as\s+\{?([A-Za-z_][\w-]*)\}?$/i.exec(s)
    const name = m ? m[1] : m2 ? m2[2] : null
    const rhs = m ? m[2].trim() : m2 ? m2[1].trim() : null
    if (!name || rhs === null) return null
    if (c.isValue(rhs)) return { type: "setVariable", name, source: { from: "literal", value: c.value(rhs)! } }
    if (/^(?:the\s+)?(?:current\s+)?(?:page\s+)?url$/i.test(rhs)) return { type: "setVariable", name, source: { from: "url" } }
    if (/^(?:the\s+)?(?:page\s+)?title$/i.test(rhs)) return { type: "setVariable", name, source: { from: "title" } }
    const el = /^(?:the\s+)?(?:text|value|content)\s+(?:of\s+)?(.+)$/i.exec(rhs)
    const target = parseTarget(el ? el[1].replace(/^(?:the\s+)?(?:text|element)\s+/i, "") : rhs, c) ||
      (el ? parseTarget(`text ${el[1]}`, c) : null)
    // "text to the right of X" reads as a relative target once "text" is seen as the kind.
    const rel = /^(?:the\s+)?(text|value|element)\s+(.+)$/i.exec(rhs)
    const relTarget = rel ? parseTarget(`${rel[1]} ${rel[2]}`, c) : null
    const chosen = relTarget && relTarget.by === "relative" ? relTarget : target
    return chosen ? { type: "setVariable", name, source: { from: "element", target: chosen } } : `I could not tell what value to store in {${name}}`
  },

  // Typing
  (s, c) => {
    const m = /^(type|enter|input|write|fill in|fill|append)\s+(.+?)\s+(?:in|into|on|to|inside)\s+(.+)$/i.exec(s)
    if (m && c.isValue(m[2])) {
      const target = parseTarget(m[3], c)
      if (!target) return `I could not tell which field to type into in "${c.expand(m[3])}"`
      return { type: "type", value: c.value(m[2])!, target, append: /append/i.test(m[1]) }
    }
    const m2 = /^(?:fill(?:\s+in)?|set|populate)\s+(.+?)\s+(?:with|as|to|=)\s+(⟦\d+⟧|\{[\w.\-]+\}|\*{3}|-?\d+(?:\.\d+)?)$/i.exec(s)
    if (m2 && !/^variable\b/i.test(m2[1])) {
      const target = parseTarget(m2[1], c)
      if (target) return { type: "type", value: c.value(m2[2])!, target, append: false }
    }
    const m3 = /^(?:type|enter|input|write)\s+(⟦\d+⟧|\{[\w.\-]+\}|\*{3}|-?\d+(?:\.\d+)?)$/i.exec(s)
    if (m3) return { type: "type", value: c.value(m3[1])!, target: null, append: true }
    return null
  },
  (s, c) => {
    const m = /^clear\s+(.+?)(?:\s+(?:of\s+)?(?:text|its text|the text|value))?$/i.exec(s)
    if (!m || /^all$/i.test(m[1])) return null
    const target = parseTarget(m[1], c)
    return target ? { type: "clear", target } : null
  },

  // Select
  (s, c) => {
    const m = /^(?:select|choose|pick)\s+(⟦\d+⟧|\{[\w.\-]+\})\s+(?:from|in|on|within)\s+(.+)$/i.exec(s)
    if (m) {
      const target = parseTarget(m[2], c)
      if (!target) return `I could not tell which dropdown in "${c.expand(m[2])}"`
      if (target.by === "name" && target.kind === "any") (target as any).kind = "dropdown"
      if (target.by === "relative" && target.kind === "any") (target as any).kind = "dropdown"
      return { type: "select", option: c.value(m[1])!, target }
    }
    const m2 = new RegExp(`^(?:select|choose|pick)\\s+(?:the\\s+)?${ORDINAL_RE}\\s+option\\s+(?:from|in)\\s+(.+)$`, "i").exec(s)
    if (m2) {
      const target = parseTarget(m2[2], c)
      if (!target) return `I could not tell which dropdown in "${c.expand(m2[2])}"`
      return { type: "select", option: `#${ordinalValue(m2[1])}`, target }
    }
    return null
  },

  // Check / uncheck
  (s, c) => {
    const m = /^(check|tick|uncheck|untick|select|deselect)\s+(.+)$/i.exec(s)
    if (!m) return null
    const kindWords = /\b(checkbox|check box|tick box|box|radio|radio button|option|toggle|switch)\b/i
    if (/^select$/i.test(m[1]) && !kindWords.test(m[2])) return null
    const target = parseTarget(m[2].replace(/\b(toggle|switch)\b/i, "checkbox"), c)
    if (!target) return null
    if (target.by === "name" && target.kind === "any") (target as any).kind = "checkbox"
    return { type: /^(uncheck|untick|deselect)$/i.test(m[1]) ? "uncheck" : "check", target }
  },

  // Hover
  (s, c) => {
    const m = /^(?:hover|mouse over|move the mouse over)\s+(?:over\s+|on\s+)?(.+)$/i.exec(s)
    if (!m) return null
    const target = parseTarget(m[1], c)
    return target ? { type: "hover", target } : `I could not tell what to hover over in "${c.expand(m[1])}"`
  },

  // Click
  (s, c) => {
    const m = /^(double[- ]?click|right[- ]?click|click|tap|press|select)\s+(?:on\s+)?(.+)$/i.exec(s)
    if (!m) return null
    const target = parseTarget(m[2], c)
    if (!target) return /^(press|select)$/i.test(m[1]) ? null : `I could not tell what to click in "${c.expand(m[2])}"`
    const verb = m[1].toLowerCase()
    return { type: "click", target, clickType: verb.startsWith("double") ? "double" : verb.startsWith("right") ? "right" : "single" }
  },

  // JavaScript
  s => {
    const m = /^(?:execute|run|evaluate)\s+(?:javascript|js|script)\s*:?\s*([\s\S]+)$/i.exec(s)
    return m ? { type: "executeJs", code: m[1] } : null
  },

  // API
  (s, c) => {
    const m = /^(?:(?:send|make|call)\s+(?:an?\s+)?)?(GET|POST|PUT|PATCH|DELETE)\s+(?:request\s+(?:to\s+)?)?(⟦\d+⟧|\S+)(.*)$/.exec(s)
    if (!m) return null
    const url = c.value(m[2])!
    if (!/^(https?:\/\/|\{|\/)/i.test(url)) return null
    const headers: Record<string, string> = {}
    let body: string | null = null
    let rest = m[3]
    const headerRe = /(?:with|and)\s+headers?\s+(⟦\d+⟧)/gi
    let hm: RegExpExecArray | null
    while ((hm = headerRe.exec(rest))) {
      const raw = c.value(hm[1])!
      for (const part of raw.split(/\s*;\s*|\s*\n\s*/)) {
        const idx = part.indexOf(":")
        if (idx > 0) headers[part.slice(0, idx).trim()] = part.slice(idx + 1).trim()
      }
    }
    rest = rest.replace(headerRe, "")
    const bm = /(?:with|and)\s+(?:json\s+)?body\s+([\s\S]+)$/i.exec(rest)
    if (bm) body = c.value(bm[1]) ?? bm[1].trim()
    return { type: "api", method: m[1] as any, url, headers, body }
  },

  // Assertions
  (s, c) => {
    const lead = /^(?:verify|assert|expect|confirm|ensure|check)\s+(?:that\s+)?/i
    if (!lead.test(s)) return null
    const body = s.replace(lead, "")
    let m: RegExpExecArray | null

    // HTTP status of the page
    if ((m = /^(?:the\s+)?(?:http\s+)?status(?:\s+code)?\s+(?:of\s+the\s+page\s+)?(?:is|equals|=)\s+(\d{3})$/i.exec(body))) return { type: "assertStatus", status: parseInt(m[1], 10) }

    // URL / title
    if ((m = new RegExp(`^(?:the\\s+)?(?:page\\s+)?(?:current\\s+)?(url|address|title)\\s+${COMPARISON_RE}\\s+(⟦\\d+⟧|\\S+)$`, "i").exec(body))) {
      const cmp = comparisonOf(m[2])!
      return m[1].toLowerCase() === "title" ? { type: "assertTitle", comparison: cmp, expected: c.value(m[3])! } : { type: "assertUrl", comparison: cmp, expected: c.value(m[3])! }
    }

    // Variables / expressions: {x} equals "y"
    // A variable on the left: {x} equals "y". A quoted literal on the left only when the right is a value too,
    // so `"Error" is not visible` stays a visibility check.
    if (
      (m = new RegExp(`^(\\{[\\w.\\-\\[\\]]+\\})\\s+${COMPARISON_RE}\\s+(.+)$`, "i").exec(body)) ||
      (m = new RegExp(`^(⟦\\d+⟧)\\s+${COMPARISON_RE}\\s+(⟦\\d+⟧|\\{[\\w.\\-]+\\}|-?\\d+(?:\\.\\d+)?)$`, "i").exec(body))
    ) {
      return { type: "assertValue", left: m[1].startsWith("{") ? m[1] : c.value(m[1])!, comparison: comparisonOf(m[2])!, right: c.value(m[3]) ?? m[3] }
    }

    // Page contains
    if ((m = /^(?:the\s+)?page\s+(contains|has|shows|includes|does not contain|doesn't contain|does not show)\s+(?:the\s+text\s+)?(⟦\d+⟧|\{[\w.\-]+\})$/i.exec(body))) {
      return { type: "assertText", target: null, comparison: /not/i.test(m[1]) ? "notContains" : "contains", expected: c.value(m[2])! }
    }
    if ((m = /^(⟦\d+⟧)\s+(?:text\s+)?(?:is\s+)?(?:shown|displayed|present|visible)\s+on\s+the\s+page$/i.exec(body))) {
      return { type: "assertText", target: null, comparison: "contains", expected: c.value(m[1])! }
    }

    // Visibility
    if ((m = /^(.+?)\s+(is|are)\s+(not\s+)?(visible|displayed|shown|present|on the page|hidden|invisible|gone)$/i.exec(body))) {
      const target = parseTarget(m[1], c)
      if (!target) return `I could not tell which element in "${c.expand(m[1])}"`
      const hiddenWord = /hidden|invisible|gone/i.test(m[4])
      return { type: "assertVisible", target, negate: !!m[3] !== hiddenWord }
    }
    if ((m = /^(.+?)\s+(?:is|are)\s+(not\s+)?(enabled|disabled|clickable)$/i.exec(body))) {
      const target = parseTarget(m[1], c)
      if (!target) return `I could not tell which element in "${c.expand(m[1])}"`
      return { type: "assertEnabled", target, negate: !!m[2] !== /disabled/i.test(m[3]) }
    }
    if ((m = /^(.+?)\s+(?:is|are)\s+(not\s+)?(checked|selected|ticked|unchecked)$/i.exec(body))) {
      const target = parseTarget(m[1], c)
      if (!target) return `I could not tell which element in "${c.expand(m[1])}"`
      return { type: "assertChecked", target, negate: !!m[2] !== /unchecked/i.test(m[3]) }
    }

    // Element text
    if ((m = new RegExp(`^(.+?)\\s+${COMPARISON_RE}\\s+(⟦\\d+⟧|\\{[\\w.\\-]+\\}|-?\\d[\\d.,]*|\\/.+\\/[a-z]*)$`, "i").exec(body))) {
      const target = parseTarget(m[1].replace(/^(?:the\s+)?(?:text|value)\s+(?:of\s+)?(?=the\s|⟦)/i, ""), c)
      if (!target) return `I could not tell which element to check in "${c.expand(m[1])}"`
      let expected = c.value(m[3])!
      let cmp = comparisonOf(m[2])!
      if (/^\/.+\/[a-z]*$/.test(expected)) cmp = "matches"
      return { type: "assertText", target, comparison: cmp, expected }
    }
    return "I understood this as a check, but not what to check. Try: Verify that \"Welcome\" is visible, or Verify that the URL contains \"/home\""
  },
]

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseStep(input: string): ParseResult {
  const text = normalizeSentence(input)
  if (!text) return { ok: false, error: "Write what the step should do.", text }

  let optional = false
  let body = text
  const opt = /^(?:optionally|if possible,?|try to)\s+/i.exec(body)
  if (opt) {
    optional = true
    body = body.slice(opt[0].length)
  }

  // JavaScript is taken verbatim: its quotes are code, not quoted values.
  const js = /^(?:execute|run|evaluate)\s+(?:javascript|js|script)\s*:?\s*([\s\S]+)$/i.exec(body)
  if (js) {
    const command: Command = { type: "executeJs", code: js[1] }
    return { ok: true, command, optional, meaning: (optional ? "If possible: " : "") + describeCommand(command), text }
  }

  const tokens = tokenize(body)
  if ("error" in tokens) return { ok: false, error: tokens.error, text }
  const ctx = new Ctx(tokens)
  const shape = tokens.shape.trim()

  let firstMessage: string | null = null
  for (const rule of RULES) {
    const r = rule(shape, ctx)
    if (!r) continue
    if (typeof r === "string") {
      firstMessage = firstMessage ?? r
      continue
    }
    return { ok: true, command: r, optional, meaning: (optional ? "If possible: " : "") + describeCommand(r), text }
  }
  const suggestion = suggestSteps(text, 1)[0]
  return {
    ok: false,
    error: firstMessage || "This step is not one I know how to run yet. Start with a verb such as Click, Type, Select, Verify or Wait.",
    text,
    suggestion: suggestion && suggestion.toLowerCase() !== text.toLowerCase() ? suggestion : undefined,
  }
}

export function describeCommand(cmd: Command): string {
  const q = (v: string) => `"${v}"`
  const cmpWord: Record<Comparison, string> = {
    equals: "is", contains: "contains", matches: "matches", startsWith: "starts with", endsWith: "ends with",
    greaterThan: "is greater than", lessThan: "is less than", notEquals: "is not", notContains: "does not contain",
  }
  switch (cmd.type) {
    case "goto": return `Open ${cmd.url}`
    case "back": return "Go back one page"
    case "forward": return "Go forward one page"
    case "reload": return "Reload the page"
    case "click": return `${cmd.clickType === "double" ? "Double-click" : cmd.clickType === "right" ? "Right-click" : "Click"} ${describeTarget(cmd.target)}`
    case "hover": return `Move the mouse over ${describeTarget(cmd.target)}`
    case "type": return `${cmd.append && cmd.target ? "Add" : "Type"} ${cmd.value === "***" ? "the password" : q(cmd.value)} ${cmd.target ? `into ${describeTarget(cmd.target)}` : "into the focused field"}`
    case "clear": return `Clear ${describeTarget(cmd.target)}`
    case "select": return `Choose ${cmd.option.startsWith("#") ? `option ${cmd.option.slice(1)}` : q(cmd.option)} in ${describeTarget(cmd.target)}`
    case "check": return `Tick ${describeTarget(cmd.target)}`
    case "uncheck": return `Untick ${describeTarget(cmd.target)}`
    case "press": return `Press ${cmd.key}`
    case "scroll":
      return cmd.direction === "to" ? `Scroll until ${describeTarget(cmd.target!)} is in view` : cmd.direction === "top" || cmd.direction === "bottom" ? `Scroll to the ${cmd.direction} of the page` : `Scroll ${cmd.direction}${cmd.pixels ? ` ${cmd.pixels}px` : cmd.half ? " half a screen" : " one screen"}`
    case "wait": return `Wait ${cmd.ms >= 1000 ? `${cmd.ms / 1000} s` : `${cmd.ms} ms`}`
    case "waitFor": return `Wait${cmd.timeoutMs ? ` up to ${cmd.timeoutMs / 1000} s` : ""} for ${describeTarget(cmd.target)} to ${cmd.state === "visible" ? "appear" : "disappear"}`
    case "waitForUrl": return `Wait until the address ${cmpWord[cmd.comparison]} ${q(cmd.expected)}`
    case "implicitWait": return `From now on, wait up to ${cmd.ms / 1000} s for elements`
    case "assertVisible": return `Check ${describeTarget(cmd.target)} is ${cmd.negate ? "not " : ""}visible`
    case "assertText": return `Check ${cmd.target ? `the text of ${describeTarget(cmd.target)}` : "the page"} ${cmpWord[cmd.comparison]} ${q(cmd.expected)}`
    case "assertUrl": return `Check the address ${cmpWord[cmd.comparison]} ${q(cmd.expected)}`
    case "assertTitle": return `Check the page title ${cmpWord[cmd.comparison]} ${q(cmd.expected)}`
    case "assertStatus": return `Check the page answered HTTP ${cmd.status}`
    case "assertValue": return `Check ${cmd.left} ${cmpWord[cmd.comparison]} ${q(cmd.right)}`
    case "assertEnabled": return `Check ${describeTarget(cmd.target)} is ${cmd.negate ? "disabled" : "enabled"}`
    case "assertChecked": return `Check ${describeTarget(cmd.target)} is ${cmd.negate ? "not " : ""}ticked`
    case "setVariable":
      return `Remember {${cmd.name}} = ${cmd.source.from === "literal" ? q(cmd.source.value) : cmd.source.from === "element" ? `the text of ${describeTarget(cmd.source.target)}` : cmd.source.from === "url" ? "the current address" : "the page title"}`
    case "executeJs": return "Run JavaScript in the page; the result is kept in {js-result}"
    case "api": return `Send ${cmd.method} ${cmd.url}${Object.keys(cmd.headers).length ? ` with ${Object.keys(cmd.headers).length} header(s)` : ""}${cmd.body ? " and a body" : ""}; the reply is kept in {response}`
    case "upload": return `Upload ${q(cmd.file)} to ${describeTarget(cmd.target)}`
    case "dialog": return `${cmd.accept ? "Accept" : "Dismiss"} the browser dialog${cmd.ifVisible ? " if one appears" : ""}`
    case "newTab": return `Open a new tab${cmd.url ? ` at ${cmd.url}` : ""}`
    case "switchTab": return `Switch to the ${cmd.index === "last" ? "newest" : cmd.index === "first" ? "first" : ordinalWord(cmd.index)} tab`
    case "closeTab": return "Close this tab"
    case "checkpoint": return `Compare this screen with its approved screenshot${cmd.name ? ` (${q(cmd.name)})` : ""}`
  }
}

// ─── Autocomplete ────────────────────────────────────────────────────────────

export const STEP_TEMPLATES: string[] = [
  'Go to "https://"',
  'Click "Sign in"',
  'Click the "Submit" button',
  'Click the "Pricing" link',
  'Double-click "Row title"',
  'Hover over the "Products" menu',
  'Type "demo user" in the "Username" field',
  'Type {password} in the "Password" field',
  'Clear the "Search" field',
  'Select "Demo Request" from the "Contact Reason" dropdown',
  'Select "Demo Request" from dropdown below "Contact Reason"',
  'Select the 2nd option in the "Country" dropdown',
  'Check the "I agree" checkbox',
  'Uncheck the "Subscribe" checkbox',
  "Press Enter",
  "Press Escape",
  "Scroll down",
  "Scroll to the bottom of the page",
  'Scroll to the "Contact us" heading',
  "Wait 2 seconds",
  'Wait up to 20 seconds for the "Financial Overview" heading to appear',
  'Wait for the "Loading" text to disappear',
  'Wait for the URL to contain "/dashboard"',
  "Set the implicit wait time to 10 seconds",
  'Verify that "Welcome" is visible',
  'Verify that the "Jack Gomez" heading is visible',
  'Verify that "Error" is not visible',
  'Verify that the page contains "Order confirmed"',
  'Verify that the element below "Total Balance" contains "350"',
  'Verify that the "Email" field is disabled',
  'Verify that the URL contains "/home"',
  'Verify that the title contains "Dashboard"',
  "Verify that the status of the page is 200",
  'Set variable orderId = text to the right of "Order number"',
  'Set variable email = "qa@example.com"',
  'Assert that {orderId} matches "/^\\d+$/"',
  'Assert that {response.body.data.status} equals "SUBMITTED"',
  "Execute javascript: document.title",
  'GET https://api.example.com/items?id={orderId} with header "Authorization: Bearer {token}"',
  'POST https://api.example.com/items with header "Content-Type: application/json" with body "{\\"name\\":\\"test\\"}"',
  'Upload "invoice.pdf" to the "Attachment" field',
  "Accept the alert",
  "Dismiss the alert if it is visible",
  'Open a new tab with "https://"',
  "Switch to the second tab",
  "Close the current tab",
  "Go back",
  "Refresh the page",
  "Visually check this screen",
  'Visually check this screen as "Checkout summary"',
  'Optionally click "Accept All"',
]

/** Templates that fit what has been typed so far, best first. */
export function suggestSteps(prefix: string, limit = 8): string[] {
  const raw = (prefix || "").trim().toLowerCase()
  if (!raw) return STEP_TEMPLATES.slice(0, limit)
  const corrected = normalizeSentence(prefix).toLowerCase()
  const words = corrected.split(" ").filter(Boolean)
  const scored = STEP_TEMPLATES.map(t => {
    const lt = t.toLowerCase()
    let score = 0
    if (lt.startsWith(corrected)) score += 100 + corrected.length
    else if (lt.startsWith(words[0] || "")) score += 40
    for (const w of words.slice(1)) if (w.length > 2 && lt.includes(w.replace(/"/g, ""))) score += 5
    if (!score && lt.includes(raw)) score += 10
    return { t, score }
  })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(x => x.t)
}

/** Variables a step reads ({name}), for the editor to warn about ones never set. */
export function variablesUsed(text: string): string[] {
  return [...new Set([...(text || "").matchAll(/\{([A-Za-z_][\w-]*)(?:[.\[][^}]*)?\}/g)].map(m => m[1]))]
}

/** Variables a parsed step writes. */
export function variablesSet(cmd: Command): string[] {
  if (cmd.type === "setVariable") return [cmd.name]
  if (cmd.type === "executeJs") return ["js-result"]
  if (cmd.type === "api") return ["response"]
  return []
}
