/**
 * The Browser Agent's brain: given one manual test step, the expected result
 * and the live page (playwright-cli snapshot), choose the next browser action
 * — or, once the step is done, judge the expected result against the page.
 *
 * The page drives the loop (it owns the browser, on the server or on the
 * tester's computer); this is one stateless AI call per turn. Secret test data
 * never reaches the AI: it sees {name} placeholders, the page fills them in.
 */
import { chatWithConfiguredProvider, hasConfiguredProvider, hasLocalAi } from "@/lib/ai/provider-chat"
import { extractJson, AI_TIMEOUT_MS } from "@/lib/plain-english/ai-authoring"
import { compactSnapshot } from "./snapshot"

export const MAX_ACTIONS_PER_STEP = 8

export type AgentAction =
  | { kind: "act"; cmd: "click" | "dblclick" | "fill" | "select" | "check" | "uncheck" | "hover" | "press" | "goto" | "go-back" | "reload" | "wait"; ref?: string; value?: string; why: string }
  /** Keep a value the page shows (a request number…) as {name} for later steps. */
  | { kind: "remember"; name: string; value: string; why: string }
  | { kind: "done"; passed: boolean; actual: string }

export interface NextInput {
  projectId: string
  userId: string
  testTitle: string
  /** Earlier steps of this test and how they went, for context. */
  previous: { action: string; passed: boolean }[]
  step: { action: string; expected: string }
  page: { url?: string; title?: string; snapshot: string }
  /** What the agent already did for this step (and any error). */
  done: { action: string; error?: string }[]
  /** Test data names the AI may use as {name}; values are never sent. */
  dataNames: string[]
  /** Values remembered from the page in earlier steps (shown to the AI: they came from the page). */
  remembered?: Record<string, string>
  /** "As reviewer:" — the user doing this step, in their own browser. */
  user?: string
}

const ACT_CMDS = new Set(["click", "dblclick", "fill", "select", "check", "uncheck", "hover", "press", "goto", "go-back", "reload", "wait"])
const REF = /^(?:f\d+)?e\d{1,6}$/

export const AGENT_SYSTEM = `You are a careful QA tester executing a manual test case in a real web browser, one action at a time.
You see the page as an accessibility outline; every element you can act on has a [ref=eN] tag.
Reply with JSON only, one of:
{"action":"click","ref":"e12","why":"..."}            also: dblclick, hover, check, uncheck
{"action":"fill","ref":"e7","value":"text","why":"..."}  type into a field (replaces its content)
{"action":"select","ref":"e9","value":"Option label","why":"..."}
{"action":"press","value":"Enter","why":"..."}          a keyboard key
{"action":"goto","value":"https://...","why":"..."}      only when the step says to open a page
{"action":"go-back"} {"action":"reload"} {"action":"wait","value":"2","why":"page still loading"}
{"action":"remember","name":"request_id","value":"REQ-1042","why":"..."}  keep a value shown on the page for later steps
{"done":true,"passed":true|false,"actual":"what the page shows now"}
Rules:
- Do exactly what the current step says, nothing more. Use only refs that are in the outline you were given now.
- When the step's action is complete (or the step only checks something), compare the EXPECTED RESULT with the outline and reply "done".
- passed=true only if the outline clearly shows the expected result. If it shows something else, an error, or you cannot find what the step needs, passed=false.
- "actual" is one or two factual sentences about what the page shows, in the same language as the step.
- Test data is written as {name}; use the placeholder as the value, never invent passwords.
- When the step says to remember, save or note a value (a request number, an ID, a total), reply "remember" with a short snake_case name (the one the step gives, if any) and the exact text copied from the outline, then continue. Later steps use it as {name}.
- Each user in the test has their own browser and their own login. When you act as a user, log in with that user's test data if the step says to.
- If an action failed, try a different element or approach once; after repeated failures reply done with passed=false.`

export async function aiAvailable(projectId: string, userId: string) {
  return (await hasConfiguredProvider(projectId)) || (await hasLocalAi(userId))
}

