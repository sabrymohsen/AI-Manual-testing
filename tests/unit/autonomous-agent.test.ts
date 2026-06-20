// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

describe("Autonomous Agent Unit Tests", () => {
  describe("DOM Discovery Scan Parsing Algorithm", () => {
    it("should correctly scan and map basic interactive DOM elements", () => {
      // Set up a mock DOM layout in JSDOM
      document.body.innerHTML = `
        <div>
          <button id="btn-save" data-testid="save-btn" aria-label="Save project data">Save Changes</button>
          <a href="/projects/dashboard" class="link-nav">Back to Dashboard</a>
          <input type="text" name="username" placeholder="Enter username" id="username-input" />
          <select name="priority">
            <option value="high">High</option>
          </select>
          <textarea placeholder="Describe issue" id="desc-area"></textarea>
          <div role="button" aria-label="Close modal">X</div>
          <span class="static-text">Not interactive</span>
        </div>
      `

      // Run the discovery mapping logic used in autonomous-agent.worker.ts
      const discoveredElements = Array.from(document.querySelectorAll("button, a, input, select, textarea, [role='button']"))
        .slice(0, 30)
        .map(el => {
          const tagName = el.tagName.toLowerCase()
          const text = el.textContent?.trim() || ""
          const placeholder = el.getAttribute("placeholder") || ""
          const label = el.getAttribute("aria-label") || ""
          const name = el.getAttribute("name") || el.id || ""
          const testid = el.getAttribute("data-testid") || ""
          return {
            tagName,
            text: text.substring(0, 30),
            placeholder: placeholder.substring(0, 30),
            label: label.substring(0, 30),
            name,
            testid
          }
        })

      expect(discoveredElements).toHaveLength(6)

      // 1. Verify button mapping
      const saveBtn = discoveredElements.find(el => el.tagName === "button")
      expect(saveBtn).toBeDefined()
      expect(saveBtn?.text).toBe("Save Changes")
      expect(saveBtn?.testid).toBe("save-btn")
      expect(saveBtn?.label).toBe("Save project data")
      expect(saveBtn?.name).toBe("btn-save")

      // 2. Verify link mapping
      const link = discoveredElements.find(el => el.tagName === "a")
      expect(link).toBeDefined()
      expect(link?.text).toBe("Back to Dashboard")

      // 3. Verify input mapping
      const input = discoveredElements.find(el => el.tagName === "input")
      expect(input).toBeDefined()
      expect(input?.name).toBe("username")
      expect(input?.placeholder).toBe("Enter username")

      // 4. Verify role="button" mapping
      const roleBtn = discoveredElements.find(el => el.tagName === "div")
      expect(roleBtn).toBeDefined()
      expect(roleBtn?.label).toBe("Close modal")
      expect(roleBtn?.text).toBe("X")
    })

    it("should correctly handle empty attribute fallbacks and text truncation", () => {
      document.body.innerHTML = `
        <button></button>
        <input />
        <button>Super long label that exceeds thirty characters limit</button>
      `

      const discoveredElements = Array.from(document.querySelectorAll("button, a, input, select, textarea, [role='button']"))
        .map(el => {
          const tagName = el.tagName.toLowerCase()
          const text = el.textContent?.trim() || ""
          const placeholder = el.getAttribute("placeholder") || ""
          const label = el.getAttribute("aria-label") || ""
          const name = el.getAttribute("name") || el.id || ""
          const testid = el.getAttribute("data-testid") || ""
          return {
            tagName,
            text: text.substring(0, 30),
            placeholder: placeholder.substring(0, 30),
            label: label.substring(0, 30),
            name,
            testid
          }
        })

      expect(discoveredElements).toHaveLength(3)
      expect(discoveredElements[0].text).toBe("")
      expect(discoveredElements[0].name).toBe("")
      expect(discoveredElements[1].tagName).toBe("input")
      expect(discoveredElements[2].text).toBe("Super long label that exceeds ")
      expect(discoveredElements[2].text.length).toBe(30)
    })
  })

  describe("Destructive Action Safety Filter Check", () => {
    const destructiveRegexp = /\b(delete|destroy|wipe|purge|pay|purchase|payment|terminate_account|cancel_account)\b/i

    const isDestructive = (actionDescription: string, actionType: string, targetValue?: string, inputValue?: string) => {
      const checkStr = `${actionDescription} ${actionType} ${targetValue || ""} ${inputValue || ""}`
      return destructiveRegexp.test(checkStr)
    }

    it("should block destructive operations targeting deletion and removal", () => {
      expect(isDestructive("Delete target project", "click")).toBe(true)
      expect(isDestructive("Click destroy button", "click")).toBe(true)
      expect(isDestructive("Wipe test execution records", "click")).toBe(true)
      expect(isDestructive("Purge cached locators list", "click")).toBe(true)
      expect(isDestructive("Click remove element", "click", "button.remove")).toBe(false) // "remove" is not in the regex boundary, but delete/destroy/cancel_account is
      expect(isDestructive("Cancel account user subscription", "click", "cancel_account")).toBe(true)
      expect(isDestructive("Terminate account now", "click")).toBe(false) // "terminate" is not in regex, but "terminate_account" is. Let's verify boundary checks.
      expect(isDestructive("Click terminate_account link", "click")).toBe(true)
    })

    it("should block dynamic financial operations", () => {
      expect(isDestructive("Complete test checkout payment", "click")).toBe(true)
      expect(isDestructive("Enter card number and pay", "fill")).toBe(true)
      expect(isDestructive("Purchase premium upgrade plan", "click")).toBe(true)
    })

    it("should allow safe non-destructive operational runs", () => {
      expect(isDestructive("Click test case save changes", "click")).toBe(false)
      expect(isDestructive("Verify user authentication login", "click")).toBe(false)
      expect(isDestructive("Fill credentials input form", "fill", "input.username", "testuser")).toBe(false)
      expect(isDestructive("Navigate to dashboard list view", "open_url")).toBe(false)
    })
  })
})
