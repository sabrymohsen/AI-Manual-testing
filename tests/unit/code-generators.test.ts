import { describe, it, expect } from "vitest"
import {
  stepsToNeutral,
  generatePlaywrightCode,
  generateSHAFTCode,
  type RecordedStepInput,
} from "@/lib/recording/code-generators"

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeStep(overrides: Partial<RecordedStepInput>): RecordedStepInput {
  return {
    id: "step-1",
    stepNumber: 1,
    actionType: "click",
    actionDescription: "Click the login button",
    pageUrl: "https://example.com/login",
    inputValue: null,
    visibleText: null,
    testIdSelector: null,
    roleSelector: null,
    labelSelector: null,
    placeholderSelector: null,
    cssSelector: null,
    xpathSelector: null,
    recommendedSelector: null,
    assertionType: null,
    assertionValue: null,
    includeInFinalTestCase: true,
    ...overrides,
  }
}

const NAVIGATE_STEP = makeStep({
  id: "s0",
  stepNumber: 1,
  actionType: "open_url",
  actionDescription: "Navigate to login page",
  pageUrl: "https://example.com/login",
})

const FILL_WITH_LABEL = makeStep({
  id: "s1",
  stepNumber: 2,
  actionType: "fill",
  actionDescription: 'Fill "Email" field',
  inputValue: "user@example.com",
  labelSelector: "Email",
})

const FILL_WITH_TESTID = makeStep({
  id: "s2",
  stepNumber: 3,
  actionType: "fill",
  actionDescription: 'Fill "Password" field',
  inputValue: "secret",
  testIdSelector: "password-input",
})

const CLICK_WITH_ROLE = makeStep({
  id: "s3",
  stepNumber: 4,
  actionType: "click",
  actionDescription: "Click login button",
  roleSelector: "button",
  visibleText: "Login",
})

const CLICK_WITH_CSS = makeStep({
  id: "s4",
  stepNumber: 4,
  actionType: "click",
  actionDescription: "Click submit",
  cssSelector: "#submit-btn",
})

const ASSERT_VISIBLE = makeStep({
  id: "s5",
  stepNumber: 5,
  actionType: "click",
  actionDescription: "Assert dashboard visible",
  cssSelector: ".dashboard-header",
  assertionType: "visible",
  assertionValue: null,
})

const ASSERT_TEXT_EQUALS = makeStep({
  id: "s6",
  stepNumber: 6,
  actionType: "click",
  actionDescription: "Assert heading text",
  cssSelector: "h1",
  assertionType: "text_equals",
  assertionValue: "Welcome back",
})

const ASSERT_TEXT_CONTAINS = makeStep({
  id: "s7",
  stepNumber: 7,
  actionType: "click",
  actionDescription: "Assert page contains welcome text",
  cssSelector: ".greeting",
  assertionType: "text_contains",
  assertionValue: "Welcome",
})

const ASSERT_URL_CONTAINS = makeStep({
  id: "s8",
  stepNumber: 8,
  actionType: "click",
  actionDescription: "Assert URL contains dashboard",
  cssSelector: null,
  assertionType: "url_contains",
  assertionValue: "/dashboard",
})

const ASSERT_URL_EQUALS = makeStep({
  id: "s9",
  stepNumber: 9,
  actionType: "click",
  actionDescription: "Assert exact URL",
  assertionType: "url_equals",
  assertionValue: "https://example.com/dashboard",
})

const ASSERT_VALUE = makeStep({
  id: "s10",
  stepNumber: 10,
  actionType: "click",
  actionDescription: "Assert input value",
  cssSelector: "#email-field",
  assertionType: "value_equals",
  assertionValue: "user@example.com",
})

const ASSERT_TITLE = makeStep({
  id: "s11",
  stepNumber: 11,
  actionType: "click",
  actionDescription: "Assert page title",
  assertionType: "title_contains",
  assertionValue: "Dashboard",
})

// ── stepsToNeutral ──────────────────────────────────────────────────────────

