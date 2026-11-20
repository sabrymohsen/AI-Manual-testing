import { chromium, type Browser, type Page } from "playwright"
import { prisma } from "@/lib/db"
import { chatWithConfiguredProvider } from "@/lib/ai/provider-chat"
import { extractJson, GRAMMAR_GUIDE, AI_TIMEOUT_MS } from "@/lib/plain-english/ai-authoring"
import { parseStep } from "@/lib/plain-english/grammar"
import { executePlainEnglishStep, setPlainEnglishContext } from "@/lib/plain-english/interpreter"
import { compileHubSteps } from "@/lib/hub-steps"
import { cleanName } from "@/lib/hub-report"
import { automationName } from "@/lib/hub-automate"

/**
 * The AI explorer: give it a user story, a start URL and test data; it drives
 * a real browser and writes the test.
 *
 * Each turn it reads the live page (its accessibility snapshot — the same
 * labels a tester sees), asks the AI for ONE next plain-English step, and runs
 * that step with the same deterministic runner every test uses. A step that
 * fails goes back to the AI with the error; a step that works is kept. When the
 * story's flow is done, the acceptance criteria become Verify steps — and only
 * the ones that hold on the real page are added; the others are reported as
 * "possible bug or wrong expectation", never silently saved as passing.
 */

export const EXPLORER_FOLDER = "AI explorer"

export interface ExploreInput {
  projectId: string
  userId: string
  story: { title: string; text: string; criteria: string[] }
  startUrl: string
  /** Test data the AI may type, referred to as {name} in the steps. */
  data: Record<string, string>
  maxSteps?: number
  /** Progress callback (step text), e.g. to log. */
  onStep?: (line: string) => void
}

export interface ExploreLogEntry {
  step: string
  ok: boolean
  error?: string
}

export interface ExploreResult {
  scriptId: string
  name: string
  steps: string[]
  checksAdded: string[]
  /** Acceptance checks that didn't hold on the real page. */
  checksFailed: { step: string; error: string }[]
  log: ExploreLogEntry[]
  stoppedEarly: string | null
}

const OUTLINE_LIMIT = 7000
const SECRET_NAME = /pass|secret|token|pin\b|otp|api[-_]?key|credential/i

async function outline(page: Page): Promise<string> {
  try {
    // Icon-font glyphs in names ("\uf08b Login") would be copied into steps.
    const snap = (await page.locator("body").ariaSnapshot({ timeout: 5000 })).replace(/[\uE000-\uF8FF]/g, "")
    return snap.length > OUTLINE_LIMIT ? snap.slice(0, OUTLINE_LIMIT) + "\n…" : snap
  } catch {
    return "(the page outline could not be read)"
  }
}

async function ask(input: ExploreInput, prompt: string): Promise<any> {
  const reply = await chatWithConfiguredProvider({
    projectId: input.projectId,
    userId: input.userId,
    system:
      "You are a careful QA automation engineer exploring a web app to automate a user story. You act ONE step at a time, only on what is on the page. Answer with JSON only.",
    prompt,
    json: true,
    maxTokens: 1500,
    temperature: 0.2,
    command: "plain-english-generate-steps",
    timeoutMs: AI_TIMEOUT_MS,
  })
  return extractJson(reply)
}

function storyBlock(input: ExploreInput) {
  const data = Object.keys(input.data).length
    ? `Test data you may use (write the {name}, not the value):\n${Object.entries(input.data)
        // Secret-looking values never go to the AI — it only needs the {name}.
        .map(([k, v]) => `- {${k}} = ${SECRET_NAME.test(k) ? "(hidden)" : JSON.stringify(v)}`)
        .join("\n")}`
    : "No test data was given; use realistic values only where the story needs typing."
  return [
    `User story: ${input.story.title}`,
    input.story.text ? `Details: ${input.story.text}` : null,
    input.story.criteria.length ? `Acceptance criteria:\n${input.story.criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}` : null,
    data,
  ]
    .filter(Boolean)
    .join("\n")
}

// Targets that mean nothing on their own: "Click the", "Click button".
const VAGUE = new Set(["the", "a", "an", "it", "this", "that", "here", "button", "link", "field", "element", "page", "item", "box", "input"])

/** Why the explorer won't run a step (beyond grammar errors), or null. */
export function vagueStep(cmd: any): string | null {
  const t = cmd?.target
  if (t && t.by === "name") {
    const n = cleanName(String(t.name || "")).toLowerCase()
    if (n.length < 2 || VAGUE.has(n)) return `"${t.name}" doesn't name anything on the page — quote the exact label from the outline.`
  }
  return null
}

async function pageState(page: Page): Promise<string> {
  const values = await page
    .locator("input, textarea, select")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).join("|"))
    .catch(() => "")
  return `${page.url()}#${(await outline(page)).length}#${values}`
}

