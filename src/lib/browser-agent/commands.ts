/**
 * The playwright-cli commands the Browser Agent may send, and their argument
 * rules. The same list is enforced on the server and in the desktop app
 * (desktop/src/browser-agent.js keeps a copy): no run-code / eval, no file
 * access, no network mocking, no session-wide kills.
 */

export type BaCommand =
  | "open"
  | "goto"
  | "click"
  | "dblclick"
  | "fill"
  | "type"
  | "select"
  | "check"
  | "uncheck"
  | "hover"
  | "press"
  | "snapshot"
  | "screenshot"
  | "generate-locator"
  | "go-back"
  | "go-forward"
  | "reload"
  | "dialog-accept"
  | "dialog-dismiss"
  | "tab-list"
  | "tab-select"
  | "resize"
  | "close"

const REF = /^(?:f\d+)?e\d{1,6}$/
const KEY = /^[A-Za-z0-9+]{1,30}$/
const isUrl = (s: string) => {
  try {
    const u = new URL(s)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}
const text = (s: unknown, max = 2000) => typeof s === "string" && s.length <= max

/** [command, number of args, check] */
const RULES: Record<BaCommand, (a: string[]) => boolean> = {
  open: (a) => a.length === 0 || (a.length === 1 && isUrl(a[0])),
  goto: (a) => a.length === 1 && isUrl(a[0]),
  click: (a) => a.length === 1 && REF.test(a[0]),
  dblclick: (a) => a.length === 1 && REF.test(a[0]),
  hover: (a) => a.length === 1 && REF.test(a[0]),
  check: (a) => a.length === 1 && REF.test(a[0]),
  uncheck: (a) => a.length === 1 && REF.test(a[0]),
  "generate-locator": (a) => a.length === 1 && REF.test(a[0]),
  fill: (a) => a.length === 2 && REF.test(a[0]) && text(a[1]),
  select: (a) => a.length === 2 && REF.test(a[0]) && text(a[1], 500),
  type: (a) => a.length === 1 && text(a[0]),
  press: (a) => a.length === 1 && KEY.test(a[0]),
  snapshot: (a) => a.length === 0,
  screenshot: (a) => a.length === 0,
  "go-back": (a) => a.length === 0,
  "go-forward": (a) => a.length === 0,
  reload: (a) => a.length === 0,
  "dialog-accept": (a) => a.length === 0 || (a.length === 1 && text(a[0], 500)),
  "dialog-dismiss": (a) => a.length === 0,
  "tab-list": (a) => a.length === 0,
  "tab-select": (a) => a.length === 1 && /^\d{1,2}$/.test(a[0]),
  resize: (a) => a.length === 2 && a.every((n) => /^\d{3,4}$/.test(n)),
  close: (a) => a.length === 0,
}

export const BA_COMMANDS = Object.keys(RULES) as BaCommand[]

/** null when allowed, else why not. */
export function commandError(cmd: unknown, args: unknown): string | null {
  if (typeof cmd !== "string" || !(cmd in RULES)) return `"${String(cmd)}" isn't an allowed browser command`
  if (!Array.isArray(args) || !args.every((a) => typeof a === "string")) return "Arguments must be a list of text values"
  // A value starting with "-" would be read as a playwright-cli option.
  if (args.some((a, i) => a.startsWith("-") && !(cmd === "fill" && i === 1) && !(cmd === "type") && !(cmd === "select" && i === 1))) {
    return "Arguments can't start with -"
  }
  if (!RULES[cmd as BaCommand](args as string[])) return `Invalid arguments for "${cmd}"`
  return null
}

/** Command-line words for playwright-cli: values that start with "-" go after "--". */
export function cliArgs(session: string, cmd: BaCommand, args: string[], opts: { headed?: boolean; browser?: string; config?: string } = {}): string[] {
  const out = [`-s=${session}`, "--json", cmd]
  if (cmd === "open") {
    if (opts.headed) out.push("--headed")
    if (opts.browser) out.push(`--browser=${opts.browser}`)
    if (opts.config) out.push(`--config=${opts.config}`)
  }
  if (args.some((a) => a.startsWith("-"))) out.push("--")
  return [...out, ...args]
}