describe("stepsToNeutral", () => {
  it("filters out steps with includeInFinalTestCase=false", () => {
    const excluded = makeStep({ includeInFinalTestCase: false })
    const included = makeStep({ id: "s2", stepNumber: 2, includeInFinalTestCase: true })
    const result = stepsToNeutral([excluded, included])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("s2")
  })

  it("sorts steps by stepNumber ascending", () => {
    const s3 = makeStep({ id: "s3", stepNumber: 3 })
    const s1 = makeStep({ id: "s1", stepNumber: 1 })
    const s2 = makeStep({ id: "s2", stepNumber: 2 })
    const result = stepsToNeutral([s3, s1, s2])
    expect(result.map((s) => s.stepNumber)).toEqual([1, 2, 3])
  })

  describe("selector priority for Playwright", () => {
    it("prefers testId over everything", () => {
      const s = makeStep({
        testIdSelector: "login-btn",
        roleSelector: "button",
        labelSelector: "Login",
        cssSelector: "#btn",
      })
      expect(stepsToNeutral([s])[0].playwrightLocator).toBe(`getByTestId("login-btn")`)
    })

    it("extracts testId value from full attribute selector", () => {
      const s = makeStep({ testIdSelector: "[data-testid='login-btn']" })
      expect(stepsToNeutral([s])[0].playwrightLocator).toBe(`getByTestId("login-btn")`)
    })

    it("uses role+name when both role and visibleText are present", () => {
      const s = makeStep({ roleSelector: "button", visibleText: "Submit" })
      expect(stepsToNeutral([s])[0].playwrightLocator).toBe(
        `getByRole("button", { name: "Submit" })`
      )
    })

    it("uses role alone when visibleText is absent", () => {
      const s = makeStep({ roleSelector: "button" })
      expect(stepsToNeutral([s])[0].playwrightLocator).toBe(`getByRole("button")`)
    })

    it("uses label after role", () => {
      const s = makeStep({ labelSelector: "Email address" })
      expect(stepsToNeutral([s])[0].playwrightLocator).toBe(`getByLabel("Email address")`)
    })

    it("uses placeholder after label", () => {
      const s = makeStep({ placeholderSelector: "Enter email" })
      expect(stepsToNeutral([s])[0].playwrightLocator).toBe(
        `getByPlaceholder("Enter email")`
      )
    })

    it("falls back to css locator", () => {
      const s = makeStep({ cssSelector: "#submit-btn" })
      expect(stepsToNeutral([s])[0].playwrightLocator).toBe(`locator("#submit-btn")`)
    })

    it("falls back to xpath locator last", () => {
      const s = makeStep({ xpathSelector: "//button[@id='btn']" })
      expect(stepsToNeutral([s])[0].playwrightLocator).toBe(
        `locator("//button[@id='btn']")`
      )
    })

    it("returns null playwrightLocator when no selector available", () => {
      const s = makeStep({})
      expect(stepsToNeutral([s])[0].playwrightLocator).toBeNull()
    })
  })

  describe("selector priority for SHAFT (By)", () => {
    it("prefers testId as css selector", () => {
      const s = makeStep({ testIdSelector: "login-btn", cssSelector: "#btn" })
      expect(stepsToNeutral([s])[0].shaftBy).toBe(
        `By.cssSelector("[data-testid=\\"login-btn\\"]")`
      )
    })

    it("keeps full attribute selector if already formatted", () => {
      const s = makeStep({ testIdSelector: "[data-testid='my-btn']" })
      // should pass it through as-is (already starts with [data-testid)
      const shaftBy = stepsToNeutral([s])[0].shaftBy
      expect(shaftBy).toContain("By.cssSelector")
      expect(shaftBy).toContain("data-testid")
    })

    it("uses css after testId", () => {
      const s = makeStep({ cssSelector: ".my-btn" })
      expect(stepsToNeutral([s])[0].shaftBy).toBe(`By.cssSelector(".my-btn")`)
    })

    it("uses xpath when no css available", () => {
      const s = makeStep({ xpathSelector: "//div[@id='x']" })
      expect(stepsToNeutral([s])[0].shaftBy).toBe(`By.xpath("//div[@id='x']")`)
    })

    it("returns null shaftBy when no selector available", () => {
      // only role/label selectors — no equivalent in Selenium By
      const s = makeStep({ roleSelector: "button", labelSelector: "Submit" })
      expect(stepsToNeutral([s])[0].shaftBy).toBeNull()
    })
  })
})

