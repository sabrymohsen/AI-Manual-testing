// Minimal shape the generators need from a RecordedStep row
export interface RecordedStepInput {
  id: string
  stepNumber: number
  actionType: string
  actionDescription: string
  pageUrl: string
  inputValue: string | null
  visibleText: string | null
  testIdSelector: string | null
  roleSelector: string | null
  labelSelector: string | null
  placeholderSelector: string | null
  cssSelector: string | null
  xpathSelector: string | null
  recommendedSelector: string | null
  assertionType: string | null
  assertionValue: string | null
  includeInFinalTestCase: boolean
}

// Framework-agnostic step used by both generators
export interface NeutralStep {
  id: string
  stepNumber: number
  actionType: string
  description: string
  url: string | null
  // Playwright locator expression — e.g. "getByTestId('x')" or "locator('.btn')"
  playwrightLocator: string | null
  // Selenium By expression — e.g. "By.cssSelector(\"[data-testid='x']\")"
  shaftBy: string | null
  inputValue: string | null
  assertionType: string | null
  assertionValue: string | null
}

export interface SHAFTOutput {
  testClass: string
  pom: string
  readme: string
}

// ── Selector builders ───────────────────────────────────────────────────────

function extractTestIdValue(raw: string): string {
  // raw may be "[data-testid='login-btn']" or just "login-btn"
  const m = raw.match(/\[data-testid=['"]?([^'"\]]+)['"]?\]/)
  return m ? m[1] : raw
}

function buildPlaywrightLocator(s: RecordedStepInput): string | null {
  // Priority: testId > role (+visibleText) > label > placeholder > css > xpath
  if (s.testIdSelector) {
    const v = extractTestIdValue(s.testIdSelector)
    return `getByTestId(${JSON.stringify(v)})`
  }
  if (s.roleSelector) {
    if (s.visibleText) {
      return `getByRole(${JSON.stringify(s.roleSelector)}, { name: ${JSON.stringify(s.visibleText)} })`
    }
    return `getByRole(${JSON.stringify(s.roleSelector)})`
  }
  if (s.labelSelector) {
    return `getByLabel(${JSON.stringify(s.labelSelector)})`
  }
  if (s.placeholderSelector) {
    return `getByPlaceholder(${JSON.stringify(s.placeholderSelector)})`
  }
  if (s.cssSelector) {
    return `locator(${JSON.stringify(s.cssSelector)})`
  }
  if (s.xpathSelector) {
    return `locator(${JSON.stringify(s.xpathSelector)})`
  }
  return null
}

function buildShaftBy(s: RecordedStepInput): string | null {
  // Selenium By: testId-css > css > xpath  (role/label/placeholder have no By equivalent)
  if (s.testIdSelector) {
    const v = s.testIdSelector.startsWith("[data-testid")
      ? s.testIdSelector
      : `[data-testid="${extractTestIdValue(s.testIdSelector)}"]`
    return `By.cssSelector(${JSON.stringify(v)})`
  }
  if (s.cssSelector) {
    return `By.cssSelector(${JSON.stringify(s.cssSelector)})`
  }
  if (s.xpathSelector) {
    return `By.xpath(${JSON.stringify(s.xpathSelector)})`
  }
  if (s.recommendedSelector) {
    return `By.cssSelector(${JSON.stringify(s.recommendedSelector)})`
  }
  return null
}

// ── Public converter ────────────────────────────────────────────────────────

export function stepsToNeutral(steps: RecordedStepInput[]): NeutralStep[] {
  return steps
    .filter((s) => s.includeInFinalTestCase)
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((s) => ({
      id: s.id,
      stepNumber: s.stepNumber,
      actionType: s.actionType,
      description: s.actionDescription,
      url: s.pageUrl ?? null,
      playwrightLocator: buildPlaywrightLocator(s),
      shaftBy: buildShaftBy(s),
      inputValue: s.inputValue,
      assertionType: s.assertionType,
      assertionValue: s.assertionValue,
    }))
}

// ── Playwright generator ────────────────────────────────────────────────────

export function generatePlaywrightCode(steps: NeutralStep[], title: string): string {
  const cleanTitle = title.trim() || "Recorded Test"
  const lines: string[] = []

  lines.push(`import { test, expect } from '@playwright/test';`)
  lines.push(``)
  lines.push(`test.describe(${JSON.stringify(cleanTitle)}, () => {`)
  lines.push(`  test(${JSON.stringify("Verify " + cleanTitle)}, async ({ page }) => {`)

  for (const step of steps) {
    lines.push(``)
    lines.push(`    // Step ${step.stepNumber}: ${step.description}`)
    const line = step.assertionType
      ? buildPlaywrightAssertion(step)
      : buildPlaywrightAction(step)
    if (line) lines.push(`    ${line}`)
  }

  lines.push(`  });`)
  lines.push(`});`)

  return lines.join("\n")
}

function pwLoc(step: NeutralStep): string | null {
  return step.playwrightLocator ? `page.${step.playwrightLocator}` : null
}

