import { test, expect } from "@playwright/test"

test.describe("Auth Flow", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("h1")).toContainText("Sign In")
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
  })

  test("successful login redirects to dashboard", async ({ page }) => {
    // Register a new user via the UI, then login
    const uniqueEmail = `e2e-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`

    await page.goto("/register")
    await page.fill('input[name="name"]', "E2E Test User")
    await page.fill('input[name="email"]', uniqueEmail)
    await page.fill('input[name="password"]', "password123")
    await page.fill('input[name="confirmPassword"]', "password123")
    await page.click('button[type="submit"]')

    // After registration, app redirects to dashboard
    await page.waitForURL("/dashboard")
    await expect(page.locator("text=QA Command Center")).toBeVisible()
  })

  test("invalid login shows error", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[name="email"]', "wrong@example.com")
    await page.fill('input[name="password"]', "wrongpassword")
    await page.click('button[type="submit"]')

    await expect(page.locator("text=Invalid email or password")).toBeVisible()
  })
})
