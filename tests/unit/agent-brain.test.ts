// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { getProjectMemory, updateProjectMemory, resolveLocatorFromMemory, recordSuccessfulLocator, recordFailedLocator } from "@/lib/agent-brain/memory"
import { generateExecutionPlan } from "@/lib/agent-brain/planner"

// Mock database layer
vi.mock("@/lib/db", () => ({
  prisma: {
    agentMemory: {
      findMany: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
    project: {
      findUnique: vi.fn()
    }
  },
}))

import { prisma } from "@/lib/db"

describe("Agent Brain Memory Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should parse memory records correctly into state object", async () => {
    const mockRecords = [
      { key: "successful_locators", value: { "Click Save": { selector: "#save-btn", successCount: 1 } } },
      { key: "stable_components", value: ["#save-btn"] },
      { key: "flaky_components", value: [".brittle-class"] },
      { key: "user_corrections", value: { "input.username": "#usr" } }
    ]
    
    vi.mocked(prisma.agentMemory.findMany).mockResolvedValue(mockRecords as any)

    const state = await getProjectMemory("project-123")
    expect(state.successfulLocators["Click Save"]).toEqual({ selector: "#save-btn", successCount: 1 })
    expect(state.stableComponents).toContain("#save-btn")
    expect(state.flakyComponents).toContain(".brittle-class")
    expect(state.userCorrections["input.username"]).toBe("#usr")
  })

  it("should prioritize user corrections over successful locators on resolution", async () => {
    const mockRecords = [
      { key: "successful_locators", value: { "input.username": { selector: "input[name='username']", successCount: 2 } } },
      { key: "user_corrections", value: { "input.username": "#override-usr" } }
    ]
    
    vi.mocked(prisma.agentMemory.findMany).mockResolvedValue(mockRecords as any)

    const { resolved } = await resolveLocatorFromMemory("project-123", "input.username")
    expect(resolved).toBe("#override-usr")
  })

  it("should update stability and flakiness metrics on recording successes", async () => {
    const mockRecords = [
      { key: "successful_locators", value: { "Click Save": { selector: "#save-btn", successCount: 2 } } },
      { key: "flaky_components", value: ["#save-btn"] },
      { key: "stable_components", value: [] }
    ]
    vi.mocked(prisma.agentMemory.findMany).mockResolvedValue(mockRecords as any)

    await recordSuccessfulLocator("project-123", "Click Save", "#save-btn")

    // Expecting upsert for successful_locators and stable_components updates
    expect(prisma.agentMemory.upsert).toHaveBeenCalled()
  })

  it("should add selectors to flaky components on failed locator recordings", async () => {
    const mockRecords = [
      { key: "flaky_components", value: [] },
      { key: "stable_components", value: ["#fail-btn"] }
    ]
    vi.mocked(prisma.agentMemory.findMany).mockResolvedValue(mockRecords as any)

    await recordFailedLocator("project-123", "#fail-btn")

    expect(prisma.agentMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          key: "flaky_components"
        })
      })
    )
  })
})

describe("Agent Brain Planner Priorities", () => {
  it("should formulate scenarios and assign prioritizations correctly", async () => {
    const mockProject = {
      id: "project-123",
      name: "Mock Shop",
      webAppUrl: "http://localhost:3000",
      credentials: [{ id: "cred-1", roleName: "Admin", username: "admin" }],
      requirements: [{ title: "User Login Authentication" }, { title: "Credit Card Payment checkout" }]
    }

    vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

    const understanding = {
      appType: "e-commerce web app",
      modules: ["Auth", "Checkout"],
      riskAreas: ["login", "payment"],
      suggestedTestFocus: ["smoke"],
      pagesDetected: ["/login", "/checkout"]
    }

    // Call the generator under Planning mode
    const plan = await generateExecutionPlan("project-123", understanding, "Planning")

    // In fallback/template plan or LLM result check that we have plan scenarios
    expect(plan.executionPlan).toBeDefined()
    expect(plan.executionPlan.length).toBeGreaterThan(0)
    
    const smokeTest = plan.executionPlan.find(item => item.strategy === "smoke")
    expect(smokeTest).toBeDefined()
    expect(smokeTest?.priority).toBe("Critical")
  })
})
