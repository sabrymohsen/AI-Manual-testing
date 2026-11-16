/**
 * Browsers & screen sizes a visual test can capture on. Browser-safe.
 *
 * `key` is part of a baseline's identity (page + environment), so it is derived
 * from what actually changes the rendering — engine, size, device emulation —
 * and never from the display name. Renaming "Chrome" to "Desktop Chrome" must
 * not orphan its baselines.
 */

export type VisualBrowser = "chromium" | "firefox" | "webkit"

export interface VisualEnvironment {
  key: string
  name: string
  browser: VisualBrowser
  width: number
  height: number
  /** Playwright device descriptor name ("Pixel 7"); sets user agent, touch and scale. */
  device?: string | null
}

export function environmentKey(env: Pick<VisualEnvironment, "browser" | "width" | "height" | "device">): string {
  const device = env.device ? `-${env.device.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""
  return `${env.browser}-${env.width}x${env.height}${device}`
}

function preset(name: string, browser: VisualBrowser, width: number, height: number, device?: string): VisualEnvironment {
  return { key: environmentKey({ browser, width, height, device }), name, browser, width, height, device: device ?? null }
}

export const ENVIRONMENT_PRESETS: VisualEnvironment[] = [
  preset("Chrome · Desktop", "chromium", 1440, 900),
  preset("Chrome · Laptop", "chromium", 1280, 720),
  preset("Firefox · Desktop", "firefox", 1440, 900),
  preset("Safari (WebKit) · Desktop", "webkit", 1440, 900),
  preset("Chrome · Android phone", "chromium", 412, 915, "Pixel 7"),
  preset("Safari · iPhone", "webkit", 390, 844, "iPhone 14"),
  preset("Safari · iPad", "webkit", 820, 1180, "iPad Air"),
]

export const DEFAULT_ENVIRONMENT_KEYS = [ENVIRONMENT_PRESETS[0].key]

/** Validate and normalise environments coming from a request or an old JSON column. */
export function sanitizeEnvironments(input: unknown): VisualEnvironment[] {
  if (!Array.isArray(input)) return []
  const out: VisualEnvironment[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const browser = r.browser
    if (browser !== "chromium" && browser !== "firefox" && browser !== "webkit") continue
    const width = Math.round(Number(r.width))
    const height = Math.round(Number(r.height))
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 240 || height < 240 || width > 3840 || height > 4320) continue
    const device = typeof r.device === "string" && r.device.trim() ? r.device.trim() : null
    const key = environmentKey({ browser, width, height, device })
    if (seen.has(key)) continue
    seen.add(key)
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 60) : `${browser} ${width}x${height}`
    out.push({ key, name, browser, width, height, device })
  }
  return out
}
