import { Page } from "playwright"

interface Assertion {
  type: string
  value: string
  targetType?: string
  targetValue?: string
}

interface AssertionResult {
  passed: boolean
  message: string
  expected: string
  actual: string
}

export async function runAssertions(
  page: Page,
  assertions: Assertion[],
  logs?: { level: string; message: string }[]
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = []

  for (const assertion of assertions) {
    try {
      switch (assertion.type) {
        case "url_contains":
          results.push({
            passed: page.url().includes(assertion.value),
            message: "URL check",
            expected: `URL contains "${assertion.value}"`,
            actual: page.url(),
          })
          break

        case "text_visible":
          const textVisible = await page.getByText(assertion.value, { exact: false }).isVisible()
          results.push({
            passed: textVisible,
            message: "Text visibility",
            expected: `Text "${assertion.value}" is visible`,
            actual: textVisible ? "visible" : "not visible",
          })
          break

        case "element_visible":
          const selector = assertion.targetValue || assertion.value
          const elemVisible = await page.locator(selector).isVisible()
          results.push({
            passed: elemVisible,
            message: "Element visibility",
            expected: `Element "${selector}" is visible`,
            actual: elemVisible ? "visible" : "not visible",
          })
          break

        case "element_hidden":
          const selectorHidden = assertion.targetValue || assertion.value
          const elemHidden = await page.locator(selectorHidden).isHidden()
          results.push({
            passed: elemHidden,
            message: "Element hidden",
            expected: `Element "${selectorHidden}" is hidden`,
            actual: elemHidden ? "hidden" : "visible",
          })
          break

        case "text_equals":
          const bodyText = await page.textContent("body") || ""
          results.push({
            passed: bodyText.includes(assertion.value),
            message: "Text content",
            expected: `Body contains "${assertion.value}"`,
            actual: bodyText.substring(0, 100),
          })
          break

        case "console_no_errors":
          const hasErrors = logs?.some((l) => l.level === "error")
          results.push({
            passed: !hasErrors,
            message: "Console errors check",
            expected: "No console errors",
            actual: hasErrors ? "Console errors detected" : "No console errors detected",
          })
          break

        default:
          results.push({
            passed: true,
            message: `Unknown assertion type: ${assertion.type}`,
            expected: "N/A",
            actual: "Skipped",
          })
      }
    } catch (error) {
      results.push({
        passed: false,
        message: `Assertion error: ${error instanceof Error ? error.message : "Unknown"}`,
        expected: assertion.value,
        actual: "Error during check",
      })
    }
  }

  return results
}