export async function exploreStory(input: ExploreInput): Promise<ExploreResult> {
  const maxSteps = Math.min(Math.max(input.maxSteps ?? 20, 3), 40)
  const steps: string[] = [`Go to "${input.startUrl}"`]
  const log: ExploreLogEntry[] = []
  let stoppedEarly: string | null = null
  let browser: Browser | null = null

  const run = async (page: Page, sentence: string) => {
    await executePlainEnglishStep(page, { actionDescription: sentence, timeoutMs: 8000 })
  }

  try {
    browser = await chromium.launch({ headless: true })
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage()
    setPlainEnglishContext(page, { variables: { ...input.data } })
    await run(page, steps[0])
    log.push({ step: steps[0], ok: true })
    input.onStep?.(`✓ ${steps[0]}`)

    let failuresInARow = 0
    let lastError: string | null = null
    for (let turn = 0; turn < maxSteps * 2 && steps.length < maxSteps; turn++) {
      const prompt = [
        storyBlock(input),
        `Steps done so far (they worked):\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
        lastError ? `Your last proposed step FAILED: ${lastError}\nPropose a different step (check the exact label in the outline).` : null,
        `Current page: ${page.url()}`,
        `Page outline (accessibility snapshot):\n${await outline(page)}`,
        GRAMMAR_GUIDE,
        `Do only the story's main flow, in order: fill the fields the story needs (with the test data) BEFORE pressing the button that submits them. Don't open unrelated links. If an earlier step left the right page, go back to it. No checks yet (they come later). When the flow is complete, answer done.`,
        `Return ONLY JSON: {"done": false, "next": "one step sentence"} or {"done": true}`,
      ]
        .filter(Boolean)
        .join("\n\n")
      let answer: any
      try {
        answer = await ask(input, prompt)
      } catch (e: any) {
        // Small local models sometimes answer in prose: count it as a failed attempt.
        lastError = `Your last answer wasn't the JSON asked for (${String(e?.message || e).slice(0, 120)}). Answer ONLY with {"done": false, "next": "..."} or {"done": true}.`
        log.push({ step: "(no usable answer)", ok: false, error: lastError })
        if (++failuresInARow >= 4) {
          stoppedEarly = `Stopped: the AI didn't give a usable answer 4 times in a row.`
          break
        }
        continue
      }
      if (answer?.done === true || !answer?.next) break
      // Trim spaces just inside quotes (left by stripped icon glyphs: " Login" → "Login").
      const sentence = cleanName(String(answer.next)).replace(/"\s*([^"]*?)\s*"/g, '"$1"').trim()
      const parsed = parseStep(sentence)
      const vague = parsed.ok ? vagueStep(parsed.command) : null
      if (!parsed.ok || vague) {
        lastError = parsed.ok ? vague : `"${sentence}" isn't a valid step: ${(parsed as any).error}`
        log.push({ step: sentence, ok: false, error: lastError! })
      } else {
        try {
          const before = await pageState(page)
          await run(page, parsed.text)
          const changed = (await pageState(page)) !== before
          // A step that changes nothing (a repeated click, a no-op) isn't kept.
          if (!changed && parsed.command.type !== "goto" && steps.includes(parsed.text)) {
            lastError = `"${parsed.text}" ran but nothing changed on the page (you already did it). If the page shows an error, fix what caused it; otherwise answer done.`
            log.push({ step: parsed.text, ok: false, error: lastError })
          } else {
            steps.push(parsed.text)
            log.push({ step: parsed.text, ok: true })
            input.onStep?.(`✓ ${parsed.text}`)
            lastError = null
            failuresInARow = 0
            continue
          }
        } catch (e: any) {
          lastError = String(e?.message || e).slice(0, 400)
          log.push({ step: parsed.text, ok: false, error: lastError })
          input.onStep?.(`✗ ${parsed.text} — ${lastError}`)
        }
      }
      if (++failuresInARow >= 4) {
        stoppedEarly = `Stopped after 4 failed attempts in a row. Last error: ${lastError}`
        break
      }
    }
    if (!stoppedEarly && steps.length >= maxSteps) stoppedEarly = `Stopped at the ${maxSteps}-step limit.`

    // Acceptance criteria → checks, kept only if they hold on the real page.
    const checksAdded: string[] = []
    const checksFailed: { step: string; error: string }[] = []
    if (input.story.criteria.length || input.story.text) {
      const answer = await ask(
        input,
        [
          storyBlock(input),
          `The flow is done. Steps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
          `Current page: ${page.url()}`,
          `Page outline:\n${await outline(page)}`,
          GRAMMAR_GUIDE,
          `Write Verify steps that check the acceptance criteria on THIS page (what the user should now see). Use exact text from the outline when it matches the criteria. At most 6.`,
          `Return ONLY JSON: {"checks": ["Verify that ...", ...]}`,
        ].join("\n\n")
      ).catch(() => null)
      const checks: string[] = Array.isArray(answer?.checks) ? answer.checks.filter((c: unknown) => typeof c === "string").slice(0, 6) : []
      for (const c of checks) {
        const parsed = parseStep(c)
        if (!parsed.ok) {
          checksFailed.push({ step: c, error: parsed.error })
          continue
        }
        try {
          await run(page, parsed.text)
          checksAdded.push(parsed.text)
          input.onStep?.(`✓ ${parsed.text}`)
        } catch (e: any) {
          checksFailed.push({ step: parsed.text, error: String(e?.message || e).slice(0, 300) })
          input.onStep?.(`✗ ${parsed.text}`)
        }
      }
    }

    const all = [...steps, ...checksAdded]
    const name = await automationName(input.projectId, input.story.title, "explore")
    const dataTable = Object.keys(input.data).length ? { columns: Object.keys(input.data), rows: [Object.values(input.data)] } : null
    const script = await prisma.testScript.create({
      data: {
        name,
        type: "Web",
        mode: "steps",
        steps: all.map((text) => ({ text })) as any,
        ...(dataTable ? { data: dataTable as any } : {}),
        code: compileHubSteps(name, all.map((text) => ({ text })), dataTable).code,
        projectId: input.projectId,
        folder: EXPLORER_FOLDER,
        // Nothing confirmed, or it gave up: a person should look before trusting it.
        tags: ["ai-explorer", ...(checksAdded.length === 0 || stoppedEarly ? ["needs-review"] : [])],
      },
    })
    return { scriptId: script.id, name, steps: all, checksAdded, checksFailed, log, stoppedEarly }
  } finally {
    await browser?.close().catch(() => {})
  }
}
