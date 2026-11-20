import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { explainFailure, similarity } from "@/lib/hub-explain"
import { parsePageSnapshot } from "@/lib/hub-report"

const page = parsePageSnapshot(readFileSync("tests/unit/fixtures/error-context.md", "utf8"))

describe("failures in plain words", () => {
  it("reads the page snapshot Playwright saves on failure", () => {
    expect(page).toEqual(
      expect.arrayContaining([
        { role: "button", name: "Proceed to checkout" },
        { role: "link", name: "Continue shopping" },
        { role: "textbox", name: "Coupon" },
      ])
    )
  })

  it("a missing element: says so, and suggests the closest real one of the right kind", () => {
    const e = explainFailure({ step: 'Click "Checkout now"', error: 'Error: Could not find "Checkout now" on the page within 10 s.', page })
    expect(e.headline).toBe('Couldn\'t find "Checkout now" on the page')
    expect(e.didYouMean).toEqual({ from: "Checkout now", to: "Proceed to checkout", role: "button" })
    expect(e.detail).toContain('button called "Proceed to checkout"')
  })

  it("a field step suggests fields, not buttons", () => {
    const e = explainFailure({ step: 'Type "x" in the "Coupon code" field', error: 'Could not find the field "Coupon code" on the page within 10 s.', page })
    expect(e.didYouMean).toMatchObject({ to: "Coupon", role: "textbox" })
  })

  it("no suggestion when nothing is close", () => {
    const e = explainFailure({ step: 'Click "Delete account"', error: 'Could not find "Delete account" on the page within 10 s.', page })
    expect(e.didYouMean).toBeUndefined()
    expect(e.tips.length).toBeGreaterThan(1)
  })

  it("a text check, a dead site, a timeout, and anything else", () => {
    expect(explainFailure({ error: 'Expected the page to contain "Payment".', page }).headline).toBe('The page didn\'t show "Payment"')
    expect(explainFailure({ error: "page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.test" }).headline).toBe("The website couldn't be reached")
    expect(explainFailure({ error: "Test timeout of 30000ms exceeded." }).headline).toBe("The test ran out of time")
    expect(explainFailure({ step: "Press Enter", error: "weird" }).headline).toBe('The step "Press Enter" failed')
  })

  it("similarity favours shared words and close spelling", () => {
    expect(similarity("Checkout now", "Proceed to checkout")).toBeGreaterThan(similarity("Checkout now", "Continue shopping"))
    expect(similarity("Sign in", "Sign In")).toBe(1)
    expect(similarity("Login", "Log in")).toBeGreaterThan(0.5)
  })
})

import { cleanName } from "@/lib/hub-report"
describe("element names", () => {
  it("drop icon-font glyphs", () => {
    expect(cleanName(" Login")).toBe("Login")
    expect(cleanName("  Sign   in ")).toBe("Sign in")
  })
})
