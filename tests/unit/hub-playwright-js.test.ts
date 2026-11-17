import { describe, it, expect } from "vitest"
import { parsePlaywrightReport, summarize, stripAnsi } from "@/lib/hub-report"
import { lintPlaywrightJs } from "@/lib/hub-editor-help"
import { DEFAULT_HUB_TEMPLATES, buildTemplateCode, isLegacyJavaScript, javascriptReplacementFor } from "@/lib/hub-templates"
import { hubNameError } from "@/lib/hub-scripts"
import { specFileName } from "@/lib/hub-workspace"
import { actionToPlaywrightLine, generatePlaywrightSpec } from "@/lib/recorder-codegen"

// Shape of Playwright's JSON reporter output (trimmed to what the hub reads).
const REPORT = {
  suites: [
    {
      title: "LoginFlowTest.spec.js",
      file: "LoginFlowTest.spec.js",
      specs: [],
      suites: [
        {
          title: "Login",
          file: "LoginFlowTest.spec.js",
          specs: [
            {
              title: "valid credentials open the secure area",
              file: "LoginFlowTest.spec.js",
              line: 8,
              tests: [{ projectName: "chromium", status: "expected", results: [{ status: "passed", duration: 1200, attachments: [] }] }],
            },
            {
              title: "wrong password shows an error",
              file: "LoginFlowTest.spec.js",
              line: 17,
              tests: [
                {
                  projectName: "chromium",
                  status: "unexpected",
                  results: [
                    {
                      status: "failed",
                      duration: 5300,
                      error: {
                        message: "\u001b[31mError: expect(locator).toBeVisible() failed\u001b[39m\nLocator: getByText('Nope')",
                        snippet: "  20 |   await expect(page.getByText(\"Nope\")).toBeVisible()",
                        location: { line: 20 },
                      },
                      attachments: [
                        { name: "screenshot", contentType: "image/png", path: "/ws/test-results/Login-wrong-chromium/test-failed-1.png" },
                        { name: "video", contentType: "video/webm", path: "/ws/test-results/Login-wrong-chromium/video.webm" },
                        { name: "trace", contentType: "application/zip", path: "/ws/test-results/Login-wrong-chromium/trace.zip" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

describe("Playwright JSON report → per-test results", () => {
  const results = parsePlaywrightReport(REPORT, "/ws/test-results", "/ws/runs/exec-1")

  it("lists every test with its describe path and status", () => {
    expect(results.map((r) => [r.title, r.status])).toEqual([
      ["Login > valid credentials open the secure area", "passed"],
      ["Login > wrong password shows an error", "failed"],
    ])
  })

  it("keeps the error without colour codes, with the code snippet and line", () => {
    const failed = results[1]
    expect(failed.error?.message).toBe("Error: expect(locator).toBeVisible() failed\nLocator: getByText('Nope')")
    expect(failed.error?.snippet).toContain("toBeVisible")
    expect(failed.error?.line).toBe(20)
    expect(results[0].error).toBeUndefined()
  })

  it("points screenshot, video and trace at the run's archive folder", () => {
    expect(results[1].screenshot).toBe("/ws/runs/exec-1/Login-wrong-chromium/test-failed-1.png")
    expect(results[1].video).toBe("/ws/runs/exec-1/Login-wrong-chromium/video.webm")
    expect(results[1].trace).toBe("/ws/runs/exec-1/Login-wrong-chromium/trace.zip")
  })

  it("summarizes", () => {
    expect(summarize(results)).toEqual({ total: 2, passed: 1, failed: 1, skipped: 0, flaky: 0 })
    expect(stripAnsi("\u001b[32mok\u001b[39m")).toBe("ok")
  })

  it("leads a timeout with the step that was stuck, not just 'Test timeout'", () => {
    const [r] = parsePlaywrightReport({
      suites: [{ title: "a.spec.js", specs: [{ title: "t", tests: [{ status: "unexpected", results: [{
        status: "timedOut", duration: 60000, attachments: [],
        error: { message: "Test timeout of 60000ms exceeded." },
        errors: [
          { message: "\u001b[31mTest timeout of 60000ms exceeded.\u001b[39m" },
          { message: "Error: locator.click: Test timeout of 60000ms exceeded.\nCall log:\n  - waiting for getByRole('button')", snippet: "> 11 |   await page.getByRole(\"button\").click()", location: { line: 11 } },
        ],
      }] }] }] }],
    })
    expect(r.status).toBe("timedOut")
    expect(r.error?.message.startsWith("Error: locator.click")).toBe(true)
    expect(r.error?.message).toContain("Test timeout of 60000ms exceeded.")
    expect(r.error?.snippet).toContain("getByRole")
    expect(r.error?.line).toBe(11)
  })

  it("survives an empty or broken report", () => {
    expect(parsePlaywrightReport({})).toEqual([])
    expect(parsePlaywrightReport(null)).toEqual([])
  })
})

describe("editor checks for Playwright JavaScript", () => {
  const messages = (code: string) => lintPlaywrightJs(code).map((i) => `${i.line}:${i.severity}:${i.message.slice(0, 22)}`)

  it("finds nothing wrong in the starter tests", () => {
    for (const t of DEFAULT_HUB_TEMPLATES) {
      expect(lintPlaywrightJs(t.code).filter((i) => i.severity !== "info"), t.name).toEqual([])
    }
    expect(lintPlaywrightJs(buildTemplateCode("Web", "x"))).toEqual([])
    expect(lintPlaywrightJs(buildTemplateCode("API", "x"))).toEqual([])
  })

  it("flags Java, a missing import and a missing test()", () => {
    const java = 'package com.x;\nimport org.testng.annotations.Test;\npublic class A { @Test public void t() {} }'
    const found = lintPlaywrightJs(java)
    expect(found.some((i) => i.severity === "error" && i.message.startsWith("This is Java"))).toBe(true)
    expect(found.some((i) => i.message.includes("import { test, expect }"))).toBe(true)
    expect(found.some((i) => i.message.startsWith("No test() found"))).toBe(true)
  })

  it("flags missing await on actions and web-first checks", () => {
    const code = [
      'import { test, expect } from "@playwright/test"',
      'test("t", async ({ page }) => {',
      '  page.getByRole("button", { name: "Save" }).click()',
      '  expect(page.getByText("Saved")).toBeVisible()',
      '  await page.goto("https://example.com")',
      '  const res = page.waitForResponse("**/api")',
      "  expect(1).toBe(1)",
      "})",
    ].join("\n")
    const found = messages(code)
    expect(found).toContain("3:warning:Missing await: this st")
    expect(found).toContain("4:warning:Missing await before e")
    expect(found.filter((m) => m.startsWith("5:") || m.startsWith("6:") || m.startsWith("7:"))).toEqual([])
  })

  it("warns about fixed waits, .only and brittle selectors", () => {
    const code = [
      'import { test, expect } from "@playwright/test"',
      'test.only("t", async ({ page }) => {',
      "  await page.waitForTimeout(3000)",
      '  await page.locator("xpath=//div[3]/span").click()',
      '  await page.locator("ul > li:nth-child(2)").click()',
      "})",
    ].join("\n")
    const found = messages(code)
    expect(found.some((m) => m.startsWith("2:warning:.only"))).toBe(true)
    expect(found.some((m) => m.startsWith("3:warning:Fixed waits"))).toBe(true)
    expect(found.some((m) => m.startsWith("4:info:XPath"))).toBe(true)
    expect(found.some((m) => m.startsWith("5:info:Position"))).toBe(true)
  })

  it("ignores commented-out code", () => {
    const code = 'import { test } from "@playwright/test"\ntest("t", async ({ page }) => {\n  // await page.waitForTimeout(1000)\n  /*\n  page.click("x")\n  */\n})'
    expect(lintPlaywrightJs(code)).toEqual([])
  })
})

describe("SHAFT-era Java scripts become runnable JavaScript", () => {
  it("recognizes the old seed scripts and not real JavaScript", () => {
    expect(isLegacyJavaScript("package com.ourcompany.tests;\n\nimport org.testng.annotations.Test;")).toBe(true)
    expect(isLegacyJavaScript("import com.shaft.driver.SHAFT;")).toBe(true)
    for (const t of DEFAULT_HUB_TEMPLATES) expect(isLegacyJavaScript(t.code), t.name).toBe(false)
  })

  it("maps every old seed name to a working template", () => {
    for (const old of ["LoginFlowTest", "ApiCrudTest", "DbQueryTest", "SearchFlowTest", "FormSubmitTest"]) {
      const { code } = javascriptReplacementFor(old, old === "ApiCrudTest" || old === "DbQueryTest" ? "API" : "Web")
      expect(code).toContain('from "@playwright/test"')
      expect(isLegacyJavaScript(code)).toBe(false)
    }
    expect(javascriptReplacementFor("SomethingElse", "Database").code).toContain("request.get(")
  })
})

describe("test names and files", () => {
  it("accepts readable names and rejects unsafe ones", () => {
    expect(hubNameError("Checkout with saved card")).toBeNull()
    expect(hubNameError("login_flow-2")).toBeNull()
    expect(hubNameError("")).not.toBeNull()
    expect(hubNameError("../etc/passwd")).not.toBeNull()
    expect(hubNameError("a/b")).not.toBeNull()
    expect(hubNameError("x".repeat(81))).not.toBeNull()
  })

  it("saves specs as JavaScript files", () => {
    expect(specFileName("Checkout with saved card")).toBe("Checkout_with_saved_card.spec.js")
  })
})

describe("recorder output", () => {
  it("writes Playwright's Enter key name, even for old recordings", () => {
    const line = actionToPlaywrightLine({ id: "1", step: 1, kind: "press", label: "Search", locator: 'page.getByLabel("Search")', value: "ENTER", at: 0 })
    expect(line).toBe('await page.getByLabel("Search").press("Enter");')
  })

  it("keeps Playwright locators as recorded and leaves a check to fill in", () => {
    const spec = generatePlaywrightSpec([
      { id: "1", step: 1, kind: "navigate", label: "", url: "https://example.com", at: 0 },
      { id: "2", step: 2, kind: "click", label: "Login", locator: 'page.getByRole("button", { name: "Login", exact: true })', at: 0 },
    ])
    expect(spec).toContain('await page.getByRole("button", { name: "Login", exact: true }).click();')
    expect(spec).toContain("// TODO: check the result")
  })

  it("checks the URL a click led to instead of opening it again", () => {
    const spec = generatePlaywrightSpec([
      { id: "1", step: 1, kind: "navigate", label: "", url: "https://site.test/login", at: 0 },
      { id: "2", step: 2, kind: "click", label: "Login", locator: 'page.getByRole("button", { name: "Login" })', at: 0 },
      { id: "3", step: 3, kind: "navigate", label: "", url: "https://site.test/secure", at: 0 },
    ])
    expect(spec).toContain('await page.goto("https://site.test/login");')
    expect(spec).toContain('await expect(page).toHaveURL("https://site.test/secure");')
    expect(spec).not.toContain('page.goto("https://site.test/secure")')
  })
})
