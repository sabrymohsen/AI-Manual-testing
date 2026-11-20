import { describe, it, expect } from "vitest"
import { execFileSync } from "child_process"
import { stepsToPlaywright, needsStepsRuntime } from "@/lib/plain-english/to-playwright"
import { QA_STEPS_RUNTIME } from "@/lib/plain-english/runtime/qa-steps-runtime.generated"
import { cleanSteps } from "@/lib/hub-steps"

describe("no-code steps → Playwright test", () => {
  it("writes plain Playwright for simple steps and the step runner for element steps", () => {
    const { code, errors } = stepsToPlaywright({
      name: "Login",
      steps: ['Go to "https://shop.test/login"', 'Type "demo" in the "Email" field', 'Click "Sign in"', 'Verify the title is "Shop"', "Press Enter"],
    })
    expect(errors).toEqual([])
    expect(code).toContain(`await page.goto(url("https://shop.test/login"))`)
    expect(code).toContain('await expect(page).toHaveTitle("Shop")')
    expect(code).toContain('await page.keyboard.press("Enter")')
    expect(code).toContain('qa.step(page, "Click \\"Sign in\\"")')
    expect(code).toContain('const qa = require("./qa-steps.cjs")')
    expect(code).toMatch(/await test\.step\("Click \\"Sign in\\""/) // the tester's words name each step in reports
    expect(needsStepsRuntime(code)).toBe(true)
    expect(() => new Function("require", code)).not.toThrow() // valid JavaScript
  })

  it("needs no runner file when every step is plain Playwright", () => {
    const { code } = stepsToPlaywright({ name: "Home", steps: ['Go to "https://shop.test"', 'Verify the URL contains "shop"'] })
    expect(needsStepsRuntime(code)).toBe(false)
    expect(code).toContain("toHaveURL(new RegExp(")
  })

  it("keeps steps it doesn't understand visible and makes the test say so", () => {
    const { code, errors } = stepsToPlaywright({ name: "x", steps: ['Go to "https://a.test"', "Do the magic thing please"] })
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(2)
    expect(code).toContain("test.fail(true")
  })

  it("variables go through the runner (it holds their values)", () => {
    const { code } = stepsToPlaywright({ name: "x", steps: ['Go to "https://a.test/{path}"'] })
    expect(code).toContain("qa.step(page")
  })

  it("cleans what the editor sends", () => {
    expect(cleanSteps([{ text: "  Click \"A\" " }, { text: "" }, "Press Enter", { text: "x", expected: " ok " }])).toEqual([
      { text: 'Click "A"' },
      { text: "Press Enter" },
      { text: "x", expected: "ok" },
    ])
    expect(cleanSteps("nope")).toBeNull()
    expect(cleanSteps([{ nope: 1 }])).toBeNull()
  })

  it("the bundled step runner is up to date with the grammar and interpreter", () => {
    const fresh = execFileSync("node", ["scripts/build-steps-runtime.mjs", "--print"], { encoding: "utf8" })
    expect(fresh === QA_STEPS_RUNTIME, "Run `npm run gen:steps-runtime` and commit the result").toBe(true)
  }, 60_000)
})

import { dataRows } from "@/lib/plain-english/to-playwright"
describe("data-driven and environment-aware tests", () => {
  it("runs once per filled row, each column a variable", () => {
    const { code } = stepsToPlaywright({
      name: "Login",
      steps: ['Type "{email}" in the "Email" field'],
      data: { columns: ["email", "", "bad name!"], rows: [["a@b.co", "x", "y"], ["", "", ""], ["c@d.co", "", ""]] },
    })
    expect(code).toContain("for (const [i, row] of rows.entries())")
    expect(code).toContain("variables: { ...vars, ...row }")
    expect(code).toContain("— row ${i + 1}")
    expect(dataRows({ columns: ["email", "", "bad name!"], rows: [["a@b.co", "x", "y"], ["", "", ""], ["c@d.co", "", ""]] })).toEqual([
      { email: "a@b.co" },
      { email: "c@d.co" },
    ])
    expect(() => new Function("require", "process", code)).not.toThrow()
  })

  it("pages open on the environment's site when QA_BASE_URL is set", () => {
    const { code } = stepsToPlaywright({ name: "x", steps: ['Go to "https://prod.shop.com/cart?x=1"'] })
    const url = new Function("process", `${code.match(/const url = .*$/m)![0]}; return url`)
    expect(url({ env: {} })("https://prod.shop.com/cart?x=1")).toBe("https://prod.shop.com/cart?x=1")
    expect(url({ env: { QA_BASE_URL: "https://staging.shop.com/" } })("https://prod.shop.com/cart?x=1")).toBe("https://staging.shop.com/cart?x=1")
  })
})