// ── generatePlaywrightCode ──────────────────────────────────────────────────

describe("generatePlaywrightCode", () => {
  it("produces valid import and describe wrapper", () => {
    const code = generatePlaywrightCode([], "Login Flow")
    expect(code).toContain(`import { test, expect } from '@playwright/test';`)
    expect(code).toContain(`test.describe("Login Flow"`)
    expect(code).toContain(`async ({ page }) => {`)
  })

  it("generates page.goto for open_url", () => {
    const neutral = stepsToNeutral([NAVIGATE_STEP])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(`await page.goto("https://example.com/login");`)
  })

  it("generates getByLabel.fill for fill steps with label selector", () => {
    const neutral = stepsToNeutral([FILL_WITH_LABEL])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(`await page.getByLabel("Email").fill("user@example.com");`)
  })

  it("generates getByTestId.fill for fill steps with testId selector", () => {
    const neutral = stepsToNeutral([FILL_WITH_TESTID])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(`await page.getByTestId("password-input").fill("secret");`)
  })

  it("generates getByRole.click for click steps with role+name", () => {
    const neutral = stepsToNeutral([CLICK_WITH_ROLE])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(
      `await page.getByRole("button", { name: "Login" }).click();`
    )
  })

  it("generates locator().click for css selector", () => {
    const neutral = stepsToNeutral([CLICK_WITH_CSS])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(`await page.locator("#submit-btn").click();`)
  })

  it("generates toBeVisible() for visible assertion", () => {
    const neutral = stepsToNeutral([ASSERT_VISIBLE])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(`await expect(page.locator(".dashboard-header")).toBeVisible();`)
  })

  it("generates toHaveText() for text_equals assertion", () => {
    const neutral = stepsToNeutral([ASSERT_TEXT_EQUALS])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(`await expect(page.locator("h1")).toHaveText("Welcome back");`)
  })

  it("generates toContainText() for text_contains assertion", () => {
    const neutral = stepsToNeutral([ASSERT_TEXT_CONTAINS])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(
      `await expect(page.locator(".greeting")).toContainText("Welcome");`
    )
  })

  it("generates toHaveURL with regex for url_contains assertion", () => {
    const neutral = stepsToNeutral([ASSERT_URL_CONTAINS])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(`await expect(page).toHaveURL(/\\/dashboard/);`)
  })

  it("generates toHaveURL with string for url_equals assertion", () => {
    const neutral = stepsToNeutral([ASSERT_URL_EQUALS])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(
      `await expect(page).toHaveURL("https://example.com/dashboard");`
    )
  })

  it("generates toHaveValue() for value_equals assertion", () => {
    const neutral = stepsToNeutral([ASSERT_VALUE])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(
      `await expect(page.locator("#email-field")).toHaveValue("user@example.com");`
    )
  })

  it("generates toHaveTitle() for title_contains assertion", () => {
    const neutral = stepsToNeutral([ASSERT_TITLE])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(`await expect(page).toHaveTitle(/Dashboard/);`)
  })

  it("includes step comments", () => {
    const neutral = stepsToNeutral([NAVIGATE_STEP])
    const code = generatePlaywrightCode(neutral, "Login")
    expect(code).toContain(`// Step 1: Navigate to login page`)
  })
})

// ── generateSHAFTCode ───────────────────────────────────────────────────────

