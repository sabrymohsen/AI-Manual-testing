import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateTestPlan } from "@/lib/agent/planner"
import { checkActionSafety } from "@/lib/agent/safety"
import { QAAgentSafetyLevel, QAAgentFindingType } from "@prisma/client"

describe("QA Agent Brain Heuristics Planner", () => {
  it("should generate login authentication tests if a login form is detected", () => {
    const mockScan = {
      url: "http://localhost:3000/login",
      title: "Login Screen",
      inputs: [
        { tagName: "input", type: "email", name: "email", id: "email-input", label: "Email" },
        { tagName: "input", type: "password", name: "password", id: "password-input", label: "Password" }
      ],
      buttons: [
        { tagName: "button", text: "Login Button", id: "btn-login" }
      ],
      links: [],
      tables: [],
      forms: [],
      modals: [],
      dropdowns: []
    }

    const plan = generateTestPlan([mockScan])
    expect(plan.tests.length).toBeGreaterThanOrEqual(2)
    
    const loginTest = plan.tests.find(t => t.module === "Authentication")
    expect(loginTest).toBeDefined()
    expect(loginTest?.steps.length).toBe(4)
    expect(loginTest?.steps[1].action).toBe("fill")
    expect(loginTest?.steps[1].value).toBe("{{credential.username}}")
  })

  it("should generate search scenarios when a search input exists", () => {
    const mockScan = {
      url: "http://localhost:3000/items",
      title: "Items List",
      inputs: [
        { tagName: "input", type: "search", name: "q", placeholder: "Search items..." }
      ],
      buttons: [],
      links: [],
      tables: [],
      forms: [],
      modals: [],
      dropdowns: []
    }

    const plan = generateTestPlan([mockScan])
    const searchTest = plan.tests.find(t => t.module === "Search")
    expect(searchTest).toBeDefined()
    expect(searchTest?.steps[1].action).toBe("fill")
    expect(searchTest?.steps[1].value).toBe("QA Agent Test Query")
  })

  it("should generate table validation steps when table data grids exist", () => {
    const mockScan = {
      url: "http://localhost:3000/dashboard",
      title: "Stats",
      inputs: [],
      buttons: [],
      links: [],
      tables: [{ id: "metrics-table", headers: ["ID", "Value"], rowCount: 5 }],
      forms: [],
      modals: [],
      dropdowns: []
    }

    const plan = generateTestPlan([mockScan])
    const tableTest = plan.tests.find(t => t.module === "Tables")
    expect(tableTest).toBeDefined()
    expect(tableTest?.steps[0].action).toBe("open_url")
    expect(tableTest?.steps[1].action).toBe("assert_visible")
  })
})

describe("QA Agent Safety Policy Guards", () => {
  it("should block destructive actions by default under ReadOnly safety", () => {
    const res = checkActionSafety(
      "click",
      "Click Delete Account button",
      "button.delete",
      null,
      QAAgentSafetyLevel.ReadOnly
    )

    expect(res.isAllowed).toBe(false)
    expect(res.finding?.type).toBe(QAAgentFindingType.Risk)
    expect(res.reason).toContain("blocked")
  })

  it("should block clicks on submit buttons under FormFillOnly safety", () => {
    const res = checkActionSafety(
      "click",
      "Click Save button",
      "button.save",
      null,
      QAAgentSafetyLevel.AllowFormFill
    )

    expect(res.isAllowed).toBe(false)
    expect(res.reason).toContain("blocked")
  })

  it("should allow form filling under FormFillOnly safety", () => {
    const res = checkActionSafety(
      "fill",
      "Fill text input",
      "input.name",
      "Test User",
      QAAgentSafetyLevel.AllowFormFill
    )

    expect(res.isAllowed).toBe(true)
  })

  it("should allow non-destructive clicks under AllowCreateUpdate safety", () => {
    const res = checkActionSafety(
      "click",
      "Click Save button",
      "button.save",
      null,
      QAAgentSafetyLevel.AllowCreateUpdate
    )

    expect(res.isAllowed).toBe(true)
  })

  it("should block destructive clicks under AllowCreateUpdate safety", () => {
    const res = checkActionSafety(
      "click",
      "Click Wipe Database",
      "button.wipe-db",
      null,
      QAAgentSafetyLevel.AllowCreateUpdate
    )

    expect(res.isAllowed).toBe(false)
    expect(res.reason).toContain("Destructive action blocked")
  })
})
