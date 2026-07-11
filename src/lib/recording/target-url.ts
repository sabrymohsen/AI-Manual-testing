/**
 * Guards against Live QA / recording targets that the recorder's headless
 * browser can never reach. The browser runs on the server hosting the app, so
 * a loopback target (localhost, 127.0.0.1, …) only works when the app itself
 * is running on the tester's machine — on a hosted deployment (Railway, etc.)
 * it points at the container and navigation fails with a cryptic error.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "[::1]"])

export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (LOOPBACK_HOSTS.has(h) || h.endsWith(".localhost")) return true
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
}

/**
 * Returns a human-readable error when `startUrl` is a loopback address but the
 * app itself is NOT being served from a loopback host (i.e. we're deployed),
 * or null when the target is fine.
 */
export function loopbackTargetError(startUrl: string, requestHost: string | null | undefined): string | null {
  let target: URL
  try {
    target = new URL(startUrl)
  } catch {
    return null // let the regular URL validation report this
  }
  if (!isLoopbackHost(target.hostname)) return null

  // Requests to a local dev server arrive with a loopback Host header —
  // there, localhost targets are legitimate.
  const appHost = (requestHost || "").split(":")[0]
  if (appHost && isLoopbackHost(appHost)) return null

  return (
    `Target URL "${startUrl}" points to localhost, which is not reachable from this server — ` +
    `the recording browser runs on the deployment, not on your machine. ` +
    `Use a publicly accessible URL for the app you want to test.`
  )
}
