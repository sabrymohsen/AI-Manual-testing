import { Page } from "playwright"

interface LoginOptions {
  url: string
  username: string
  password: string
}

const COMMON_EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[name="login"]',
  'input[placeholder*="email" i]',
  'input[placeholder*="username" i]',
  "input#email",
  "input#username",
]

const COMMON_PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[placeholder*="password" i]',
  "input#password",
]

const COMMON_SUBMIT_SELECTORS = [
  'button[type="submit"]',
  "button:has-text('Login')",
  "button:has-text('Sign in')",
  "button:has-text('Log in')",
  'input[type="submit"]',
]

export async function handleLogin(page: Page, options: LoginOptions): Promise<void> {
  await page.goto(options.url, { waitUntil: "load" })

  // Try to find and fill email/username field
  for (const selector of COMMON_EMAIL_SELECTORS) {
    const field = page.locator(selector)
    if (await field.isVisible().catch(() => false)) {
      await field.fill(options.username)
      break
    }
  }

  // Try to find and fill password field
  for (const selector of COMMON_PASSWORD_SELECTORS) {
    const field = page.locator(selector)
    if (await field.isVisible().catch(() => false)) {
      await field.fill(options.password)
      break
    }
  }

  // Try to find and click submit button
  for (const selector of COMMON_SUBMIT_SELECTORS) {
    const button = page.locator(selector)
    if (await button.isVisible().catch(() => false)) {
      await button.click()
      break
    }
  }

  // Wait for navigation after login
  await page.waitForLoadState("load").catch(() => {})
}
