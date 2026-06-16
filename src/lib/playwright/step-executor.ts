import { Page } from "playwright"

interface Step {
  actionType: string
  targetType: string
  targetValue?: string | null
  inputValue?: string | null
  timeoutMs: number
}

function getLocator(page: Page, targetType: string, targetValue?: string | null) {
  console.log(`[step-executor] getLocator called with targetType=${targetType}, targetValue=${JSON.stringify(targetValue)}`)
  if (!targetValue) return page.locator("html")

  switch (targetType) {
    case "test_id":
      return page.getByTestId(targetValue)
    case "role": {
      const match = targetValue.match(/^([^,]+),\s*name:\s*["'](.+)["']$/)
      console.log(`[step-executor] role match result for ${JSON.stringify(targetValue)}:`, match)
      if (match) {
        const role = match[1].trim() as any
        const name = match[2]
        console.log(`[step-executor] Parsed role=${role}, name=${name}`)
        let loc = page.getByRole(role, { name, exact: false })
        if (role === "link") {
          loc = loc.or(page.locator("a").filter({ hasText: name }))
        } else if (role === "button") {
          loc = loc.or(page.locator("button, [role='button']").filter({ hasText: name }))
        }
        return loc
      }
      return page.getByRole(targetValue as any)
    }
    case "text":
      return page.getByText(targetValue, { exact: false })
    case "label":
      return page.getByLabel(targetValue)
    case "placeholder":
      return page.getByPlaceholder(targetValue)
    case "css":
      return page.locator(targetValue)
    case "xpath":
      return page.locator(targetValue)
    default:
      return page.locator(targetValue)
  }
}

export async function executeStep(page: Page, step: Step): Promise<void> {
  const { actionType, targetType, targetValue, inputValue, timeoutMs } = step
  const locator = getLocator(page, targetType, targetValue)
  const timeout = Math.max(timeoutMs || 0, 45000)

  switch (actionType) {
    case "open_url":
      await page.goto(inputValue || targetValue || "", {
        waitUntil: "domcontentloaded",
        timeout: timeout,
      })
      // Wait for Angular/other SPA loading splash screen to disappear if present
      try {
        const loaderSelector = "app-splash-screen, .splash-screen, #loader, .loading-dots"
        console.log(`[step-executor] Checking for SPA loader...`)
        await page.locator(loaderSelector).first().waitFor({ state: "visible", timeout: 3000 })
        console.log(`[step-executor] SPA loader detected. Waiting for all loaders to be hidden...`)
        await page.waitForFunction((sel) => {
          return Array.from(document.querySelectorAll(sel)).every((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width === 0 || rect.height === 0
          })
        }, loaderSelector, { timeout: timeout })
        console.log(`[step-executor] SPA loaders are hidden. Proceeding with steps.`)
      } catch (e) {
        console.log(`[step-executor] No SPA loader appeared within timeout or check finished. Proceeding.`)
      }
      break

    case "click":
      await locator.waitFor({ state: "visible", timeout })
      await locator.click()
      break

    case "fill":
      await locator.waitFor({ state: "visible", timeout })
      await locator.fill(inputValue || "")
      break

    case "select":
      await locator.waitFor({ state: "visible", timeout })
      await locator.selectOption(inputValue || "")
      break

    case "upload_file":
      await locator.waitFor({ state: "visible", timeout })
      await locator.setInputFiles(inputValue || "")
      break

    case "wait_for_text":
      await page.getByText(targetValue || "", { exact: false }).waitFor({
        state: "visible",
        timeout,
      })
      break

    case "wait_for_url":
      await page.waitForURL(targetValue || "", { timeout })
      break

    case "assert_visible":
      await locator.waitFor({ state: "visible", timeout })
      break

    case "assert_hidden":
      await locator.waitFor({ state: "hidden", timeout })
      break

    case "assert_text":
      await locator.waitFor({ state: "visible", timeout })
      break

    case "assert_url":
      await page.waitForURL(targetValue || "", { timeout })
      break

    case "screenshot":
      // Screenshot is handled automatically by the runner
      break

    case "assert_api_status":
      // API status assertion is handled by the assertion runner
      break

    case "custom_instruction":
      // Custom steps use actionDescription only (manual or AI-generated)
      await page.waitForTimeout(500)
      break

    default:
      throw new Error(`Unknown action type: ${actionType}`)
  }
}
