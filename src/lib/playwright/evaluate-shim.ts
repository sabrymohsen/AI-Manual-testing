import type { Page } from "playwright"

/**
 * The worker runs through tsx (esbuild with keepNames), which rewrites named
 * functions inside page.evaluate callbacks to call a `__name` helper. That
 * helper exists in Node, not in the browser, so the callback throws
 * "ReferenceError: __name is not defined" in the page — and most callers catch
 * and carry on, so the feature silently does nothing. Defining a no-op helper in
 * the page first makes those callbacks run. The string form is not transformed.
 */
export async function ensureEvaluateShim(page: Page): Promise<void> {
  await page.evaluate("globalThis.__name = globalThis.__name || ((fn) => fn)").catch(() => {})
}
