import { describe, it, expect, vi, beforeEach } from "vitest"
import { executeStep } from "@/lib/playwright/step-executor"
import { Page } from "playwright"

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
      timeout: 45000, // min default is 45000 in executeStep
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
    expect(mockLocator.waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 45000 })
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
})
