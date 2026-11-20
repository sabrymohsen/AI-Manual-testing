import { parseStep, type Command } from "./grammar"

/**
 * Plain-English steps → a Playwright test file (JavaScript).
 *
 * Simple steps with no element to find (open a page, press a key, wait, check
 * the URL or title, take a screenshot check) become ordinary Playwright code a
 * tester can read and learn from. Steps that find elements on the page go
 * through qa-steps.cjs — the same runner QA Engine uses for test cases — so a
 * step finds "the field below Email" the same way everywhere. Each step is a
 * named test.step, so reports, traces and the run view show the tester's own
 * words.
 *
 * The file runs with plain Playwright (`npx playwright test`) as long as
 * qa-steps.cjs sits next to it — which is what the Automation Hub workspace and
 * a project export provide.
 */

export const STEPS_RUNTIME_FILE = "qa-steps.cjs"
export const GENERATED_MARKER = "// Generated from plain-English steps by QA Engine."

export interface StepsTest {
  name: string
  steps: string[]
  /** Data-driven: the test runs once per row; each column is a {variable}. */
  data?: TestData | null
}

export interface TestData {
  columns: string[]
  rows: string[][]
}

/** Rows as objects, skipping empty rows and nameless columns. */
export function dataRows(data?: TestData | null): Record<string, string>[] {
  if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) return []
  const cols = data.columns.map((c) => String(c || "").trim())
  return data.rows
    .filter((r) => Array.isArray(r) && r.some((v) => String(v ?? "").trim()))
    .map((r) => Object.fromEntries(cols.map((c, i) => [c, String(r[i] ?? "")]).filter(([c]) => /^[A-Za-z_][\w-]*$/.test(c))))
}

const js = (s: string) => JSON.stringify(s)

/** Native Playwright for a command, or null when the runner should do it. */
function nativeCode(cmd: Command, sentence: string): string | null {
  // Anything with {variables} needs the runner's variable store.
  if (/\{[^}]+\}/.test(sentence)) return null
  switch (cmd.type) {
    case "goto":
      return `await page.goto(url(${js(cmd.url)}))`
    case "back":
      return "await page.goBack()"
    case "forward":
      return "await page.goForward()"
    case "reload":
      return "await page.reload()"
    case "press":
      return `await page.keyboard.press(${js(cmd.key)})`
    case "wait":
      return `await page.waitForTimeout(${cmd.ms})`
    case "assertUrl":
      if (cmd.comparison === "equals") return `await expect(page).toHaveURL(${js(cmd.expected)})`
      if (cmd.comparison === "contains") return `await expect(page).toHaveURL(new RegExp(${js(escapeRegExp(cmd.expected))}))`
      return null
    case "assertTitle":
      if (cmd.comparison === "equals") return `await expect(page).toHaveTitle(${js(cmd.expected)})`
      if (cmd.comparison === "contains") return `await expect(page).toHaveTitle(new RegExp(${js(escapeRegExp(cmd.expected))}))`
      return null
    case "checkpoint": {
      const file = `${(cmd.name || "checkpoint").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "checkpoint"}.png`
      return `await expect(page).toHaveScreenshot(${js(file)}${cmd.fullPage ? ", { fullPage: true }" : ""})`
    }
    default:
      return null
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export interface CompileResult {
  code: string
  /** Sentences the grammar doesn't understand, with the reason (1-based line). */
  errors: { line: number; text: string; error: string }[]
}

/** Turns plain-English steps into a Playwright spec file. */
export function stepsToPlaywright(test: StepsTest): CompileResult {
  const errors: CompileResult["errors"] = []
  const sentences = test.steps.map((s) => s.trim()).filter(Boolean)
  const body: string[] = []
  let usesRuntime = false

  const rows = dataRows(test.data)
  const ind = rows.length ? "    " : "  "
  sentences.forEach((sentence, i) => {
    const parsed = parseStep(sentence)
    if (!parsed.ok) {
      errors.push({ line: i + 1, text: sentence, error: parsed.error })
      body.push(`${ind}// Step ${i + 1} isn't understood yet: ${sentence.replace(/\n/g, " ")}`)
      body.push(`${ind}test.fail(true, ${js(`Step ${i + 1}: ${parsed.error}`)})`)
      return
    }
    const native = parsed.optional ? null : nativeCode(parsed.command, parsed.text)
    if (native) {
      body.push(`${ind}await test.step(${js(parsed.text)}, async () => {`)
      body.push(`${ind}  ${native}`)
      body.push(`${ind}})`)
    } else {
      usesRuntime = true
      body.push(`${ind}await test.step(${js(parsed.text)}, () => qa.step(page, ${js(parsed.text)}))`)
    }
  })

  const name = test.name || "Untitled test"
  const setup = (variables: string) =>
    usesRuntime ? [`${ind}qa.setup(page, {`, `${ind}  steps: [`, ...sentences.map((t) => `${ind}    ${js(t)},`), `${ind}  ],`, `${ind}  variables: ${variables},`, `${ind}})`, ""] : []
  const testBlock = rows.length
    ? [
        "// Test data: the test runs once for each row.",
        `const rows = ${JSON.stringify(rows, null, 2).replace(/\n/g, "\n")}`,
        "",
        "for (const [i, row] of rows.entries()) {",
        `  test(\`${name.replace(/[`\\$]/g, "\\$&")} — row \${i + 1}\`, async ({ page }) => {`,
        ...setup("{ ...vars, ...row }"),
        ...(body.length ? body : ["    // No steps yet."]),
        "  })",
        "}",
      ]
    : [`test(${js(name)}, async ({ page }) => {`, ...setup("vars"), ...(body.length ? body : ["  // No steps yet."]), "})"]

  const lines = [
    GENERATED_MARKER,
    "// Edit the steps in QA Engine's Automation Hub, or use \"Convert to code\" to edit this file directly.",
    'const { test, expect } = require("@playwright/test")',
    ...(usesRuntime ? [`const qa = require(${js("./" + STEPS_RUNTIME_FILE)})`] : []),
    "",
    "// The chosen environment's test data (QA Engine passes it in QA_VARS when it runs the test).",
    'const vars = JSON.parse(process.env.QA_VARS || "{}")',
    "// When the environment has a baseUrl, pages open on that site instead.",
    'const url = (u) => (process.env.QA_BASE_URL ? u.replace(/^https?:\\/\\/[^/]+/, process.env.QA_BASE_URL.replace(/\\/+$/, "")) : u)',
    "",
    ...testBlock,
    "",
  ]
  return { code: lines.join("\n"), errors }
}

/** Does this spec need qa-steps.cjs next to it? */
export function needsStepsRuntime(code: string): boolean {
  return code.includes(STEPS_RUNTIME_FILE)
}
