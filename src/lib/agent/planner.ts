import { ScannerResult, QAAgentPlan, QAAgentTest } from "./types"

export function generateTestPlan(scanInput: any): QAAgentPlan {
  // Ensure we can handle either a single ScannerResult or an array of ScannerResults
  const scanResult = (Array.isArray(scanInput) ? scanInput[0] : scanInput) as ScannerResult
  const tests: QAAgentTest[] = []
  
  const targetUrl = scanResult?.targetUrl || ""
  const title = scanResult?.title || "Target Application"
  const pageName = title || "Target Page"

  // 1. PUBLIC PAGE TESTS
  tests.push({
    name: `Verify ${pageName} loads successfully`,
    priority: "Critical",
    module: "Public Access",
    feature: "Smoke Test",
    source: "rule-based-planner",
    steps: [
      {
        action: "open_url",
        target: targetUrl,
        targetType: "url",
        targetValue: targetUrl,
        expected: "Page should load successfully without console errors."
      },
      {
        action: "assert_visible",
        target: "Page Body",
        targetType: "css",
        targetValue: "body",
        expected: "Body tag should be present and visible."
      }
    ]
  })

  // Detect Sign In / Login button or link
  const loginBtn = scanResult?.buttons?.find(b => 
    /sign in|login|log in|signin/i.test(b.text || "") || 
    /login|signin/i.test(b.testid || "") || 
    /login|signin/i.test(b.id || "")
  ) || scanResult?.links?.find(l => 
    /sign in|login|log in|signin/i.test(l.text || "") || 
    /login|signin/i.test(l.testid || "") || 
    /login|signin/i.test(l.id || "")
  )

  if (loginBtn) {
    tests.push({
      name: `Verify login entry point is visible and clickable on ${pageName}`,
      priority: "Critical",
      module: "Public Access",
      feature: "Authentication Entrance",
      source: "rule-based-planner",
      steps: [
        {
          action: "open_url",
          target: targetUrl,
          targetType: "url",
          targetValue: targetUrl,
          expected: "Home page loads successfully."
        },
        {
          action: "assert_visible",
          target: loginBtn.text || "Sign In button",
          targetType: loginBtn.testid ? "test_id" : (loginBtn.id ? "css" : "text"),
          targetValue: loginBtn.testid || (loginBtn.id ? `#${loginBtn.id}` : loginBtn.text),
          expected: `Login entry point "${loginBtn.text || "Sign In"}" is visible on home page.`
        }
      ]
    })
  }

  // 2. LOGIN TESTS (if login page scanned or detected inputs)
  const inputs = scanResult?.inputs || []
  const hasPasswordInput = inputs.some(i => i.type === "password" || /password/i.test(i.name || "") || /password/i.test(i.id || ""))
  const hasUsernameOrEmailInput = inputs.some(i => 
    i.type === "email" || 
    /username|email|login/i.test(i.name || "") || 
    /username|email|login/i.test(i.id || "")
  )

  if (hasPasswordInput && hasUsernameOrEmailInput) {
    const emailInput = inputs.find(i => i.type === "email" || /email|username/i.test(i.name || "") || /email|username/i.test(i.id || "")) || inputs[0]
    const passwordInput = inputs.find(i => i.type === "password" || /password/i.test(i.name || "") || /password/i.test(i.id || "")) || inputs[1]
    const submitBtn = scanResult?.buttons?.find(b => 
      /log in|login|sign in|submit/i.test(b.text || "") || 
      /submit/i.test(b.id || "") || 
      /submit/i.test(b.testid || "")
    ) || scanResult?.buttons?.[0]

    const emailSelector = emailInput.testid ? `testid=${emailInput.testid}` : (emailInput.id ? `#${emailInput.id}` : `input[name='${emailInput.name}']`)
    const passwordSelector = passwordInput.testid ? `testid=${passwordInput.testid}` : (passwordInput.id ? `#${passwordInput.id}` : `input[name='${passwordInput.name}']`)
    const submitSelector = submitBtn ? (submitBtn.testid ? `testid=${submitBtn.testid}` : (submitBtn.id ? `#${submitBtn.id}` : `button:has-text("${submitBtn.text}")`)) : "button[type='submit']"

    // Valid Login Test
    tests.push({
      name: `Verify successful authentication with valid credentials`,
      priority: "Critical",
      module: "Authentication",
      feature: "Login Execution",
      source: "rule-based-planner",
      steps: [
        {
          action: "open_url",
          target: targetUrl,
          targetType: "url",
          targetValue: targetUrl,
          expected: "Login page loads successfully."
        },
        {
          action: "fill",
          target: emailInput.label || "Username or Email field",
          targetType: emailInput.testid ? "test_id" : (emailInput.id ? "css" : "css"),
          targetValue: emailSelector,
          value: "{{credential.username}}",
          expected: "Valid username/email address is filled in."
        },
        {
          action: "fill",
          target: passwordInput.label || "Password field",
          targetType: passwordInput.testid ? "test_id" : (passwordInput.id ? "css" : "css"),
          targetValue: passwordSelector,
          value: "{{credential.password}}",
          expected: "Valid password credential is filled in."
        },
        {
          action: "click",
          target: submitBtn?.text || "Submit Button",
          targetType: submitBtn?.testid ? "test_id" : (submitBtn?.id ? "css" : "css"),
          targetValue: submitSelector,
          expected: "App redirects and dashboard page is loaded successfully."
        }
      ]
    })

    // Empty username validation
    tests.push({
      name: `Verify form validation when username/email is left empty`,
      priority: "High",
      module: "Authentication",
      feature: "Login Form Validation",
      source: "rule-based-planner",
      steps: [
        {
          action: "open_url",
          target: targetUrl,
          targetType: "url",
          targetValue: targetUrl,
          expected: "Login page loads successfully."
        },
        {
          action: "fill",
          target: passwordInput.label || "Password field",
          targetType: passwordInput.testid ? "test_id" : (passwordInput.id ? "css" : "css"),
          targetValue: passwordSelector,
          value: "somepassword123",
          expected: "Password value populated."
        },
        {
          action: "click",
          target: submitBtn?.text || "Submit Button",
          targetType: submitBtn?.testid ? "test_id" : (submitBtn?.id ? "css" : "css"),
          targetValue: submitSelector,
          expected: "Form displays field validation message requiring username."
        }
      ]
    })

    // Empty password validation
    tests.push({
      name: `Verify form validation when password is left empty`,
      priority: "High",
      module: "Authentication",
      feature: "Login Form Validation",
      source: "rule-based-planner",
      steps: [
        {
          action: "open_url",
          target: targetUrl,
          targetType: "url",
          targetValue: targetUrl,
          expected: "Login page loads."
        },
        {
          action: "fill",
          target: emailInput.label || "Username field",
          targetType: emailInput.testid ? "test_id" : (emailInput.id ? "css" : "css"),
          targetValue: emailSelector,
          value: "testuser@example.com",
          expected: "Username populated."
        },
        {
          action: "click",
          target: submitBtn?.text || "Submit Button",
          targetType: submitBtn?.testid ? "test_id" : (submitBtn?.id ? "css" : "css"),
          targetValue: submitSelector,
          expected: "Form displays validation message requiring password."
        }
      ]
    })

    // Invalid password check
    tests.push({
      name: `Verify login fails with invalid password`,
      priority: "High",
      module: "Authentication",
      feature: "Login Validation",
      source: "rule-based-planner",
      steps: [
        {
          action: "open_url",
          target: targetUrl,
          targetType: "url",
          targetValue: targetUrl,
          expected: "Login page loads."
        },
        {
          action: "fill",
          target: emailInput.label || "Username field",
          targetType: emailInput.testid ? "test_id" : (emailInput.id ? "css" : "css"),
          targetValue: emailSelector,
          value: "{{credential.username}}",
          expected: "Valid username is filled."
        },
        {
          action: "fill",
          target: passwordInput.label || "Password field",
          targetType: passwordInput.testid ? "test_id" : (passwordInput.id ? "css" : "css"),
          targetValue: passwordSelector,
          value: "wrongpassword999",
          expected: "Invalid password is filled."
        },
        {
          action: "click",
          target: submitBtn?.text || "Submit Button",
          targetType: submitBtn?.testid ? "test_id" : (submitBtn?.id ? "css" : "css"),
          targetValue: submitSelector,
          expected: "Authentication fails and page shows invalid credentials message."
        }
      ]
    })
  }

  // 3. AUTHENTICATED DASHBOARD TESTS (if scanned authenticated)
  // We can check if authenticated scan metadata is passed inside scanResult (e.g. as scanResult.authenticatedPageScan or if dashboard elements were detected after login)
  const authScan = (scanResult as any).authenticatedPageScan || scanResult
  const isDashboardScanned = (scanResult as any).authenticatedPageScan !== undefined || scanResult?.links?.some(l => /logout|signout/i.test(l.text || ""))

  if (isDashboardScanned) {
    tests.push({
      name: `Verify authenticated dashboard loads correctly`,
      priority: "Critical",
      module: "Dashboard Area",
      feature: "Layout Validation",
      source: "rule-based-planner",
      steps: [
        {
          action: "assert_visible",
          target: "Dashboard View",
          targetType: "css",
          targetValue: "body",
          expected: "Authenticated dashboard container is loaded and visible."
        }
      ]
    })

    const logoutLink = authScan.links?.find((l: any) => /logout|signout|sign out|log out|خروج/i.test(l.text || "")) || authScan.buttons?.find((b: any) => /logout|signout|sign out|log out|خروج/i.test(b.text || ""))
    if (logoutLink) {
      tests.push({
        name: `Verify user logout redirects back to home page`,
        priority: "High",
        module: "Dashboard Area",
        feature: "Logout Execution",
        source: "rule-based-planner",
        steps: [
          {
            action: "click",
            target: logoutLink.text || "Logout button",
            targetType: logoutLink.testid ? "test_id" : (logoutLink.id ? "css" : "text"),
            targetValue: logoutLink.testid || (logoutLink.id ? `#${logoutLink.id}` : logoutLink.text),
            expected: "Clicking Logout signs the user out and redirects to public landing/login URL."
          }
        ]
      })
    }
  }

  // 4. COMPONENT-BASED TESTS
  // Scan form components
  const forms = authScan.forms || []
  if (forms.length > 0) {
    forms.forEach((form: any, idx: number) => {
      tests.push({
        name: `Verify form validation constraints on form #${idx + 1}`,
        priority: "Medium",
        module: "Forms",
        feature: "Validation Tests",
        source: "rule-based-planner",
        steps: [
          {
            action: "assert_visible",
            target: `Form #${idx + 1}`,
            targetType: "css",
            targetValue: form.id ? `#${form.id}` : "form",
            expected: "Form component should be visible on page."
          }
        ]
      })
    })
  }

  // Scan table components
  const tables = authScan.tables || []
  if (tables.length > 0) {
    tables.forEach((table: any, idx: number) => {
      tests.push({
        name: `Verify interactive table row rendering and data loading on grid #${idx + 1}`,
        priority: "Medium",
        module: "Tables",
        feature: "Grid Verification",
        source: "rule-based-planner",
        steps: [
          {
            action: "assert_visible",
            target: `Table Grid #${idx + 1}`,
            targetType: "css",
            targetValue: table.id ? `#${table.id}` : "table",
            expected: "Data table container should be visible and render headers properly."
          }
        ]
      })
    })
  }

  // Search components
  const searchInput = authScan.inputs?.find((i: any) => i.type === "search" || /search/i.test(i.name || "") || /search/i.test(i.id || "") || /search/i.test(i.placeholder || ""))
  if (searchInput) {
    const searchSelector = searchInput.testid ? `testid=${searchInput.testid}` : (searchInput.id ? `#${searchInput.id}` : `input[name='${searchInput.name}']`)
    tests.push({
      name: `Verify search component query execution`,
      priority: "Medium",
      module: "Search",
      feature: "Functional Search",
      source: "rule-based-planner",
      steps: [
        {
          action: "fill",
          target: searchInput.label || "Search input box",
          targetType: searchInput.testid ? "test_id" : "css",
          targetValue: searchSelector,
          value: "test search query",
          expected: "Search field accepts typing inputs correctly."
        }
      ]
    })
  }

  // Dropdown components
  const dropdowns = authScan.dropdowns || []
  if (dropdowns.length > 0) {
    dropdowns.slice(0, 2).forEach((drop: any, idx: number) => {
      const dropSelector = drop.testid ? `testid=${drop.testid}` : (drop.id ? `#${drop.id}` : `select[name='${drop.name}']`)
      tests.push({
        name: `Verify option selection inside dropdown: "${drop.label || drop.name || "Select"}"`,
        priority: "Low",
        module: "Dropdowns",
        feature: "Interactive Selections",
        source: "rule-based-planner",
        steps: [
          {
            action: "assert_visible",
            target: drop.label || "Dropdown selector",
            targetType: drop.testid ? "test_id" : "css",
            targetValue: dropSelector,
            expected: "Dropdown component is visible and can be toggled open."
          }
        ]
      })
    })
  }

  // Modal components
  const modals = authScan.modals || []
  if (modals.length > 0) {
    modals.forEach((modal: any, idx: number) => {
      const modalSelector = modal.id ? `#${modal.id}` : "[role='dialog']"
      tests.push({
        name: `Verify visible dialog layout: "${modal.title || "Modal Container"}"`,
        priority: "Medium",
        module: "Modals",
        feature: "Popups & Dialogs",
        source: "rule-based-planner",
        steps: [
          {
            action: "assert_visible",
            target: modal.title || "Modal Dialog Container",
            targetType: "css",
            targetValue: modalSelector,
            expected: "Modal dialog overlay layout matches expectations."
          }
        ]
      })
    })
  }

  // Every scenario must open a page before acting on it.
  //
  // The smoke and authentication scenarios above already start with open_url,
  // but the ones derived from a scanned page — dashboard, forms, tables,
  // search, dropdowns, modals — began by clicking or asserting against a page
  // the run had never navigated to. Executed standalone they failed on their
  // first step, which read as a broken application rather than a plan that
  // never opened anything.
  //
  // Prepended here rather than in each block so a scenario added later cannot
  // forget it. The URL is taken from the scan those scenarios were derived
  // from; with no URL to navigate to, the scenario is left as it was.
  const navigationUrl = targetUrl || (scanResult as any)?.url || ""
  if (navigationUrl) {
    for (const test of tests) {
      if (test.steps?.[0]?.action === "open_url") continue
      test.steps.unshift({
        action: "open_url",
        target: navigationUrl,
        targetType: "url",
        targetValue: navigationUrl,
        expected: `${pageName} is open before the scenario acts on it.`
      } as QAAgentTest["steps"][number])
    }
  }

  return {
    title: "Free Rule-Based QA Test Plan",
    mode: "Free Rule-Based Mode",
    tests
  }
}
