import { test, expect } from "@playwright/test"

test.describe("Projects Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Register and login before each project test
    const uniqueEmail = `project-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`

    await page.goto("/register")
    await page.fill('input[name="name"]', "Project Test User")
    await page.fill('input[name="email"]', uniqueEmail)
    await page.fill('input[name="password"]', "password123")
    await page.fill('input[name="confirmPassword"]', "password123")
    await page.click('button[type="submit"]')
    await page.waitForURL("/dashboard")
  })

  test("creating a project through the UI", async ({ page }) => {
    await page.goto("/projects/new")
    await page.fill('input[name="name"]', "E2E Test Project")
    await page.fill('input[name="webAppUrl"]', "https://example.com")
    await page.selectOption('select[name="environment"]', "Staging")
    await page.click('main form button[type="submit"]')

    // After creation, app redirects to the project detail page
    await page.waitForURL(/\/projects\/[^/]+$/)
    await expect(page.locator("h1", { hasText: "E2E Test Project" })).toBeVisible()
  })

  test("project list displays created project", async ({ page }) => {
    const projectName = `List Test ${Date.now()}`

    // Create a project
    await page.goto("/projects/new")
    await page.fill('input[name="name"]', projectName)
    await page.fill('input[name="webAppUrl"]', "https://example.com")
    await page.click('main form button[type="submit"]')
    await page.waitForURL(/\/projects\/[^/]+$/)

    // Navigate to projects list
    await page.goto("/projects")
    await expect(page.locator(`text=${projectName}`)).toBeVisible()
  })
})
