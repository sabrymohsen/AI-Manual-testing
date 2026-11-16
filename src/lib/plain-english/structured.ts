/**
 * Turn a plain-English step into the structured step fields the rest of the app
 * already reads (lists, exports, code generation, reports). Browser-safe.
 *
 * The sentence stays the source of truth — executeStep runs the sentence — so
 * these fields are a faithful SUMMARY. Commands with no structured equivalent
 * are stored as custom_instruction with the sentence as their description.
 */
import { parseStep, type Command, type Target } from "./grammar"

export interface StructuredFields {
  actionType: string
  targetType: string
  targetValue: string
  inputValue: string
}

function targetFields(t: Target | null): { targetType: string; targetValue: string } {
  if (!t) return { targetType: "none", targetValue: "" }
  switch (t.by) {
    case "css":
      return { targetType: "css", targetValue: t.selector }
    case "testid":
      return { targetType: "test_id", targetValue: t.id }
    case "name":
      if (t.kind === "field" || t.kind === "dropdown") return { targetType: "label", targetValue: t.name }
      if (["button", "link", "heading", "checkbox", "radio", "tab", "menuitem"].includes(t.kind)) {
        const role = t.kind === "menuitem" ? "menuitem" : t.kind
        return { targetType: "role", targetValue: `${role}, name: "${t.name}"` }
      }
      return { targetType: "text", targetValue: t.name }
    default:
      return { targetType: "none", targetValue: "" }
  }
}

export function toStructured(command: Command): StructuredFields {
  const none = { targetType: "none", targetValue: "" }
  switch (command.type) {
    case "goto":
      return { actionType: "open_url", ...none, targetType: "url", inputValue: command.url }
    case "click":
      return { actionType: "click", ...targetFields(command.target), inputValue: "" }
    case "type":
      return { actionType: "fill", ...targetFields(command.target), inputValue: command.value === "***" ? "***MASKED***" : command.value }
    case "clear":
      return { actionType: "fill", ...targetFields(command.target), inputValue: "" }
    case "select":
      return { actionType: "select", ...targetFields(command.target), inputValue: command.option }
    case "check":
    case "uncheck":
      return { actionType: command.type, ...targetFields(command.target), inputValue: "" }
    case "upload":
      return { actionType: "upload_file", ...targetFields(command.target), inputValue: command.file }
    case "wait":
      return { actionType: "wait", ...none, inputValue: String(command.ms) }
    case "waitFor":
      return command.target.by === "name" && command.state === "visible"
        ? { actionType: "wait_for_text", targetType: "text", targetValue: command.target.name, inputValue: "" }
        : { actionType: "custom_instruction", ...none, inputValue: "" }
    case "waitForUrl":
      return { actionType: "wait_for_url", ...none, inputValue: command.expected }
    case "assertVisible":
      return { actionType: command.negate ? "assert_hidden" : "assert_visible", ...targetFields(command.target), inputValue: "" }
    case "assertText":
      return command.target
        ? { actionType: command.comparison === "equals" ? "text_equals" : "text_contains", ...targetFields(command.target), inputValue: command.expected }
        : { actionType: "text_contains", targetType: "css", targetValue: "body", inputValue: command.expected }
    case "assertUrl":
      return { actionType: command.comparison === "equals" ? "url_equals" : "url_contains", ...none, inputValue: command.expected }
    case "assertTitle":
      return { actionType: "title_contains", ...none, inputValue: command.expected }
    case "checkpoint":
      return { actionType: "screenshot", ...none, inputValue: command.name || "" }
    default:
      return { actionType: "custom_instruction", ...none, inputValue: "" }
  }
}

/**
 * Build the saved step for a sentence. Returns the fields to merge into the
 * step and whether the sentence was understood. Unparseable sentences are still
 * saved (as a note) so nothing a person typed is lost; the editor flags them and
 * the run fails on them with the reason.
 */
export function plainEnglishStepFields(sentence: string) {
  const parsed = parseStep(sentence)
  const fields = parsed.ok ? toStructured(parsed.command) : { actionType: "custom_instruction", targetType: "none", targetValue: "", inputValue: "" }
  return {
    parsed,
    step: {
      actionDescription: parsed.text || sentence,
      ...fields,
      actionMetadata: { plainEnglish: true, version: 1 },
    },
  }
}

/** Best-effort sentence for an existing structured step, to switch it to plain English. */
export function describeStructuredStep(step: { actionType: string; targetType: string; targetValue?: string | null; inputValue?: string | null; actionDescription?: string }): string | null {
  const v = step.targetValue || ""
  const input = step.inputValue || ""
  const name = (() => {
    if (step.targetType === "role") {
      const m = /^([^,]+),\s*name:\s*["'](.+)["']$/.exec(v)
      if (m) return `the "${m[2]}" ${m[1].trim() === "textbox" ? "field" : m[1].trim()}`
    }
    if (step.targetType === "label" || step.targetType === "placeholder") return `the "${v}" field`
    if (step.targetType === "text") return `"${v}"`
    if (step.targetType === "test_id") return `the element with test id "${v}"`
    if (step.targetType === "css") return `css "${v}"`
    return null
  })()
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`
  switch (step.actionType) {
    case "open_url":
      return input || v ? `Go to ${q(input || v)}` : null
    case "click":
      return name ? `Click ${name}` : null
    case "fill":
      return name ? (input === "***MASKED***" ? `Type {password} in ${name}` : `Type ${q(input)} in ${name}`) : null
    case "select":
      return name ? `Select ${q(input)} from ${name}` : null
    case "check":
    case "uncheck":
      return name ? `${step.actionType === "check" ? "Check" : "Uncheck"} ${name}` : null
    case "wait":
      return `Wait ${Math.max(1, Math.round((parseInt(input, 10) || 1000) / 1000))} seconds`
    case "wait_for_text":
      return v || input ? `Wait for ${q(v || input)} to appear` : null
    case "wait_for_url":
      return input ? `Wait for the URL to contain ${q(input)}` : null
    case "assert_visible":
    case "visible":
      return name ? `Verify that ${name} is visible` : null
    case "assert_hidden":
    case "hidden":
      return name ? `Verify that ${name} is not visible` : null
    case "text_contains":
    case "assert_text":
      return name ? `Verify that ${name} contains ${q(input)}` : input ? `Verify that the page contains ${q(input)}` : null
    case "text_equals":
      return name ? `Verify that ${name} equals ${q(input)}` : null
    case "url_contains":
    case "assert_url":
      return input ? `Verify that the URL contains ${q(input)}` : null
    case "url_equals":
      return input ? `Verify that the URL equals ${q(input)}` : null
    case "title_contains":
      return input ? `Verify that the title contains ${q(input)}` : null
    case "screenshot":
      return "Visually check this screen"
    default:
      return null
  }
}