describe("generateSHAFTCode", () => {
  it("generates correct class name from title", () => {
    const { testClass } = generateSHAFTCode([], "Login Flow")
    expect(testClass).toContain(`public class LoginFlowTest {`)
  })

  it("generates correct method name from title", () => {
    const { testClass } = generateSHAFTCode([], "Login Flow")
    expect(testClass).toContain(`public void loginFlow() {`)
  })

  it("includes TestNG annotations and SHAFT imports", () => {
    const { testClass } = generateSHAFTCode([], "Login Flow")
    expect(testClass).toContain(`import com.shaft.driver.SHAFT;`)
    expect(testClass).toContain(`import org.openqa.selenium.By;`)
    expect(testClass).toContain(`import org.testng.annotations.Test;`)
    expect(testClass).toContain(`import org.testng.annotations.BeforeMethod;`)
    expect(testClass).toContain(`import org.testng.annotations.AfterMethod;`)
  })

  it("generates driver setup and teardown", () => {
    const { testClass } = generateSHAFTCode([], "Login Flow")
    expect(testClass).toContain(`driver = new SHAFT.GUI.WebDriver();`)
    expect(testClass).toContain(`driver.quit();`)
  })

  it("generates navigateToURL for open_url", () => {
    const neutral = stepsToNeutral([NAVIGATE_STEP])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(
      `driver.browser().navigateToURL("https://example.com/login");`
    )
  })

  it("generates element().type() for fill with css selector", () => {
    const neutral = stepsToNeutral([FILL_WITH_TESTID])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(
      `driver.element().type(By.cssSelector("[data-testid=\\"password-input\\"]"), "secret");`
    )
  })

  it("generates element().click() for click with css selector", () => {
    const neutral = stepsToNeutral([CLICK_WITH_CSS])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(`driver.element().click(By.cssSelector("#submit-btn"));`)
  })

  it("generates assertThat().element().isVisible() for visible assertion", () => {
    const neutral = stepsToNeutral([ASSERT_VISIBLE])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(
      `driver.assertThat().element(By.cssSelector(".dashboard-header")).isVisible();`
    )
  })

  it("generates assertThat().element().text().isEqualTo() for text_equals", () => {
    const neutral = stepsToNeutral([ASSERT_TEXT_EQUALS])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(
      `driver.assertThat().element(By.cssSelector("h1")).text().isEqualTo("Welcome back");`
    )
  })

  it("generates assertThat().element().text().contains() for text_contains", () => {
    const neutral = stepsToNeutral([ASSERT_TEXT_CONTAINS])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(
      `driver.assertThat().element(By.cssSelector(".greeting")).text().contains("Welcome");`
    )
  })

  it("generates assertThat().browser().url().contains() for url_contains", () => {
    const neutral = stepsToNeutral([ASSERT_URL_CONTAINS])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(
      `driver.assertThat().browser().url().contains("/dashboard");`
    )
  })

  it("generates assertThat().browser().url().isEqualTo() for url_equals", () => {
    const neutral = stepsToNeutral([ASSERT_URL_EQUALS])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(
      `driver.assertThat().browser().url().isEqualTo("https://example.com/dashboard");`
    )
  })

  it("generates assertThat().element().attribute('value') for value_equals", () => {
    const neutral = stepsToNeutral([ASSERT_VALUE])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(
      `driver.assertThat().element(By.cssSelector("#email-field")).attribute("value").isEqualTo("user@example.com");`
    )
  })

  it("generates assertThat().browser().title().contains() for title_contains", () => {
    const neutral = stepsToNeutral([ASSERT_TITLE])
    const { testClass } = generateSHAFTCode(neutral, "Login")
    expect(testClass).toContain(
      `driver.assertThat().browser().title().contains("Dashboard");`
    )
  })

  it("pom.xml contains correct SHAFT Engine coordinates", () => {
    const { pom } = generateSHAFTCode([], "Test")
    expect(pom).toContain(`<groupId>io.github.shafthq</groupId>`)
    expect(pom).toContain(`<artifactId>shaft-engine</artifactId>`)
    expect(pom).toContain(`<version>10.2.20260628</version>`)
    expect(pom).toContain(`<release>25</release>`)
  })

  it("README mentions Java 25 and Maven 3.9", () => {
    const { readme } = generateSHAFTCode([], "Test")
    expect(readme).toContain("Java 25")
    expect(readme).toContain("Maven 3.9")
    expect(readme).toContain("mvn test")
  })
})
