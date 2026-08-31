import { describe, it, expect, vi, beforeEach } from "vitest"
import { executeStep, resolveLocatorString } from "@/lib/playwright/step-executor"
import { Page } from "playwright"

vi.mock("@/lib/db", () => ({
  prisma: {
    testStep: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

describe("step-executor", () => {
  let mockLocator: any
  let mockPage: any

  beforeEach(() => {
    mockLocator = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      selectOption: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockResolvedValue(undefined),
      uncheck: vi.fn().mockResolvedValue(undefined),
      getAttribute: vi.fn().mockResolvedValue(null),
      isChecked: vi.fn().mockResolvedValue(false),
      first: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
      evaluate: vi.fn().mockResolvedValue(false),
      locator: vi.fn(),
      filter: vi.fn(),
      or: vi.fn(),
      setInputFiles: vi.fn().mockResolvedValue(undefined),
    }

    mockLocator.first.mockReturnValue(mockLocator)
    mockLocator.locator.mockReturnValue(mockLocator)
    mockLocator.filter.mockReturnValue(mockLocator)
    mockLocator.or.mockReturnValue(mockLocator)

    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue(mockLocator),
      getByTestId: vi.fn().mockReturnValue(mockLocator),
      getByRole: vi.fn().mockReturnValue(mockLocator),
      getByText: vi.fn().mockReturnValue(mockLocator),
      getByLabel: vi.fn().mockReturnValue(mockLocator),
      getByPlaceholder: vi.fn().mockReturnValue(mockLocator),
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
      },
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(null),
    }
  })

  it("should navigate to a URL on open_url step", async () => {
    const step = {
      actionType: "open_url",
      targetType: "css",
      targetValue: "https://example.com",
      timeoutMs: 5000,
    }

    await executeStep(mockPage as unknown as Page, step)

    expect(mockPage.goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: 10000, // min default is 10000 in executeStep
    })
  })

  it("should click element on click step", async () => {
    const step = {
      actionType: "click",
      targetType: "css",
      targetValue: "button.submit",
      timeoutMs: 5000,
    }

    await executeStep(mockPage as unknown as Page, step)

    expect(mockPage.locator).toHaveBeenCalledWith("button.submit")
    // "attached", not "visible": resolveActionable waits for the element to be
    // in the DOM and only then prefers a visible match, so that radios,
    // switches and overlay-styled controls stay clickable via smartClick.
    expect(mockLocator.waitFor).toHaveBeenCalledWith({ state: "attached", timeout: 10000 })
    expect(mockLocator.click).toHaveBeenCalled()
  })

  it("should fill value on fill step", async () => {
    const step = {
      actionType: "fill",
      targetType: "placeholder",
      targetValue: "Username",
      inputValue: "john_doe",
      timeoutMs: 1000,
    }

    await executeStep(mockPage as unknown as Page, step)

    expect(mockPage.getByPlaceholder).toHaveBeenCalledWith("Username")
    expect(mockLocator.fill).toHaveBeenCalledWith("john_doe")
  })

  it("should select option on select step", async () => {
    const step = {
      actionType: "select",
      targetType: "css",
      targetValue: "select#country",
      inputValue: "US",
      timeoutMs: 1000,
    }

    await executeStep(mockPage as unknown as Page, step)

    expect(mockPage.locator).toHaveBeenCalledWith("select#country")
    expect(mockLocator.selectOption).toHaveBeenCalledWith("US")
  })

  it("should handle check and uncheck steps", async () => {
    const checkStep = {
      actionType: "check",
      targetType: "role",
      targetValue: "checkbox, name: 'Subscribe'",
      timeoutMs: 1000,
    }

    await executeStep(mockPage as unknown as Page, checkStep)
    expect(mockLocator.check).toHaveBeenCalled()

    const uncheckStep = {
      actionType: "uncheck",
      targetType: "role",
      targetValue: "checkbox, name: 'Subscribe'",
      timeoutMs: 1000,
    }

    await executeStep(mockPage as unknown as Page, uncheckStep)
    expect(mockLocator.uncheck).toHaveBeenCalled()
  })

  it("should click custom dropdown and select value", async () => {
    const step = {
      actionType: "select_custom",
      targetType: "css",
      targetValue: "div.dropdown-trigger",
      selectedOptionText: "Option 2",
      timeoutMs: 1000,
    }

    await executeStep(mockPage as unknown as Page, step)

    expect(mockPage.locator).toHaveBeenCalledWith("div.dropdown-trigger")
    expect(mockLocator.click).toHaveBeenCalled()
    // Should also find the option and click it
    expect(mockPage.getByRole).toHaveBeenCalledWith("option", { name: "Option 2", exact: false })
  })

  it("should handle searchable dropdown selection", async () => {
    const step = {
      actionType: "select_searchable",
      targetType: "css",
      targetValue: "div.search-trigger",
      inputValue: "Apple",
      selectedOptionText: "Apple Pie",
      actionMetadata: { searchPhrase: "Apple" },
      timeoutMs: 1000,
    }

    // Mock target is not input
    mockLocator.evaluate.mockResolvedValueOnce(true)

    await executeStep(mockPage as unknown as Page, step)

    expect(mockPage.locator).toHaveBeenCalledWith("div.search-trigger")
    expect(mockLocator.click).toHaveBeenCalled()
    expect(mockLocator.locator).toHaveBeenCalledWith("input")
    expect(mockLocator.fill).toHaveBeenCalledWith("Apple")
    expect(mockPage.getByRole).toHaveBeenCalledWith("option", { name: "Apple Pie", exact: false })
  })

  it("should handle multi_select step and press Escape", async () => {
    const step = {
      actionType: "multi_select",
      targetType: "css",
      targetValue: "div.multi-select",
      actionMetadata: {
        options: [{ text: "Red" }, { text: "Blue" }]
      },
      timeoutMs: 1000,
    }

    await executeStep(mockPage as unknown as Page, step)

    expect(mockPage.locator).toHaveBeenCalledWith("div.multi-select")
    expect(mockLocator.click).toHaveBeenCalled()
    expect(mockPage.getByRole).toHaveBeenCalledWith("option", { name: "Red", exact: false })
    expect(mockPage.getByRole).toHaveBeenCalledWith("option", { name: "Blue", exact: false })
    expect(mockPage.keyboard.press).toHaveBeenCalledWith("Escape")
  })

  it("should handle toggle_on and toggle_off steps", async () => {
    // toggle_on when already checked -> no-op click
    mockLocator.isChecked.mockResolvedValue(true)
    const stepOnChecked = {
      actionType: "toggle_on",
      targetType: "css",
      targetValue: "button.toggle",
      timeoutMs: 1000,
    }
    await executeStep(mockPage as unknown as Page, stepOnChecked)
    expect(mockLocator.click).not.toHaveBeenCalled()

    // toggle_on when unchecked -> clicks
    mockLocator.isChecked.mockResolvedValue(false)
    const stepOnUnchecked = {
      actionType: "toggle_on",
      targetType: "css",
      targetValue: "button.toggle",
      timeoutMs: 1000,
    }
    await executeStep(mockPage as unknown as Page, stepOnUnchecked)
    expect(mockLocator.click).toHaveBeenCalledTimes(1)

    // toggle_off when checked -> clicks to turn off
    mockLocator.isChecked.mockResolvedValue(true)
    const stepOffChecked = {
      actionType: "toggle_off",
      targetType: "css",
      targetValue: "button.toggle",
      timeoutMs: 1000,
    }
    await executeStep(mockPage as unknown as Page, stepOffChecked)
    expect(mockLocator.click).toHaveBeenCalledTimes(2) // 1 from previous, 1 now
  })

  describe("resolveLocatorString", () => {
    it("should parse testid prefix and return getByTestId", () => {
      resolveLocatorString(mockPage as unknown as Page, "testid=submit-btn")
      expect(mockPage.getByTestId).toHaveBeenCalledWith("submit-btn")
    })

    it("should parse css prefix and return locator", () => {
      resolveLocatorString(mockPage as unknown as Page, "css=.btn-primary")
      expect(mockPage.locator).toHaveBeenCalledWith(".btn-primary")
    })

    it("should parse label prefix and return getByLabel", () => {
      resolveLocatorString(mockPage as unknown as Page, "label=Username")
      expect(mockPage.getByLabel).toHaveBeenCalledWith("Username")
    })

    it("should parse role prefix and return getByRole with structured parameters", () => {
      resolveLocatorString(mockPage as unknown as Page, "role=button, name: \"Login\"")
      expect(mockPage.getByRole).toHaveBeenCalledWith("button", { name: "Login", exact: false })
    })

    it("should default to css when no prefix is found", () => {
      resolveLocatorString(mockPage as unknown as Page, ".simple-class")
      expect(mockPage.locator).toHaveBeenCalledWith(".simple-class")
    })
  })

  describe("auto-healing", () => {
    it("should attempt auto-healing if primary locator fails and successfully recover", async () => {
      // Primary locator fails (throws error)
      mockLocator.waitFor.mockRejectedValueOnce(new Error("Timeout waiting for primary element"))
      
      // Fallback locator exists in candidates
      const step = {
        actionType: "click",
        targetType: "css",
        targetValue: "#nonexistent",
        timeoutMs: 1000,
        locatorCandidates: JSON.stringify({
          fallbackLocators: ["testid=fallback-id"]
        })
      }

      await executeStep(mockPage as unknown as Page, step)

      // Verified that attemptAutoHealing triggered, tried the fallback locator, and clicked it
      expect(mockPage.getByTestId).toHaveBeenCalledWith("fallback-id")
      expect(mockLocator.click).toHaveBeenCalled()
      expect((step as any).actionMetadata).toBeDefined()
      expect((step as any).actionMetadata.healed).toBe(true)
      expect((step as any).actionMetadata.healedLocator).toBe("testid=fallback-id")
    })

    it("should fail step if both primary and fallback locators fail", async () => {
      // Primary locator fails
      mockLocator.waitFor.mockRejectedValue(new Error("Primary element not found"))
      
      const step = {
        actionType: "click",
        targetType: "css",
        targetValue: "#nonexistent",
        timeoutMs: 1000,
        locatorCandidates: JSON.stringify({
          fallbackLocators: ["testid=fallback-id"]
        })
      }

      await expect(executeStep(mockPage as unknown as Page, step)).rejects.toThrow("Primary element not found")
    })

    it("should attempt context recovery (Layer 2) and succeed when primary and fallbacks fail directly but container is found", async () => {
      mockLocator.waitFor.mockRejectedValueOnce(new Error("Timeout waiting for primary element"))
      
      // Must behave like a real Locator: the click path runs through
      // resolveActionable, which calls .first() and .filter({visible:true})
      // before acting. A stub with only waitFor/click throws inside Layer 2,
      // which swallows the error and moves on — making the healing look like a
      // failure when it actually reached the right element.
      const mockHealedLocator: any = {
        waitFor: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(false),
        count: vi.fn().mockResolvedValue(1),
      }
      mockHealedLocator.first = vi.fn(() => mockHealedLocator)
      mockHealedLocator.filter = vi.fn(() => mockHealedLocator)

      const mockContainer = {
        count: vi.fn().mockResolvedValue(1),
        filter: vi.fn().mockReturnThis(),
        first: vi.fn().mockReturnValue({
          getByTestId: vi.fn().mockReturnValue(mockHealedLocator),
          getByRole: vi.fn().mockReturnValue(mockHealedLocator),
          getByText: vi.fn().mockReturnValue(mockHealedLocator),
          getByLabel: vi.fn().mockReturnValue(mockHealedLocator),
          getByPlaceholder: vi.fn().mockReturnValue(mockHealedLocator),
          locator: vi.fn().mockReturnValue(mockHealedLocator),
        }),
      }

      mockPage.locator.mockImplementation((selector: string) => {
        if (selector === "tr") {
          return mockContainer
        }
        return mockLocator
      })

      const step = {
        actionType: "click",
        targetType: "css",
        targetValue: "#nonexistent",
        timeoutMs: 1000,
        locatorCandidates: JSON.stringify({
          fallbackLocators: [],
          context: "in row \"RowText\""
        })
      }

      await executeStep(mockPage as unknown as Page, step)

      expect(mockPage.locator).toHaveBeenCalledWith("tr")
      expect(mockHealedLocator.click).toHaveBeenCalled()
      expect((step as any).actionMetadata.healingMethod).toBe("dom_context_recovery")
      expect((step as any).actionMetadata.confidence).toBe(75)
    })

    it("should attempt semantic matching (Layer 3) and succeed when page evaluate returns a valid candidate", async () => {
      mockLocator.waitFor.mockRejectedValueOnce(new Error("Timeout waiting for primary element"))
      
      mockPage.evaluate.mockResolvedValueOnce({
        selector: ".healed-btn",
        score: 65,
        tagName: "button",
        role: "button",
        text: "Submit",
        hasTextScore: true
      })

      const step = {
        actionType: "click",
        targetType: "css",
        targetValue: "#nonexistent",
        timeoutMs: 1000,
      }

      await executeStep(mockPage as unknown as Page, step)

      expect(mockPage.locator).toHaveBeenCalledWith(".healed-btn")
      expect(mockLocator.click).toHaveBeenCalled()
      expect((step as any).actionMetadata.healingMethod).toBe("semantic_match")
      expect((step as any).actionMetadata.confidence).toBe(70)
    })

    it("should trigger learning layer (Layer 5) and update DB when confidence >= 90%", async () => {
      mockLocator.waitFor.mockRejectedValueOnce(new Error("Timeout waiting for primary element"))
      
      const step = {
        id: "step-12345",
        actionType: "click",
        targetType: "css",
        targetValue: "#nonexistent",
        timeoutMs: 1000,
        locatorCandidates: JSON.stringify({
          fallbackLocators: ["testid=healed-test-id"]
        })
      }

      await executeStep(mockPage as unknown as Page, step)

      const { prisma } = await import("@/lib/db")
      expect(prisma.testStep.update).toHaveBeenCalledWith({
        where: { id: "step-12345" },
        data: {
          targetType: "test_id",
          targetValue: "healed-test-id"
        }
      })
    })
  })
})
