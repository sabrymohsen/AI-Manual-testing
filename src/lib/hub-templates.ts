// Shared Playwright test templates used by the Test Studio (UI + API seed).
//
// These were SHAFT/TestNG Java classes, run through `mvn test` against a
// workspace that had no pom.xml and no sources — so nothing here was ever
// executable. They are now @playwright/test specs, which the hub runner can
// actually run, on a laptop or in a container.

export type HubScriptType = "Web" | "API" | "Database"

export interface HubTemplate {
  name: string
  type: HubScriptType
  tags: string[]
  code: string
}

/**
 * A fresh script body for the "New Test" dropdown.
 *
 * `title` is the readable name shown in reports; the file name comes from the
 * script's own name, so the two are kept in step by the caller.
 */
export function buildTemplateCode(type: HubScriptType, className: string): string {
  const title = className.replace(/([a-z0-9])([A-Z])/g, "$1 $2")

  if (type === "API") {
    return `import { test, expect } from "@playwright/test"

test("${title} — verify API response", async ({ request }) => {
  const res = await request.get("https://reqres.in/api/users?page=2")

  expect(res.status()).toBe(200)

  const body = await res.json()
  expect(body.page).toBe(2)
  expect(Array.isArray(body.data)).toBe(true)
})
`
  }

  if (type === "Database") {
    // Kept dependency-free: the hub cannot assume a driver is installed, and a
    // template that fails to import is worse than one that shows the shape.
    return `import { test, expect } from "@playwright/test"

/**
 * Database checks run through your API rather than a direct driver, so the
 * spec needs no extra dependency and runs anywhere the app runs. Point it at
 * an endpoint that reads the rows you care about.
 */
test("${title} — verify persisted data", async ({ request }) => {
  const res = await request.get("https://reqres.in/api/users/2")
  expect(res.ok()).toBeTruthy()

  const { data } = await res.json()
  expect(data).toBeTruthy()
  expect(data.id).toBe(2)
  expect(data.email).toContain("@")
})
`
  }

  return `import { test, expect } from "@playwright/test"

test("${title}", async ({ page }) => {
  await page.goto("https://practice.expandtesting.com/login")

  await page.getByLabel("Username").fill("practice")
  await page.getByLabel("Password").fill("SuperSecretPassword!")
  await page.getByRole("button", { name: "Login" }).click()

  await expect(page.getByText("You logged into a secure area!")).toBeVisible()
})
`
}

export const DEFAULT_HUB_TEMPLATES: HubTemplate[] = [
  {
    name: "LoginFlowTest",
    type: "Web",
    tags: ["smoke", "auth"],
    code: buildTemplateCode("Web", "LoginFlowTest"),
  },
  {
    name: "ApiCrudTest",
    type: "API",
    tags: ["api", "regression"],
    code: buildTemplateCode("API", "ApiCrudTest"),
  },
  {
    name: "DbQueryTest",
    type: "Database",
    tags: ["data"],
    code: buildTemplateCode("Database", "DbQueryTest"),
  },
  {
    name: "SearchFlowTest",
    type: "Web",
    tags: ["search", "regression"],
    code: `import { test, expect } from "@playwright/test"

test("Search returns results for a known term", async ({ page }) => {
  await page.goto("https://practice.expandtesting.com/search")

  await page.getByPlaceholder("Search").fill("test")
  await page.getByRole("button", { name: "Search" }).click()

  await expect(page.getByRole("list")).toBeVisible()
  await expect(page.getByRole("listitem")).not.toHaveCount(0)
})
`,
  },
  {
    name: "FormSubmitTest",
    type: "Web",
    tags: ["forms", "regression"],
    code: `import { test, expect } from "@playwright/test"

test("Contact form accepts a valid submission", async ({ page }) => {
  await page.goto("https://practice.expandtesting.com/inputs")

  await page.getByRole("textbox", { name: "Input: Text" }).fill("QA Automation Hub")
  await page.getByRole("spinbutton").fill("42")

  await expect(page.getByRole("textbox", { name: "Input: Text" })).toHaveValue("QA Automation Hub")
})
`,
  },
]
