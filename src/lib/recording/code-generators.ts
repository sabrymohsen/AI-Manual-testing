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
  inputValue: string | null
  assertionType: string | null
  assertionValue: string | null
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
