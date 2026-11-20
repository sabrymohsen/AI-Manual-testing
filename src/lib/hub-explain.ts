/**
 * Why a test failed, in plain words, with what to try — and, when a step
 * couldn't find something, the closest thing that WAS on the page
 * ("Did you mean the button 'Proceed to checkout'?"). Pure and browser-safe:
 * the run view calls it with the step and page snapshot from hub-report.
 */

export interface PageElementLite {
  role: string
  name: string
}

export interface Explanation {
  /** One line, e.g. 'Couldn't find "Checkout now" on the page' */
  headline: string
  /** A sentence or two of why. */
  detail: string
  tips: string[]
  /** The step's quoted name and the closest real element, when there is one. */
  didYouMean?: { from: string; to: string; role: string }
}

const CLICKABLE = new Set(["button", "link", "menuitem", "tab", "checkbox", "radio", "option", "switch"])
const FIELDS = new Set(["textbox", "combobox", "searchbox", "spinbutton", "listbox"])

function norm(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

/** 0..1: shared words count most, then overall spelling. */
export function similarity(a: string, b: string): number {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const wx = new Set(x.split(" "))
  const wy = new Set(y.split(" "))
  const shared = [...wx].filter((w) => wy.has(w) || [...wy].some((v) => v.length > 3 && w.length > 3 && (v.startsWith(w) || w.startsWith(v)))).length
  const words = shared / Math.max(wx.size, wy.size)
  // How much of what the step asked for is there ("Checkout now" → "Proceed to checkout").
  const coverage = (shared / wx.size) * 0.8
  const spelling = 1 - levenshtein(x, y) / Math.max(x.length, y.length)
  const contains = x.includes(y) || y.includes(x) ? 0.25 : 0
  return Math.min(1, Math.max(words, coverage, spelling * 0.85) + contains)
}

/** The closest element to `wanted`, preferring the kind of thing the step acts on. */
export function closestElement(wanted: string, page: PageElementLite[], kind: "click" | "field" | "text" | "any"): PageElementLite | null {
  const pool = page.filter((e) =>
    kind === "click" ? CLICKABLE.has(e.role) : kind === "field" ? FIELDS.has(e.role) : kind === "text" ? true : true
  )
  let best: PageElementLite | null = null
  let score = 0
  for (const e of pool.length ? pool : page) {
    if (norm(e.name) === norm(wanted)) continue
    const s = similarity(wanted, e.name)
    if (s > score) {
      score = s
      best = e
    }
  }
  return best && score >= 0.34 ? best : null
}

const quoted = (s: string) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1])

function kindOfStep(step: string): "click" | "field" | "text" | "any" {
  if (/\b(type|enter|fill|clear|select|choose)\b/i.test(step) || /\bfield\b|\bdropdown\b/i.test(step)) return "field"
  if (/\b(verify|check that|assert|should (contain|show|see))\b/i.test(step)) return "text"
  if (/\b(click|press|tap|hover|open)\b/i.test(step)) return "click"
  return "any"
}

const roleWord = (role: string) =>
  ({ textbox: "field", combobox: "dropdown", searchbox: "search box", menuitem: "menu item", text: "text" })[role] || role

export function explainFailure(input: { error?: string | null; step?: string | null; page?: PageElementLite[] | null }): Explanation {
  const error = (input.error || "").replace(/^Error:\s*/, "")
  const step = input.step || ""
  const page = input.page || []

  // A step couldn't find its element.
  const notFound = error.match(/Could not find (?:the \w+ )?"([^"]+)"/i) || (/(waiting for|locator\.[a-z]+: Timeout)/i.test(error) && quoted(step).length ? [null, quoted(step)[quoted(step).length - 1]] : null)
  if (notFound && notFound[1]) {
    const wanted = notFound[1]
    const kind = kindOfStep(step)
    const near = page.length ? closestElement(wanted, page, kind) : null
    return {
      headline: `Couldn't find "${wanted}" on the page`,
      detail: near
        ? `There's no ${kind === "field" ? "field" : "element"} called "${wanted}" — but there is a ${roleWord(near.role)} called "${near.name}". The text may have changed.`
        : "It may have been renamed or moved, be hidden behind a menu or pop-up, or the page hadn't finished loading.",
      tips: [
        near ? `If "${near.name}" is the right one, update the step to use it.` : "Check the screenshot: is it on the page, with this exact text?",
        "If it appears after something loads, add a step before it: Wait up to 10 seconds for \"…\" to appear.",
        "If the page needs a sign-in or a pop-up closed first, add those steps.",
      ],
      ...(near ? { didYouMean: { from: wanted, to: near.name, role: near.role } } : {}),
    }
  }

  // A text check didn't hold.
  const expected = error.match(/Expected the page to contain "([^"]+)"/i) || error.match(/Expected .*? to (?:contain|equal|be) "([^"]+)"/i)
  if (expected) {
    const text = expected[1]
    const near = page.length ? closestElement(text, page, "text") : null
    return {
      headline: `The page didn't show "${text}"`,
      detail: near
        ? `The closest text on the page was "${near.name}". Either the app shows a different message now (maybe a real bug), or the expected text needs updating.`
        : "The expected text wasn't on the page when the check ran. This is often a real bug — or the previous step didn't do what it should.",
      tips: [
        "Look at the screenshot to see what the page showed instead.",
        "If the app is right and the wording changed, update the expected text in the step.",
        "If it's wrong, it's a bug: use File bug — the steps and screenshot are filled in for you.",
      ],
      ...(near ? { didYouMean: { from: text, to: near.name, role: near.role } } : {}),
    }
  }

  if (/net::ERR_|ECONNREFUSED|ENOTFOUND|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/i.test(error)) {
    return {
      headline: "The website couldn't be reached",
      detail: "The test couldn't open the page: the address may be wrong, the site may be down, or it isn't reachable from where tests run.",
      tips: ["Open the address in your browser to check it.", "Check the Go to step's address (and the environment, if you use one)."],
    }
  }

  if (/toHaveURL|Expected .*url/i.test(error) || /\burl\b/i.test(step)) {
    return {
      headline: "The page address wasn't what the test expected",
      detail: "The previous step probably didn't go where it should (a failed sign-in, an error page, or a redirect).",
      tips: ["Check the screenshot for an error message.", "If the address legitimately changed, update the check."],
    }
  }

  if (/toHaveTitle|title/i.test(error)) {
    return {
      headline: "The page title wasn't what the test expected",
      detail: "Either a different page opened, or the title changed.",
      tips: ["Check the screenshot.", "If the title changed on purpose, update the check."],
    }
  }

  if (/Test timeout|timed out|Timeout \d+ms exceeded/i.test(error)) {
    return {
      headline: "The test ran out of time",
      detail: "A step waited for something that never happened, or the site was very slow.",
      tips: ["See which step was running (marked ✗ above) and check the screenshot.", "If the site is just slow, add a Wait step before it."],
    }
  }

  if (/isn't understood|could not be understood/i.test(error)) {
    return {
      headline: "A step isn't written in a way QA Engine understands",
      detail: "Fix the step with the red note in the editor — suggestions appear as you type.",
      tips: ['Try wording like: Click "Sign in", Type "demo" in the "Email" field, Verify that the page contains "Welcome".'],
    }
  }

  return {
    headline: step ? `The step "${step}" failed` : "The test failed",
    detail: "See the screenshot and the technical details below.",
    tips: ["Open the trace to replay the test step by step.", "If the app is wrong, use File bug — the details are filled in for you."],
  }
}
