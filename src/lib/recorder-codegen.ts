// Shared SHAFT Java code generation from Visual Recorder actions.
// Used by the live client-side preview and by POST /api/hub/recorder/generate.

export interface RecordedAction {
  id: string
  step: number
  kind: "navigate" | "click" | "type" | "select" | "press"
  label: string // human readable element / target name
  locator?: string // ready-to-paste Java By locator
  value?: string
  isPassword?: boolean
  url?: string
  // last known element position, used for the red highlight overlay
  rect?: { x: number; y: number; width: number; height: number }
  at: number
}

const escapeJava = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")

export function actionToJavaLine(action: RecordedAction): string | null {
  switch (action.kind) {
    case "navigate":
      return action.url ? `navigateTo("${escapeJava(action.url)}");` : null
    case "click":
      return action.locator ? `driver.element().click(${action.locator});` : null
    case "type": {
      if (!action.locator) return null
      const value = action.isPassword ? "[REDACTED]" : action.value || ""
      return `driver.element().type(${action.locator}, "${escapeJava(value)}");`
    }
    case "select":
      return action.locator
        ? `driver.element().select(${action.locator}, "${escapeJava(action.value || "")}");`
        : null
    case "press":
      return action.locator
        ? `driver.element().keyPress(${action.locator}, Keys.${action.value || "ENTER"});`
        : null
    default:
      return null
  }
}

export function generateShaftJava(actions: RecordedAction[], className = "RecordedFlowTest"): string {
  const usesKeys = actions.some((a) => a.kind === "press")
  const usesBy = actions.some((a) => a.locator)

  const lines: string[] = []
  let step = 0
  for (const action of actions) {
    const code = actionToJavaLine(action)
    if (!code) continue
    step++
    const label = (action.label || "").replace(/\s+/g, " ").trim().slice(0, 60)
    lines.push(`        // Step ${step}: ${action.kind} — ${label}`)
    lines.push(`        ${code}`)
  }

  const body =
    lines.length > 0
      ? lines.join("\n")
      : "        // No actions recorded yet — interact with the browser view to capture steps"

  return `package com.ourcompany.tests;

${usesBy ? "import org.openqa.selenium.By;\n" : ""}${usesKeys ? "import org.openqa.selenium.Keys;\n" : ""}import org.testng.annotations.Test;

public class ${className} extends BaseTest {
    @Test(description = "Flow recorded with the Automation Hub Visual Recorder")
    public void testRecordedFlow() {
${body}
    }
}
`
}
