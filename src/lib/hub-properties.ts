import * as fs from "fs"
import * as path from "path"
import { WORKSPACE_ROOT } from "@/lib/hub-workspace"

/**
 * Run settings for the Automation Hub, edited in Data & Config → Properties.
 *
 * This was a catalog of SHAFT engine keys written to custom.properties — a file
 * consumed by a Maven run that could never start, so nothing typed here changed
 * anything. The catalog is now the Playwright options the runner genuinely
 * applies: hub-workspace.writeConfig reads this file when it generates the
 * config for each run, so a value saved here takes effect on the next run.
 *
 * Still a .properties file rather than JSON, because the editor, its diff view
 * and the history table are all built around key=value lines, and the format
 * costs nothing.
 */
export const SETTINGS_PATH = path.join(WORKSPACE_ROOT, "hub-settings.properties")

/** @deprecated old name; kept so existing imports resolve. */
export const CUSTOM_PROPS_PATH = SETTINGS_PATH

export type PropertyGroup =
  | "Browser"
  | "Execution"
  | "Synchronization"
  | "Evidence"
  | "Network"
  | "Other"

export type PropertyType = "boolean" | "number" | "string" | "enum"

export interface CatalogProperty {
  name: string
  group: PropertyGroup
  type: PropertyType
  default: string
  description: string
  /** allowed values for enum type */
  options?: string[]
  /** inclusive range for number type */
  min?: number
  max?: number
}

/**
 * Every entry maps to a real Playwright config option. Nothing is listed here
 * that the runner cannot apply — a settings screen whose switches do nothing is
 * worse than no settings screen.
 */
export const PROPERTY_CATALOG: CatalogProperty[] = [
  // ---- Browser ----
  { name: "browser", group: "Browser", type: "enum", default: "chromium", options: ["chromium", "firefox", "webkit"], description: "Playwright project used when a run does not name one." },
  { name: "headless", group: "Browser", type: "boolean", default: "true", description: "Run without a visible browser window. Required on a server." },
  { name: "viewportWidth", group: "Browser", type: "number", default: "1280", min: 320, max: 3840, description: "Viewport width in pixels." },
  { name: "viewportHeight", group: "Browser", type: "number", default: "720", min: 240, max: 2160, description: "Viewport height in pixels." },
  { name: "locale", group: "Browser", type: "string", default: "", description: "Browser locale, e.g. en-GB or ar-EG. Empty uses the system default." },
  { name: "timezoneId", group: "Browser", type: "string", default: "", description: "Timezone, e.g. Africa/Cairo. Empty uses the system default." },

  // ---- Execution ----
  { name: "workers", group: "Execution", type: "number", default: "1", min: 1, max: 16, description: "Parallel workers. One keeps run logs readable and ordered." },
  { name: "retries", group: "Execution", type: "number", default: "0", min: 0, max: 5, description: "Automatic retries before a test is reported as failed." },
  { name: "fullyParallel", group: "Execution", type: "boolean", default: "false", description: "Run tests within a file in parallel as well as across files." },
  { name: "slowMo", group: "Execution", type: "number", default: "0", min: 0, max: 5000, description: "Milliseconds to pause between actions. Useful when watching a run." },

  // ---- Synchronization ----
  { name: "timeout", group: "Synchronization", type: "number", default: "60000", min: 1000, max: 600000, description: "Milliseconds a single test may run before it is timed out." },
  { name: "expectTimeout", group: "Synchronization", type: "number", default: "5000", min: 100, max: 120000, description: "Milliseconds an expect() retries before failing." },
  { name: "navigationTimeout", group: "Synchronization", type: "number", default: "30000", min: 1000, max: 300000, description: "Milliseconds to wait for a navigation to complete." },
  { name: "actionTimeout", group: "Synchronization", type: "number", default: "0", min: 0, max: 300000, description: "Milliseconds for a single action. Zero means no separate limit." },

  // ---- Evidence ----
  { name: "trace", group: "Evidence", type: "enum", default: "on", options: ["on", "off", "retain-on-failure", "on-first-retry"], description: "When a Playwright trace is recorded. The Trace Viewer reads these." },
  { name: "video", group: "Evidence", type: "enum", default: "on", options: ["on", "off", "retain-on-failure", "on-first-retry"], description: "When the browser session is recorded." },
  { name: "screenshot", group: "Evidence", type: "enum", default: "on", options: ["on", "off", "only-on-failure"], description: "When screenshots are captured." },

  // ---- Network ----
  { name: "baseURL", group: "Network", type: "string", default: "", description: "Base URL, so a spec can call page.goto(\"/path\")." },
  { name: "ignoreHTTPSErrors", group: "Network", type: "boolean", default: "false", description: "Continue past invalid TLS certificates. Useful on staging." },
  { name: "userAgent", group: "Network", type: "string", default: "", description: "Override the browser user agent. Empty uses the browser default." },
  { name: "extraHTTPHeaders", group: "Network", type: "string", default: "", description: "Extra headers as name: value pairs separated by ';'." },
]


const CATALOG_BY_NAME = new Map(PROPERTY_CATALOG.map((p) => [p.name, p]))

export function getCatalogProperty(name: string): CatalogProperty | undefined {
  return CATALOG_BY_NAME.get(name)
}

/** Parse the settings file into a flat key→value map (comments ignored). */
export function readProps(): Record<string, string> {
  if (!fs.existsSync(SETTINGS_PATH)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(SETTINGS_PATH, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

/**
 * Insert or update a single key in a .properties file body, preserving the
 * rest of the file (comments, ordering, unrelated keys).
 */
export function upsertProp(body: string, key: string, value: string): string {
  const lines = body.split("\n")
  let found = false
  const next = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`) || line.trim() === key) {
      found = true
      return `${key}=${value}`
    }
    return line
  })
  if (!found) next.push(`${key}=${value}`)
  return next.join("\n")
}

/** Remove a key entirely from a .properties file body. */
export function removeProp(body: string, key: string): string {
  return body
    .split("\n")
    .filter((line) => !(line.trim().startsWith(`${key}=`) || line.trim() === key))
    .join("\n")
}

/** Apply a batch of key→value writes to the settings file on disk. */
export function writeProps(updates: Record<string, string>): void {
  let content = fs.existsSync(SETTINGS_PATH)
    ? fs.readFileSync(SETTINGS_PATH, "utf8")
    : ""
  for (const [key, value] of Object.entries(updates)) {
    content = upsertProp(content, key, value)
  }
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, content, "utf8")
}

/** Validate a value against its catalog entry. Returns an error string or null. */
export function validateValue(name: string, value: string): string | null {
  const meta = CATALOG_BY_NAME.get(name)
  if (!meta) return null // unknown/custom key — no constraints to enforce
  switch (meta.type) {
    case "boolean":
      if (value !== "true" && value !== "false") return `${name} must be true or false`
      return null
    case "number": {
      const n = Number(value)
      if (!Number.isFinite(n)) return `${name} must be a number`
      if (meta.min !== undefined && n < meta.min) return `${name} must be ≥ ${meta.min}`
      if (meta.max !== undefined && n > meta.max) return `${name} must be ≤ ${meta.max}`
      return null
    }
    case "enum":
      if (meta.options && !meta.options.includes(value))
        return `${name} must be one of: ${meta.options.join(", ")}`
      return null
    default:
      return null
  }
}
