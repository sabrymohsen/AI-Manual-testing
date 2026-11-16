/**
 * AI help while WRITING plain-English steps. Server only.
 *
 * The AI proposes sentences; every sentence is then parsed by the deterministic
 * grammar and returned with its verdict, so a person only ever inserts steps the
 * runner understands, and the run itself never calls the AI.
 *
 * Sized for the project's provider (a slow reasoning model): one call, a small
 * page outline instead of a screenshot, and a timeout well inside the route's
 * maxDuration so a slow answer is reported as slow rather than as a bare 502.
 */
import { chatWithConfiguredProvider, hasConfiguredProvider } from "@/lib/ai/provider-chat"
import { parseStep, STEP_TEMPLATES } from "./grammar"

export const AI_TIMEOUT_MS = 200_000

/**
 * Pull the JSON out of a model reply. Reasoning models may think aloud (with
 * braces of their own) or wrap the answer in a code fence, so try each opening
 * brace in turn against each closing brace, longest slice first, until one parses.
 */
export function extractJson(text: string): any {
  const cleaned = (text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "")
  const starts: number[] = []
  for (let i = 0; i < cleaned.length; i++) if (cleaned[i] === "{" || cleaned[i] === "[") starts.push(i)
  for (const start of starts) {
    const closer = cleaned[start] === "[" ? "]" : "}"
    for (let end = cleaned.lastIndexOf(closer); end > start; end = cleaned.lastIndexOf(closer, end - 1)) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {}
    }
  }
  throw new Error("The AI answer had no readable JSON in it.")
}

const GRAMMAR_GUIDE = `Write each step as ONE sentence using only these forms (quote every visible label and value exactly as it appears on the page):
${STEP_TEMPLATES.map(t => `- ${t}`).join("\n")}
Rules: one action per sentence. Use the exact label text from the page outline. Put typed values and labels in double quotes. Use {name} for values stored earlier. Do not invent pages, labels or buttons that are not in the outline. Prefer "Verify that ..." steps to check results.`

export interface GeneratedStep {
  text: string
  ok: boolean
  meaning?: string
  error?: string
}

export async function generateStepsFromIntent(opts: {
  projectId: string
  instruction: string
  pageOutline: string | null
  pageUrl: string | null
  previousSteps: string[]
}): Promise<{ steps: GeneratedStep[]; usedPage: boolean }> {
  if (!(await hasConfiguredProvider(opts.projectId))) {
    throw Object.assign(new Error("No AI provider is set up for this project. Add one in the project's AI settings, or write the steps yourself."), { status: 400 })
  }
  const prompt = [
    `Task for a UI test: ${opts.instruction}`,
    opts.pageUrl ? `The test is on this page: ${opts.pageUrl}` : null,
    opts.previousSteps.length ? `Steps already in the test (continue after them, do not repeat):\n${opts.previousSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : null,
    opts.pageOutline ? `Page outline:\n${opts.pageOutline}` : "No page outline is available; use the labels the task names.",
    GRAMMAR_GUIDE,
    `When the task describes a persona or data ("as a QA manager at Acme"), make up realistic, specific values that fit it and type them.`,
    `Return ONLY JSON: {"steps": ["sentence", "sentence", ...]} with at most 25 steps.`,
  ]
    .filter(Boolean)
    .join("\n\n")

  const reply = await chatWithConfiguredProvider({
    projectId: opts.projectId,
    system: "You write precise, executable UI test steps in plain English. You answer with JSON only.",
    prompt,
    maxTokens: 6000,
    temperature: 0.4,
    json: true,
    command: "plain-english-generate-steps",
    timeoutMs: AI_TIMEOUT_MS,
  })
  const data = extractJson(reply)
  const raw: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.steps) ? data.steps : []
  const steps = raw
    .filter((s): s is string => typeof s === "string" && !!s.trim())
    .slice(0, 25)
    .map(s => {
      const parsed = parseStep(s)
      return parsed.ok ? { text: parsed.text, ok: true, meaning: parsed.meaning } : { text: parsed.text, ok: false, error: parsed.error }
    })
  if (!steps.length) throw new Error("The AI did not return any steps. Try describing the task more concretely.")
  return { steps, usedPage: !!opts.pageOutline }
}

/**
 * Realistic test data from a description ("a French fashion designer"), made
 * once while authoring and inserted as Set variable steps — so every run uses
 * the same values and a failure can be reproduced.
 */
export async function generateTestData(opts: { projectId: string; description: string; names: string[] }): Promise<Record<string, string>> {
  if (!(await hasConfiguredProvider(opts.projectId))) {
    throw Object.assign(new Error("No AI provider is set up for this project. Add one in the project's AI settings."), { status: 400 })
  }
  const names = opts.names.filter(n => /^[A-Za-z_][\w-]*$/.test(n)).slice(0, 30)
  const reply = await chatWithConfiguredProvider({
    projectId: opts.projectId,
    system: "You generate realistic, valid test data. You answer with JSON only.",
    prompt: [
      `Generate test data for: ${opts.description}`,
      names.length ? `Return exactly these keys: ${names.join(", ")}.` : `Choose sensible keys (camelCase) for the data described, at most 12.`,
      "Values must be strings, realistic and internally consistent (the email matches the name, the phone matches the country).",
      'Return ONLY JSON like {"firstName": "Camille", "email": "camille.durand@example.fr"}.',
    ].join("\n"),
    maxTokens: 3000,
    temperature: 0.8,
    json: true,
    command: "plain-english-generate-data",
    timeoutMs: AI_TIMEOUT_MS,
  })
  const data = extractJson(reply)
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The AI answer was not a set of values.")
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    const key = k.replace(/[^\w-]/g, "_").replace(/^(\d)/, "_$1")
    if (key && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) out[key] = String(v)
  }
  if (!Object.keys(out).length) throw new Error("The AI did not return any values.")
  return out
}
