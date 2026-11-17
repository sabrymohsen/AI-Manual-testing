// Playwright JavaScript templates for the Automation Hub (the "New test" menu
// and the starter tests a project gets the first time it opens the hub).
//
// These were SHAFT/TestNG Java classes, run through `mvn test` against a
// workspace with no pom.xml — nothing here could ever execute. They are now
// plain Playwright JavaScript (.spec.js); each was run against its real site
// when written (the-internet.herokuapp.com and dummyjson.com,
// both public practice targets).

export type HubScriptType = "Web" | "API" | "Database"

export interface HubTemplate {
  name: string
  type: HubScriptType
  folder: string
  tags: string[]
  code: string
}

/** Starting point for a brand-new test of the given type. */
export function buildTemplateCode(type: HubScriptType, name: string): string {
  const title = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim()

  if (type === "API" || type === "Database") {
    return `import { test, expect } from "@playwright/test"

// API test: \`request\` sends HTTP calls without opening a browser.
test("${title}", async ({ request }) => {
  const res = await request.get("https://dummyjson.com/users/1")
  expect(res.status()).toBe(200)

  const user = await res.json()
  expect(user.id).toBe(1)
  expect(user.email).toContain("@")
})
`
  }

  return `import { test, expect } from "@playwright/test"

test("${title}", async ({ page }) => {
  // 1. Open the page
  await page.goto("https://the-internet.herokuapp.com/login")

  // 2. Act like a user: find elements by their label, role or text
  await page.getByLabel("Username").fill("tomsmith")
  await page.getByLabel("Password").fill("SuperSecretPassword!")
  await page.getByRole("button", { name: "Login" }).click()

  // 3. Check the result
  await expect(page.getByText("You logged into a secure area!")).toBeVisible()
})
`
}

export const DEFAULT_HUB_TEMPLATES: HubTemplate[] = [
  {
    name: "LoginFlowTest",
    type: "Web",
    folder: "Smoke",
    tags: ["smoke", "auth"],
    code: `import { test, expect } from "@playwright/test"

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("https://the-internet.herokuapp.com/login")
  })

  test("valid credentials open the secure area", async ({ page }) => {
    await page.getByLabel("Username").fill("tomsmith")
    await page.getByLabel("Password").fill("SuperSecretPassword!")
    await page.getByRole("button", { name: "Login" }).click()

    await expect(page).toHaveURL(/\\/secure/)
    await expect(page.getByText("You logged into a secure area!")).toBeVisible()
  })

  test("wrong password shows an error", async ({ page }) => {
    await page.getByLabel("Username").fill("tomsmith")
    await page.getByLabel("Password").fill("wrong-password")
    await page.getByRole("button", { name: "Login" }).click()

    await expect(page.getByText("Your password is invalid!")).toBeVisible()
    await expect(page).toHaveURL(/\\/login/)
  })
})
`,
  },
  {
    name: "CheckboxesTest",
    type: "Web",
    folder: "Smoke",
    tags: ["smoke", "forms"],
    code: `import { test, expect } from "@playwright/test"

test("checkboxes can be checked and unchecked", async ({ page }) => {
  await page.goto("https://the-internet.herokuapp.com/checkboxes")

  const first = page.getByRole("checkbox").first()
  const second = page.getByRole("checkbox").nth(1)

  await first.check()
  await expect(first).toBeChecked()

  await second.uncheck()
  await expect(second).not.toBeChecked()
})
`,
  },
  {
    name: "DropdownTest",
    type: "Web",
    folder: "Regression",
    tags: ["regression", "forms"],
    code: `import { test, expect } from "@playwright/test"

test("dropdown keeps the chosen option", async ({ page }) => {
  await page.goto("https://the-internet.herokuapp.com/dropdown")

  const dropdown = page.locator("#dropdown")
  await dropdown.selectOption({ label: "Option 2" })

  await expect(dropdown).toHaveValue("2")
})
`,
  },
  {
    name: "DynamicLoadingTest",
    type: "Web",
    folder: "Regression",
    tags: ["regression", "waits"],
    code: `import { test, expect } from "@playwright/test"

// Playwright waits automatically: no sleep() needed for content that loads late.
test("text appears after loading finishes", async ({ page }) => {
  await page.goto("https://the-internet.herokuapp.com/dynamic_loading/2")

  await page.getByRole("button", { name: "Start" }).click()

  await expect(page.getByRole("heading", { name: "Hello World!" })).toBeVisible({ timeout: 15000 })
})
`,
  },
  {
    name: "ApiCrudTest",
    type: "API",
    folder: "API",
    tags: ["api", "regression"],
    code: `import { test, expect } from "@playwright/test"

const API = "https://dummyjson.com"

test.describe("Posts API", () => {
  test("lists posts", async ({ request }) => {
    const res = await request.get(\`\${API}/posts?limit=5\`)
    expect(res.ok()).toBeTruthy()

    const { posts } = await res.json()
    expect(posts.length).toBeGreaterThan(0)
    expect(posts[0]).toHaveProperty("title")
  })

  test("creates a post", async ({ request }) => {
    const res = await request.post(\`\${API}/posts/add\`, {
      data: { title: "QA Engine", body: "Created from the Automation Hub", userId: 1 },
    })
    expect(res.status()).toBe(201)

    const post = await res.json()
    expect(post.title).toBe("QA Engine")
    expect(post.id).toBeTruthy()
  })

  test("unknown post returns 404", async ({ request }) => {
    const res = await request.get(\`\${API}/posts/999999\`)
    expect(res.status()).toBe(404)
  })
})
`,
  },
]

/**
 * True for code left over from the SHAFT/TestNG era. Those scripts can never
 * run under Playwright, so the hub replaces them with working JavaScript.
 */
export function isLegacyJavaScript(code: string): boolean {
  return /^\s*package\s+[\w.]+\s*;/m.test(code) || /\bimport\s+org\.testng\b|\bcom\.shaft\b|@Test\b/.test(code)
}

/** Old seed names whose Java body maps to one of the templates above. */
const LEGACY_NAME_MAP: Record<string, string> = {
  LoginFlowTest: "LoginFlowTest",
  ApiCrudTest: "ApiCrudTest",
  DbQueryTest: "ApiCrudTest",
  SearchFlowTest: "DynamicLoadingTest",
  FormSubmitTest: "CheckboxesTest",
}

/** Working JavaScript to replace a legacy Java script with. */
export function javascriptReplacementFor(name: string, type: string): { code: string; folder: string } {
  const tpl = DEFAULT_HUB_TEMPLATES.find((t) => t.name === (LEGACY_NAME_MAP[name] || name))
  if (tpl) return { code: tpl.code, folder: tpl.folder }
  const t: HubScriptType = type === "API" || type === "Database" ? "API" : "Web"
  return { code: buildTemplateCode(t, name), folder: t === "API" ? "API" : "" }
}
