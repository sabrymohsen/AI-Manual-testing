import * as fs from "fs"
import * as path from "path"
import { ARTIFACT_ROOT } from "@/lib/hub-evidence"

// custom.properties is SHAFT's single source of truth for engine configuration.
// The Data & Config → Properties editor reads/writes this file so the next
// SHAFT run picks up whatever the user saved in the UI.
export const CUSTOM_PROPS_PATH = path.join(
  ARTIFACT_ROOT,
  "src/main/resources/properties/custom.properties"
)

export type PropertyGroup =
  | "Browser"
  | "Execution"
  | "Synchronization"
  | "Evidence"
  | "Healing"
  | "AI"
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

// Curated catalog of the SHAFT engine properties surfaced in the editor.
// SHAFT ships these defaults internally (the on-disk default.properties is not
// part of this repo), so the catalog is the authoritative list of names,
// groups, types and descriptions. Actual values come from custom.properties.
export const PROPERTY_CATALOG: CatalogProperty[] = [
  // ---- Browser ----
  { name: "targetBrowserName", group: "Browser", type: "enum", default: "chrome", options: ["chrome", "firefox", "edge", "safari", "webkit"], description: "Browser the engine launches for web tests." },
  { name: "headlessExecution", group: "Browser", type: "boolean", default: "false", description: "Run the browser without a visible UI window." },
  { name: "executionAddress", group: "Browser", type: "string", default: "local", description: "Where tests run: 'local', a Selenium Grid host, or 'browserstack'." },
  { name: "targetOperatingSystem", group: "Browser", type: "enum", default: "Linux-64", options: ["Linux-64", "Windows-64", "Mac-64"], description: "Operating system reported to the driver / grid." },
  { name: "isMobileExecution", group: "Browser", type: "boolean", default: "false", description: "Route execution through Appium for mobile targets." },

  // ---- Execution ----
  { name: "setParallel", group: "Execution", type: "enum", default: "NONE", options: ["NONE", "METHODS", "CLASSES", "TESTS"], description: "TestNG parallelization strategy." },
  { name: "threadCount", group: "Execution", type: "number", default: "1", min: 1, max: 64, description: "Number of parallel threads when setParallel is enabled." },
  { name: "retryMaximumNumberOfAttempts", group: "Execution", type: "number", default: "0", min: 0, max: 10, description: "Automatic retries for a failing test before it is marked failed." },
  { name: "maximumPerformanceMode", group: "Execution", type: "boolean", default: "false", description: "Disable animations/waits/logging niceties to run as fast as possible." },
  { name: "aiEnabledExecution", group: "Execution", type: "boolean", default: "false", description: "Enable AI-assisted execution features globally." },

  // ---- Synchronization ----
  { name: "browserNavigationTimeout", group: "Synchronization", type: "number", default: "60", min: 1, max: 600, description: "Seconds to wait for page navigation to complete." },
  { name: "defaultElementIdentificationTimeout", group: "Synchronization", type: "number", default: "60", min: 1, max: 600, description: "Seconds to wait for an element before failing." },
  { name: "attemptsBeforeThrowingElementNotFoundException", group: "Synchronization", type: "number", default: "6", min: 1, max: 60, description: "Locate retries before an element-not-found error is thrown." },
  { name: "waitForLazyLoading", group: "Synchronization", type: "boolean", default: "true", description: "Wait for lazy-loaded / async content to settle before acting." },

  // ---- Evidence ----
  { name: "evidenceLevel", group: "Evidence", type: "enum", default: "STANDARD", options: ["MINIMAL", "STANDARD", "CUSTOM", "MAXIMUM"], description: "How much evidence (screenshots/logs/attachments) is captured." },
  { name: "screenshotParams_whenToTakeAScreenshot", group: "Evidence", type: "enum", default: "ValidationPointsOnly", options: ["Always", "Never", "ValidationPointsOnly", "FailuresOnly"], description: "When the engine captures screenshots." },
  { name: "createAnimatedGif", group: "Evidence", type: "boolean", default: "false", description: "Assemble an animated GIF of the run from screenshots." },
  { name: "videoParams.recordVideo", group: "Evidence", type: "boolean", default: "false", description: "Record a video of the browser session." },
  { name: "screenshotParams_highlightElements", group: "Evidence", type: "boolean", default: "true", description: "Draw a highlight box around the acted-on element in screenshots." },

  // ---- Healing ----
  { name: "selfHealingEnabled", group: "Healing", type: "boolean", default: "false", description: "Allow the engine to auto-repair broken locators at runtime." },
  { name: "healing.strategy", group: "Healing", type: "enum", default: "shaft-heal", options: ["shaft-heal", "healenium", "none"], description: "Locator self-healing backend." },
  { name: "healing.minimumTrustPercentage", group: "Healing", type: "number", default: "75", min: 0, max: 100, description: "Confidence threshold before a healed locator is accepted." },

  // ---- AI ----
  { name: "pilot.enabled", group: "AI", type: "boolean", default: "false", description: "Enable the SHAFT Pilot AI test-authoring assistant." },
  { name: "ai.model", group: "AI", type: "string", default: "", description: "Model identifier used by AI-powered SHAFT modules." },
  { name: "ai.apiBaseUrl", group: "AI", type: "string", default: "", description: "Base URL for the AI provider endpoint." },
]

const CATALOG_BY_NAME = new Map(PROPERTY_CATALOG.map((p) => [p.name, p]))

export function getCatalogProperty(name: string): CatalogProperty | undefined {
  return CATALOG_BY_NAME.get(name)
}

/** Parse a Java .properties file into a flat key→value map (comments ignored). */
export function readProps(): Record<string, string> {
  if (!fs.existsSync(CUSTOM_PROPS_PATH)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(CUSTOM_PROPS_PATH, "utf8").split("\n")) {
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

/** Apply a batch of key→value writes to custom.properties on disk. */
export function writeProps(updates: Record<string, string>): void {
  let content = fs.existsSync(CUSTOM_PROPS_PATH)
    ? fs.readFileSync(CUSTOM_PROPS_PATH, "utf8")
    : ""
  for (const [key, value] of Object.entries(updates)) {
    content = upsertProp(content, key, value)
  }
  fs.mkdirSync(path.dirname(CUSTOM_PROPS_PATH), { recursive: true })
  fs.writeFileSync(CUSTOM_PROPS_PATH, content, "utf8")
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