function escapeRegex(s: string): string {
  // Escape both regex special chars AND forward-slash so the literal is /pattern/
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
}

function buildPlaywrightAction(step: NeutralStep): string | null {
  const loc = pwLoc(step)
  const todo = `// TODO: add locator for "${step.description}"`

  switch (step.actionType) {
    case "open_url":
      return `await page.goto(${JSON.stringify(step.url || "")});`

    case "click":
    case "toggle_on":
    case "toggle_off":
    case "tab_select":
    case "menu_select":
    case "modal_open":
    case "modal_close":
    case "accordion_expand":
    case "accordion_collapse":
    case "pagination_next":
    case "pagination_previous":
    case "table_row_select":
    case "radio_select":
      return loc ? `await ${loc}.click();` : todo

    case "fill":
    case "date_select":
    case "time_select":
    case "slider_set":
      return loc
        ? `await ${loc}.fill(${JSON.stringify(step.inputValue ?? "")});`
        : todo

    case "select":
    case "select_custom":
    case "select_searchable":
    case "autocomplete_select":
      return loc
        ? `await ${loc}.selectOption(${JSON.stringify(step.inputValue ?? "")});`
        : todo

    case "check":
      return loc ? `await ${loc}.check();` : todo

    case "uncheck":
      return loc ? `await ${loc}.uncheck();` : todo

    case "wait":
      return `await page.waitForTimeout(${parseInt(step.inputValue ?? "1000", 10)});`

    case "note":
      return `// Note: ${(step.inputValue ?? "").replace(/\n/g, " ")}`

    case "screenshot":
      return `await page.screenshot({ path: 'step-${step.stepNumber}.png' });`

    case "wait_for_text":
      return step.assertionValue
        ? `await page.waitForSelector(${JSON.stringify(step.assertionValue)});`
        : loc
          ? `await expect(${loc}).toBeVisible();`
          : todo

    default:
      return loc ? `await ${loc}.click(); // ${step.actionType}` : todo
  }
}

function buildPlaywrightAssertion(step: NeutralStep): string | null {
  const loc = pwLoc(step)
  const val = step.assertionValue ?? ""

  switch (step.assertionType) {
    case "visible":
      return loc ? `await expect(${loc}).toBeVisible();` : null
    case "hidden":
      return loc ? `await expect(${loc}).toBeHidden();` : null
    case "text_equals":
      return loc ? `await expect(${loc}).toHaveText(${JSON.stringify(val)});` : null
    case "text_contains":
      return loc ? `await expect(${loc}).toContainText(${JSON.stringify(val)});` : null
    case "url_equals":
      return `await expect(page).toHaveURL(${JSON.stringify(val)});`
    case "url_contains":
      return `await expect(page).toHaveURL(/${escapeRegex(val)}/);`
    case "title_contains":
      return `await expect(page).toHaveTitle(/${escapeRegex(val)}/);`
    case "value_equals":
      return loc ? `await expect(${loc}).toHaveValue(${JSON.stringify(val)});` : null
    case "wait_for_text":
      return loc
        ? `await expect(${loc}).toBeVisible();`
        : val ? `await page.waitForSelector(${JSON.stringify(val)});` : null
    default:
      return null
  }
}

// ── SHAFT Engine generator ──────────────────────────────────────────────────

function toClassName(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("")
}

function toMethodName(title: string): string {
  const cls = toClassName(title)
  return cls ? cls[0].toLowerCase() + cls.slice(1) : "test"
}

export function generateSHAFTCode(steps: NeutralStep[], title: string): SHAFTOutput {
  const cleanTitle = title.trim() || "Recorded Test"
  const className = toClassName(cleanTitle) + "Test"
  const methodName = toMethodName(cleanTitle)

  return {
    testClass: buildSHAFTTestClass(steps, className, methodName),
    pom: buildSHAFTPom(),
    readme: buildSHAFTReadme(className, cleanTitle),
  }
}

function buildSHAFTTestClass(
  steps: NeutralStep[],
  className: string,
  methodName: string
): string {
  const lines: string[] = []

  lines.push(`import com.shaft.driver.SHAFT;`)
  lines.push(`import org.openqa.selenium.By;`)
  lines.push(`import org.testng.annotations.AfterMethod;`)
  lines.push(`import org.testng.annotations.BeforeMethod;`)
  lines.push(`import org.testng.annotations.Test;`)
  lines.push(``)
  lines.push(`public class ${className} {`)
  lines.push(``)
  lines.push(`    SHAFT.GUI.WebDriver driver;`)
  lines.push(``)
  lines.push(`    @BeforeMethod`)
  lines.push(`    public void setup() {`)
  lines.push(`        driver = new SHAFT.GUI.WebDriver();`)
  lines.push(`    }`)
  lines.push(``)
  lines.push(`    @Test`)
  lines.push(`    public void ${methodName}() {`)

  for (const step of steps) {
    lines.push(``)
    lines.push(`        // Step ${step.stepNumber}: ${step.description}`)
    const line = step.assertionType
      ? buildSHAFTAssertion(step)
      : buildSHAFTAction(step)
    if (line) lines.push(`        ${line}`)
  }

  lines.push(`    }`)
  lines.push(``)
  lines.push(`    @AfterMethod`)
  lines.push(`    public void teardown() {`)
  lines.push(`        driver.quit();`)
  lines.push(`    }`)
  lines.push(`}`)

  return lines.join("\n")
}