export function buildPrompt(input: NextInput): string {
  return [
    `Test case: ${input.testTitle}`,
    input.previous.length ? `Earlier steps:\n${input.previous.map((p, i) => `${i + 1}. ${p.action} — ${p.passed ? "passed" : "failed"}`).join("\n")}` : null,
    `CURRENT STEP: ${input.step.action}`,
    `EXPECTED RESULT: ${input.step.expected || "(none given — the step just has to succeed)"}`,
    input.user
      ? `YOU ARE ACTING AS: ${input.user} (their own browser).${userData(input).length ? ` This user's test data: ${userData(input).map((n) => `{${n}}`).join(", ")}` : ""}`
      : null,
    input.dataNames.length ? `Test data you may use: ${input.dataNames.map((n) => `{${n}}`).join(", ")}` : null,
    input.remembered && Object.keys(input.remembered).length
      ? `Remembered earlier (use as {name}):\n${Object.entries(input.remembered).map(([k, v]) => `{${k}} = "${v}"`).join("\n")}`
      : null,
    input.done.length
      ? `Already done for this step:\n${input.done.map((d, i) => `${i + 1}. ${d.action}${d.error ? ` → FAILED: ${d.error.slice(0, 300)}` : " → ok"}`).join("\n")}`
      : "Nothing done for this step yet.",
    `Page: ${input.page.title || ""} ${input.page.url || ""}`.trim(),
    `Page outline:\n${compactSnapshot(input.page.snapshot)}`,
    `Reply with the next action or "done", as JSON only.`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** Test data that belongs to the acting user: reviewer_user, reviewer-password, reviewerPassword… */
function userData(input: NextInput) {
  const u = (input.user || "").toLowerCase()
  return u ? input.dataNames.filter((n) => n.toLowerCase().startsWith(u) && n.length > u.length) : []
}

export const REMEMBER_NAME = /^[A-Za-z][\w-]{0,39}$/

/** Turns the AI's reply into an action; anything unusable becomes a failed "done". */
export function parseAgentReply(raw: string, snapshot: string): AgentAction {
  let d: any
  try {
    d = extractJson(raw)
  } catch {
    d = null
  }
  if (!d || typeof d !== "object") return { kind: "done", passed: false, actual: "The AI didn't give a usable answer for this step." }
  if (d.done === true || d.action === "done") {
    return { kind: "done", passed: d.passed === true, actual: String(d.actual || d.why || "").slice(0, 1000) || (d.passed ? "As expected." : "Not as expected.") }
  }
  const cmd = String(d.action || "").toLowerCase()
  if (cmd === "remember") {
    const name = String(d.name || "").trim().replace(/^\{|\}$/g, "")
    const value = String(d.value ?? "").trim().slice(0, 300)
    if (!REMEMBER_NAME.test(name) || !value) return { kind: "done", passed: false, actual: "The AI didn't say which value to remember." }
    return { kind: "remember", name, value, why: String(d.why || "").slice(0, 300) }
  }
  if (!ACT_CMDS.has(cmd)) return { kind: "done", passed: false, actual: `The AI asked for an unknown action "${cmd}".` }
  const why = String(d.why || "").slice(0, 300)
  const value = d.value === undefined || d.value === null ? undefined : String(d.value).slice(0, 2000)
  const needsRef = ["click", "dblclick", "fill", "select", "check", "uncheck", "hover"].includes(cmd)
  if (needsRef) {
    const ref = String(d.ref || "").trim()
    if (!REF.test(ref) || !snapshot.includes(`[ref=${ref}]`)) {
      return { kind: "act", cmd: "wait", value: "1", why: `The AI picked an element that isn't on the page (${ref || "none"}).` }
    }
    if ((cmd === "fill" || cmd === "select") && value === undefined) return { kind: "done", passed: false, actual: `The AI didn't say what to ${cmd}.` }
    return { kind: "act", cmd: cmd as any, ref, value, why }
  }
  if (cmd === "press" && !/^[A-Za-z0-9+]{1,30}$/.test(value || "")) return { kind: "done", passed: false, actual: "The AI asked for an invalid key." }
  if (cmd === "goto" && !/^https?:\/\//i.test(value || "")) return { kind: "done", passed: false, actual: "The AI asked to open an invalid address." }
  return { kind: "act", cmd: cmd as any, value, why }
}

export async function nextAction(input: NextInput): Promise<AgentAction> {
  if (input.done.length >= MAX_ACTIONS_PER_STEP) {
    return { kind: "done", passed: false, actual: `Stopped after ${MAX_ACTIONS_PER_STEP} actions without finishing this step.` }
  }
  const reply = await chatWithConfiguredProvider({
    projectId: input.projectId,
    system: AGENT_SYSTEM,
    prompt: buildPrompt(input),
    maxTokens: 800,
    temperature: 0.1,
    json: true,
    command: "browser-agent-step",
    timeoutMs: AI_TIMEOUT_MS,
    userId: input.userId,
  })
  return parseAgentReply(reply, input.page.snapshot)
}
