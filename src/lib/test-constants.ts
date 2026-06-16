export const ACTION_TYPES = [
  "open_url", "click", "fill", "select", "upload_file",
  "wait_for_text", "wait_for_url", "assert_visible", "assert_hidden",
  "assert_text", "assert_url", "assert_api_status", "screenshot", "custom_instruction",
]

export const TARGET_TYPES = [
  "test_id", "role", "text", "label", "placeholder", "css", "xpath", "url", "none",
]

export const ASSERTION_TYPES = [
  "url_contains",
  "text_visible",
  "element_visible",
  "element_hidden",
  "text_equals",
  "api_status",
  "console_no_errors",
  "custom",
]

export const ACTION_TYPE_LABELS: Record<string, string> = {
  open_url: "Open URL",
  click: "Click Element",
  fill: "Fill Input",
  select: "Select Option",
  upload_file: "Upload File",
  wait_for_text: "Wait for Text",
  wait_for_url: "Wait for URL",
  assert_visible: "Assert Element Visible",
  assert_hidden: "Assert Element Hidden",
  assert_text: "Assert Text Content",
  assert_url: "Assert URL",
  assert_api_status: "Assert API Status",
  screenshot: "Take Screenshot",
  custom_instruction: "Custom Instruction",
}

export const TARGET_TYPE_LABELS: Record<string, string> = {
  test_id: "data-testid",
  role: "ARIA Role",
  text: "Text Content",
  label: "Label Text",
  placeholder: "Placeholder Text",
  css: "CSS Selector",
  xpath: "XPath",
  url: "URL",
  none: "None / Default",
}

export const ASSERTION_TYPE_LABELS: Record<string, string> = {
  url_contains: "URL Contains",
  text_visible: "Text Visible",
  element_visible: "Element Visible",
  element_hidden: "Element Hidden",
  text_equals: "Text Equals",
  api_status: "API Status",
  console_no_errors: "No Console Errors",
  custom: "Custom",
}
