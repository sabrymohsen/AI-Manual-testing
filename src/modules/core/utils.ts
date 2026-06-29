/**
 * Core Shared Utility Functions for elements parsing and encryption.
 */

/**
 * Normalizes selectors by trimming spacing and reducing dynamic hashes.
 */
export function normalizeSelector(selector: string): string {
  if (!selector) return ""
  return selector
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\[id^="ember"\d+\]/g, "") // example dynamic hashes cleanup
}

/**
 * Determines whether a selector is likely to be stable.
 */
export function isSelectorStable(selector: string): boolean {
  if (!selector) return false
  
  // Dynamic attribute hashes are unstable
  if (selector.includes("ember") || selector.includes("jss") || selector.includes("styled")) {
    return false
  }

  // ID selectors or data-testids are highly stable
  if (selector.startsWith("#") || selector.includes("data-testid") || selector.includes("data-qa")) {
    return true
  }

  return selector.length < 60
}

/**
 * Base64 helper encryption / obfuscation utility
 */
export function obfuscateToken(token: string): string {
  if (!token) return ""
  return Buffer.from(token).toString("base64").substring(0, 12) + "..."
}