function buildSHAFTAction(step: NeutralStep): string | null {
  const by = step.shaftBy
  const todo = `// TODO: add locator for "${step.description}"`

  switch (step.actionType) {
    case "open_url":
      return `driver.browser().navigateToURL(${JSON.stringify(step.url ?? "")});`

    case "click":
    case "toggle_on":
    case "toggle_off":
    case "tab_select":
    case "menu_select":
    case "modal_open":
    case "modal_close":
    case "accordion_expand":
    case "accordion_collapse":
    case "pagination_next":
    case "pagination_previous":
    case "table_row_select":
    case "radio_select":
      return by ? `driver.element().click(${by});` : todo

    case "fill":
    case "date_select":
    case "time_select":
    case "slider_set":
      return by
        ? `driver.element().type(${by}, ${JSON.stringify(step.inputValue ?? "")});`
        : todo

    case "select":
    case "select_custom":
    case "select_searchable":
    case "autocomplete_select":
      return by
        ? `driver.element().select(${by}, ${JSON.stringify(step.inputValue ?? "")});`
        : todo

    case "check":
      return by ? `driver.element().click(${by}); // check checkbox` : todo

    case "uncheck":
      return by ? `driver.element().click(${by}); // uncheck checkbox` : todo

    case "wait": {
      const ms = parseInt(step.inputValue ?? "1000", 10)
      return `try { Thread.sleep(${ms}); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); } // wait`
    }

    case "note":
      return `// Note: ${(step.inputValue ?? "").replace(/\n/g, " ")}`

    case "screenshot":
      return `// screenshot captured by SHAFT automatically on failure`

    default:
      return by ? `driver.element().click(${by}); // ${step.actionType}` : todo
  }
}

function buildSHAFTAssertion(step: NeutralStep): string | null {
  const by = step.shaftBy
  const val = step.assertionValue ?? ""

  switch (step.assertionType) {
    case "visible":
      return by ? `driver.assertThat().element(${by}).isVisible();` : null
    case "hidden":
      return by ? `driver.assertThat().element(${by}).isHidden();` : null
    case "text_equals":
      return by
        ? `driver.assertThat().element(${by}).text().isEqualTo(${JSON.stringify(val)});`
        : null
    case "text_contains":
      return by
        ? `driver.assertThat().element(${by}).text().contains(${JSON.stringify(val)});`
        : null
    case "url_equals":
      return `driver.assertThat().browser().url().isEqualTo(${JSON.stringify(val)});`
    case "url_contains":
      return `driver.assertThat().browser().url().contains(${JSON.stringify(val)});`
    case "title_contains":
      return `driver.assertThat().browser().title().contains(${JSON.stringify(val)});`
    case "value_equals":
      return by
        ? `driver.assertThat().element(${by}).attribute("value").isEqualTo(${JSON.stringify(val)});`
        : null
    case "wait_for_text":
      return by ? `driver.assertThat().element(${by}).isVisible();` : null
    default:
      return null
  }
}

function buildSHAFTPom(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>shaft-tests</artifactId>
    <version>1.0-SNAPSHOT</version>

    <dependencies>
        <dependency>
            <groupId>io.github.shafthq</groupId>
            <artifactId>shaft-engine</artifactId>
            <version>10.2.20260628</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.15.0</version>
                <configuration>
                    <release>25</release>
                    <encoding>UTF-8</encoding>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.2.5</version>
            </plugin>
        </plugins>
    </build>
</project>`
}

function buildSHAFTReadme(className: string, title: string): string {
  return `# SHAFT Engine Test — ${title}

Generated from a recorded test session in the QA Testing Platform.

## Requirements

- **Java 25+** — https://adoptium.net
- **Maven 3.9+** — https://maven.apache.org/download.cgi
- **Chrome** (default browser — can be changed in ExecutionPlatform.properties)

## Project structure

\`\`\`
pom.xml
src/
  test/
    java/
      ${className}.java
    resources/
      properties/
        ExecutionPlatform.properties   ← browser / remote grid config
\`\`\`

## Run

\`\`\`bash
mvn test
\`\`\`

SHAFT will launch Chrome, execute every step, and produce an Allure HTML report
in \`target/Allure/\`.

## Change the browser

Create \`src/test/resources/properties/ExecutionPlatform.properties\`:

\`\`\`properties
targetBrowserName=firefox
\`\`\`

Supported values: \`chrome\`, \`firefox\`, \`safari\`, \`edge\`

## Assertions

Each \`driver.assertThat()\` call is a hard assertion — the test stops on first
failure and SHAFT attaches a screenshot to the report automatically.`
}
