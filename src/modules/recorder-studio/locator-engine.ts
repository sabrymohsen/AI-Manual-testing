import { isSelectorStable, normalizeSelector } from "../core/utils"

/**
 * LocatorEngine analyzes elements tag, attribute lists, text, and generates CSS, XPath, and ID selectors.
 * Scores reliability to match Playwright's locator recommendations.
 */
export class LocatorEngine {
  /**
   * Evaluates alternative selectors and assigns an execution reliability score.
   */
  static scoreSelector(selector: string, tagName: string): number {
    const normalized = normalizeSelector(selector)
    if (!normalized) return 0

    let score = 50

    // Check stability
    if (isSelectorStable(normalized)) {
      score += 30
    }

    // Tag specific modifiers
    if (tagName.toLowerCase() === "button" || tagName.toLowerCase() === "a") {
      score += 10
    }

    // Overly nested or long selectors decrease reliability
    if (normalized.split(" ").length > 4) {
      score -= 20
    }

    return Math.min(Math.max(score, 10), 100)
  }

  /**
   * Generates a smart fallback chain of selectors.
   */
  static generateFallbackChain(css: string, xpath?: string, id?: string): string[] {
    const chain: string[] = []
    if (id) chain.push(`#${id}`)
    if (css) chain.push(css)
    if (xpath) chain.push(xpath)
    return chain.map(normalizeSelector).filter(Boolean)
  }
}
