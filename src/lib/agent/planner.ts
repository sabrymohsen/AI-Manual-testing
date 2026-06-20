import { ScannerResult, ScannedElement } from "./scanner"

export interface QAAgentStep {
  action: string
  target: string
  targetType?: string
  targetValue?: string
  value?: string
  expected: string
}

export interface QAAgentTest {
  name: string
  priority: "Critical" | "High" | "Medium" | "Low"
  module: string
  feature: string
  steps: QAAgentStep[]
}

export interface QAAgentPlan {
  title: string
  summary: string
  tests: QAAgentTest[]
}

export function generateTestPlan(scanResults: ScannerResult[]): QAAgentPlan {
  const tests: QAAgentTest[] = []
  let totalFormsCount = 0
  let totalTablesCount = 0

  for (const scan of scanResults) {
    const relativePath = new URL(scan.url).pathname
    const pageName = scan.title || relativePath

    // 1. Detect Login Form
    const hasPasswordInput = scan.inputs.some(i => i.type === "password" || i.name?.toLowerCase().includes("password") || i.id?.toLowerCase().includes("password"))
    const hasUsernameOrEmailInput = scan.inputs.some(i => i.type === "email" || i.name?.toLowerCase().includes("username") || i.name?.toLowerCase().includes("email") || i.id?.toLowerCase().includes("username") || i.id?.toLowerCase().includes("email"))
    
    if (hasPasswordInput && hasUsernameOrEmailInput) {
      const emailInput = scan.inputs.find(i => i.type === "email" || i.name?.toLowerCase().includes("email") || i.name?.toLowerCase().includes("username")) || scan.inputs[0]
      const passwordInput = scan.inputs.find(i => i.type === "password" || i.name?.toLowerCase().includes("password")) || scan.inputs[1]
      const submitBtn = scan.buttons.find(b => b.text?.toLowerCase().includes("log") || b.text?.toLowerCase().includes("sign") || b.text?.toLowerCase().includes("submit")) || scan.buttons[0]

      const emailSelector = emailInput.id ? `#${emailInput.id}` : emailInput.name ? `input[name='${emailInput.name}']` : "input[type='email']"
      const passwordSelector = passwordInput.id ? `#${passwordInput.id}` : passwordInput.name ? `input[name='${passwordInput.name}']` : "input[type='password']"
      const submitSelector = submitBtn ? (submitBtn.id ? `#${submitBtn.id}` : `button:has-text("${submitBtn.text}")`) : "button[type='submit']"

      tests.push({
        name: `Verify user authentication with credentials on ${pageName}`,
        priority: "Critical",
        module: "Authentication",
        feature: "Login",
        steps: [
          { action: "open_url", target: scan.url, expected: "Authentication page loads" },
          { action: "fill", target: emailInput.label || "Username / Email input", targetType: "css", targetValue: emailSelector, value: "{{credential.username}}", expected: "Credentials username populated" },
          { action: "fill", target: passwordInput.label || "Password input", targetType: "css", targetValue: passwordSelector, value: "{{credential.password}}", expected: "Credentials password populated" },
          { action: "click", target: submitBtn?.text || "Submit Button", targetType: "css", targetValue: submitSelector, expected: "Page redirects or updates session status" }
        ]
      })

      tests.push({
        name: `Verify validation errors for invalid password on ${pageName}`,
        priority: "High",
        module: "Authentication",
        feature: "Login Validation",
        steps: [
          { action: "open_url", target: scan.url, expected: "Authentication page loads" },
          { action: "fill", target: emailInput.label || "Username / Email input", targetType: "css", targetValue: emailSelector, value: "invalid-user@test-qa-agent.com", expected: "Invalid username input filled" },
          { action: "fill", target: passwordInput.label || "Password input", targetType: "css", targetValue: passwordSelector, value: "wrongpassword123", expected: "Incorrect password input filled" },
          { action: "click", target: submitBtn?.text || "Submit Button", targetType: "css", targetValue: submitSelector, expected: "Error validation message is displayed" }
        ]
      })
    }

    // 2. Detect Search Inputs
    const searchInput = scan.inputs.find(i => i.type === "search" || i.name?.toLowerCase().includes("search") || i.placeholder?.toLowerCase().includes("search") || i.id?.toLowerCase().includes("search"))
    if (searchInput) {
      const searchSelector = searchInput.id ? `#${searchInput.id}` : searchInput.name ? `input[name='${searchInput.name}']` : "input[type='search']"
      tests.push({
        name: `Verify item search functionality on ${pageName}`,
        priority: "High",
        module: "Search",
        feature: "Input Queries",
        steps: [
          { action: "open_url", target: scan.url, expected: "Page loads successfully" },
          { action: "fill", target: searchInput.label || "Search Input", targetType: "css", targetValue: searchSelector, value: "QA Agent Test Query", expected: "Search keyword entered" },
          { action: "click", target: "Press Enter / Submit Search", targetType: "css", targetValue: searchSelector, value: "Enter", expected: "Matching results loaded or no results view shown" }
        ]
      })
    }

    // 3. Detect Modals / Dialogs
    if (scan.modals.length > 0) {
      scan.modals.forEach((modal, idx) => {
        tests.push({
          name: `Verify active modal interaction: ${modal.title || "dialog"} on ${pageName}`,
          priority: "Medium",
          module: "UI Elements",
          feature: "Modals",
          steps: [
            { action: "open_url", target: scan.url, expected: "Page loads" },
            { action: "assert_visible", target: modal.title || "Modal Container", targetType: "css", targetValue: modal.id ? `#${modal.id}` : "[role='dialog']", expected: "Modal is visible on screen" },
            { action: "click", target: "Close Modal trigger", targetType: "css", targetValue: "[aria-label='Close'], button:has-text('Close'), .close", expected: "Modal overlay disappears safely" }
          ]
        })
      })
    }

    // 4. Detect Forms
    if (scan.forms.length > 0 && !(hasPasswordInput && hasUsernameOrEmailInput)) {
      scan.forms.forEach((form, idx) => {
        totalFormsCount++
        // Find inputs that belong to this form context if possible, or use general page inputs
        const formInputs = scan.inputs.filter(i => i.type !== "hidden")
        if (formInputs.length > 0) {
          const firstInput = formInputs[0]
          const firstSelector = firstInput.id ? `#${firstInput.id}` : `input[name='${firstInput.name}']`
          const submitBtn = scan.buttons.find(b => b.text?.toLowerCase().includes("save") || b.text?.toLowerCase().includes("submit") || b.text?.toLowerCase().includes("create")) || scan.buttons[0]
          const submitSelector = submitBtn ? (submitBtn.id ? `#${submitBtn.id}` : `button:has-text("${submitBtn.text}")`) : "button[type='submit']"

          tests.push({
            name: `Verify form validation and submit flow #${totalFormsCount} on ${pageName}`,
            priority: "Medium",
            module: "Forms",
            feature: `Submit Flow ${totalFormsCount}`,
            steps: [
              { action: "open_url", target: scan.url, expected: "Form page loads" },
              { action: "fill", target: firstInput.label || "First input field", targetType: "css", targetValue: firstSelector, value: "QA Agent Autocomplete Field", expected: "Form fields filled with valid input data" },
              { action: "click", target: submitBtn?.text || "Submit Button", targetType: "css", targetValue: submitSelector, expected: "Form data submitted and page redirects or triggers success feedback" }
            ]
          })
        }
      })
    }

    // 5. Detect Tables
    if (scan.tables.length > 0) {
      scan.tables.forEach((table, idx) => {
        totalTablesCount++
        const tableSelector = table.id ? `#${table.id}` : "table"
        tests.push({
          name: `Verify list table loads and matches headers #${totalTablesCount} on ${pageName}`,
          priority: "High",
          module: "Tables",
          feature: `Grid View ${totalTablesCount}`,
          steps: [
            { action: "open_url", target: scan.url, expected: "Page with data grid loads" },
            { action: "assert_visible", target: `Table grid #${totalTablesCount}`, targetType: "css", targetValue: tableSelector, expected: "Table element is loaded on DOM" }
          ]
        })
      })
    }

    // 6. Detect Dropdowns
    if (scan.dropdowns.length > 0) {
      const selectEl = scan.dropdowns[0]
      const selectSelector = selectEl.id ? `#${selectEl.id}` : `select[name='${selectEl.name}']`
      tests.push({
        name: `Verify dropdown selections for ${selectEl.label || "options"} on ${pageName}`,
        priority: "Low",
        module: "UI Elements",
        feature: "Dropdowns",
        steps: [
          { action: "open_url", target: scan.url, expected: "Page with select controls loads" },
          { action: "click", target: selectEl.label || "Dropdown trigger", targetType: "css", targetValue: selectSelector, expected: "Options list is toggled active" }
        ]
      })
    }
  }

  // Fallback: If no interactive forms/inputs/tables detected, generate a simple Navigation Smoke check
  if (tests.length === 0 && scanResults.length > 0) {
    const scan = scanResults[0]
    const title = scan.title || "Target URL"
    tests.push({
      name: `Verify smoke navigation to ${title}`,
      priority: "Medium",
      module: "Smoke Check",
      feature: "Navigation",
      steps: [
        { action: "open_url", target: scan.url, expected: "Page loads successfully without throwing console errors" },
        { action: "wait_for_url", target: scan.url, expected: "URL is verified" }
      ]
    })
  }

  return {
    title: "QA Agent Autogenerated Test Plan",
    summary: `Rules-based QA validation sweep. Generated ${tests.length} tests covering Authentication, Forms, Tables, and Navigation check layouts.`,
    tests
  }
}
