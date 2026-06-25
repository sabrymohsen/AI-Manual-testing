import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function GET() {
  const wb = XLSX.utils.book_new()

  // ─── Sheet 1: Test Cases Template ────────────────────────────────────────────
  const headers = [
    "Test Case Title *",
    "Module Name",
    "Feature Name",
    "Component Name",
    "Priority",
    "Preconditions",
    "Requirement Keys",
    "Step Action Description *",
    "Step Expected Result *",
    "Step Action Type",
    "Step Target Type",
    "Step Target Value",
    "Step Input Value",
    "Step Timeout (ms)",
  ]

  // Sample rows — two test cases, second has two steps (repeat title for extra rows)
  const sampleRows = [
    [
      "Verify successful login",
      "Authentication",
      "User Login",
      "Login Form",
      "High",
      "User must be registered. App is running.",
      "REQ-001, REQ-002",
      "Open the application login page",
      "Login page is displayed with username and password fields",
      "open_url",
      "url",
      "https://app.example.com/login",
      "",
      "10000",
    ],
    [
      // Same title = continuation step for the same test case
      "Verify successful login",
      "",
      "",
      "",
      "",
      "",
      "",
      "Enter valid credentials and click Login",
      "User is redirected to the Dashboard",
      "fill",
      "test_id",
      "login-button",
      "user@example.com",
      "10000",
    ],
    [
      "Verify login fails with wrong password",
      "Authentication",
      "User Login",
      "",
      "Critical",
      "User account exists in the system.",
      "REQ-003",
      "Enter a valid username and an incorrect password, then click Login",
      "An error message 'Invalid credentials' is displayed. User stays on the login page.",
      "fill",
      "css",
      "#password-input",
      "WrongPassword123",
      "10000",
    ],
    [
      "Verify user can reset password",
      "Authentication",
      "Password Reset",
      "Reset Form",
      "Medium",
      "User has a registered email.",
      "",
      "Click the 'Forgot Password' link on the login page",
      "Password reset page is displayed with email input field",
      "click",
      "text",
      "Forgot Password",
      "",
      "8000",
    ],
  ]

  const wsData = [headers, ...sampleRows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws["!cols"] = [
    { wch: 35 }, // Test Case Title
    { wch: 20 }, // Module
    { wch: 20 }, // Feature
    { wch: 20 }, // Component
    { wch: 12 }, // Priority
    { wch: 35 }, // Preconditions
    { wch: 22 }, // Requirement Keys
    { wch: 45 }, // Action Description
    { wch: 45 }, // Expected Result
    { wch: 20 }, // Action Type
    { wch: 15 }, // Target Type
    { wch: 30 }, // Target Value
    { wch: 25 }, // Input Value
    { wch: 15 }, // Timeout
  ]

  XLSX.utils.book_append_sheet(wb, ws, "Test Cases")

  // ─── Sheet 2: Instructions ────────────────────────────────────────────────────
  const instructionRows = [
    ["📋 HOW TO USE THIS TEMPLATE", ""],
    ["", ""],
    ["GENERAL RULES", ""],
    ["1. Do not delete or rename the column headers in the 'Test Cases' sheet.", ""],
    ["2. Columns marked with * are required.", ""],
    ["3. Each row is one test STEP. Group steps under the same test case by repeating the title.", ""],
    ["4. For a test case with multiple steps: fill the title only on the FIRST row. Leave it blank (or repeat it) for subsequent step rows.", ""],
    ["5. A cell can contain multiple lines using Alt+Enter (Excel). Steps will be split automatically.", ""],
    ["6. Save the file as .xlsx or .xls before uploading.", ""],
    ["", ""],
    ["FIELD DESCRIPTIONS", "Details"],
    ["Test Case Title *", "Name of the test case. Rows sharing the same title become steps of that test case."],
    ["Module Name", "Top-level grouping (e.g. Authentication, Payments). Created automatically if it doesn't exist."],
    ["Feature Name", "Mid-level grouping under a module (e.g. User Login)."],
    ["Component Name", "Leaf-level grouping under a feature (e.g. Login Form)."],
    ["Priority", "One of: Low | Medium | High | Critical  (default: Medium)"],
    ["Preconditions", "Any steps or state required before executing this test case."],
    ["Requirement Keys", "Comma-separated keys to link requirements (e.g. REQ-001, REQ-002)."],
    ["Step Action Description *", "What the tester should do in this step."],
    ["Step Expected Result *", "What should happen after this step."],
    ["Step Action Type", "See the 'Valid Values' sheet for a full list. Default: custom_instruction"],
    ["Step Target Type", "See the 'Valid Values' sheet for a full list. Default: none"],
    ["Step Target Value", "CSS selector, XPath, test-id, URL, label text, etc."],
    ["Step Input Value", "Text to type, value to select, or URL to navigate to."],
    ["Step Timeout (ms)", "Maximum wait time in milliseconds before the step fails. Default: 10000"],
  ]
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionRows)
  wsInstructions["!cols"] = [{ wch: 35 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions")

  // ─── Sheet 3: Valid Values ────────────────────────────────────────────────────
  const validValueRows = [
    ["PRIORITY VALUES", "", "ACTION TYPE VALUES", "", "TARGET TYPE VALUES"],
    ["Value", "Description", "Value", "Description", "Value"],
    ["Low", "Minor importance", "open_url", "Navigate to a URL", "none"],
    ["Medium", "Standard importance (default)", "click", "Click an element", "test_id"],
    ["High", "Important test", "fill", "Type text into an input", "css"],
    ["Critical", "Must pass before release", "select", "Choose from a dropdown", "xpath"],
    ["", "", "select_custom", "Custom dropdown select", "role"],
    ["", "", "select_searchable", "Searchable dropdown", "text"],
    ["", "", "multi_select", "Select multiple options", "label"],
    ["", "", "remove_multi_select_value", "Remove a multi-select value", "placeholder"],
    ["", "", "autocomplete_select", "Autocomplete field selection", "url"],
    ["", "", "date_select", "Pick a date from a date picker", ""],
    ["", "", "time_select", "Pick a time from a time picker", ""],
    ["", "", "upload_file", "Upload a file", ""],
    ["", "", "check", "Check a checkbox", ""],
    ["", "", "uncheck", "Uncheck a checkbox", ""],
    ["", "", "radio_select", "Select a radio button", ""],
    ["", "", "tab_select", "Switch to a tab", ""],
    ["", "", "menu_select", "Select a menu item", ""],
    ["", "", "modal_open", "Open a modal dialog", ""],
    ["", "", "modal_close", "Close a modal dialog", ""],
    ["", "", "table_row_select", "Select a table row", ""],
    ["", "", "pagination_next", "Go to next page", ""],
    ["", "", "pagination_previous", "Go to previous page", ""],
    ["", "", "accordion_expand", "Expand an accordion", ""],
    ["", "", "accordion_collapse", "Collapse an accordion", ""],
    ["", "", "toggle_on", "Toggle a switch on", ""],
    ["", "", "toggle_off", "Toggle a switch off", ""],
    ["", "", "slider_set", "Set a slider value", ""],
    ["", "", "wait_for_text", "Wait until text appears", ""],
    ["", "", "wait_for_url", "Wait until URL matches", ""],
    ["", "", "assert_visible", "Assert an element is visible", ""],
    ["", "", "assert_hidden", "Assert an element is hidden", ""],
    ["", "", "assert_text", "Assert element text content", ""],
    ["", "", "assert_url", "Assert current URL", ""],
    ["", "", "assert_api_status", "Assert an API response status", ""],
    ["", "", "screenshot", "Take a screenshot", ""],
    ["", "", "custom_instruction", "Free-text manual instruction (default)", ""],
  ]
  const wsValid = XLSX.utils.aoa_to_sheet(validValueRows)
  wsValid["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 28 }, { wch: 38 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsValid, "Valid Values")

  // ─── Serialize & Return ───────────────────────────────────────────────────────
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="test-cases-template.xlsx"',
      "Cache-Control": "no-store",
    },
  })
}
