import axios from "axios"
import { probeOllama } from "@/lib/hub-ai-providers"
import { prisma } from "@/lib/db"
import {
  chatWithConfiguredProvider,
  resolveProvider,
} from "@/lib/ai/provider-chat"
import {
  BUG_REPORT_CRAFT,
  LANGUAGE_RULE,
  SEVERITY_PRIORITY_RUBRIC,
} from "@/lib/ai/qa-craft"

/**
 * Bug-report drafter: a tester's note (and optional screenshot) in, a structured
 * draft out — title, description, severity, priority, steps, expected/actual.
 *
 * Provider order:
 *   1. Whatever the workspace configured in the AI hub (Kimi, OpenAI, …),
 *      including the screenshot when the model accepts images.
 *   2. Ollama (local, free) — vision model for the screenshot when installed
 *      (llava / llama3.2-vision / bakllava / moondream).
 *   3. Hugging Face Inference API (free tier, text-only).
 *   4. A deterministic rule-based draft, so the feature always returns something
 *      even with no AI provider available.
 *
 * It only DRAFTS a bug — the caller (UI) lets the user edit everything before saving.
 */

export interface BugDraftInput {
  description: string
  /** Use this project's own AI provider config when it has one. */
  projectId?: string | null
  imageBase64?: string | null   // raw base64 (no data: prefix)
  imageMimeType?: string | null
  appUrl?: string | null
}

export interface BugDraftStep {
  stepNumber: number
  actionDescription: string
  expectedResult?: string
}

export interface BugDraft {
  title: string
  /** Written summary of the defect — impact and context, not a copy of the note. */
  description: string
  severity: "Low" | "Medium" | "High" | "Critical"
  priority: "Low" | "Medium" | "High" | "Critical"
  steps: BugDraftStep[]
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
  provider: "provider" | "ollama" | "huggingface" | "rule-based"
  /**
   * Why the draft fell back to the template, when it did.
   *
   * "rule-based" is reached four different ways and only one of them is
   * "nothing is configured", but the tester was told that one every time. A
   * provider that 401s, that is pointed at an unreachable local daemon, or
   * that answers with prose instead of JSON all looked identical from the
   * modal, which is why this kept coming back as a production mystery.
   */
  fallbackReason?: string
  /**
   * Set when a real model answered, but not from all the evidence: the call
   * carrying the screenshot ran out of clock and the retry went text-only.
   *
   * Without this the degraded draft is indistinguishable from a full one, and
   * a tester whose defect was only legible in the picture — the error text, the
   * broken layout — trusts a report that never saw it.
   */
  degradedReason?: string
}

const VISION_MODEL_HINTS = ["llava", "vision", "bakllava", "moondream"]

/**
 * How long the tester waits on the configured provider before we give up and
 * draft from the template. Still under the 120s library default — this runs
 * behind a spinner in a modal, and a draft that arrives after two minutes has
 * already lost to typing the bug by hand — but no longer a flat 45s, which was
 * aborting Kimi calls that would have landed at sixty.
 *
 * Tunable per deployment, because the right number is a property of the route
 * to the provider: a key minted on the Moonshot .cn console, reached from a US
 * region, needs materially more room than a local Ollama. Read per call rather
 * than at module scope so a change in the environment does not need a rebuild.
 */
const DEFAULT_DRAFT_TIMEOUT_MS = 90_000

export function draftTimeoutMs(): number {
  const configured = Number(process.env.AI_DRAFT_TIMEOUT_MS)
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_DRAFT_TIMEOUT_MS
}

/**
 * Output ceiling for a draft.
 *
 * Counted in English this looks generous for a title, a paragraph, six steps
 * and two results — which is exactly how a 1500 ceiling got shipped, and how
 * production then started reporting drafts that "replied with something that
 * was not JSON". Two things break that arithmetic:
 *
 *   - Arabic tokenizes several times heavier than English. A real Arabic draft
 *     from this app measured past 1500 tokens on its own.
 *   - A reasoning model (kimi-k2.7, k3) spends tokens thinking before it emits
 *     a character of content. Cut it off mid-thought and `content` comes back
 *     empty — a reply that is not short, but absent.
 *
 * So the ceiling is back to the library default and tunable, and it is a
 * backstop against a runaway reply rather than a budget to economise in. The
 * time a draft costs is bounded by AI_DRAFT_TIMEOUT_MS, which is the honest
 * lever; a truncated reply spends the time AND throws the draft away.
 */
const DEFAULT_DRAFT_MAX_TOKENS = 4000

export function draftMaxTokens(): number {
  const configured = Number(process.env.AI_DRAFT_MAX_TOKENS)
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_DRAFT_MAX_TOKENS
}

/**
 * Did this call die on the clock rather than on an answer?
 *
 * `AbortSignal.timeout` surfaces as a TimeoutError DOMException, the Anthropic
 * SDK raises its own APIConnectionTimeoutError, and axios reports ECONNABORTED
 * — all the same event to us, and the only failure worth a second, lighter try.
 */
function isTimeout(err: any): boolean {
  const name = String(err?.name || "")
  const message = String(err?.message || "")
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    name === "APIConnectionTimeoutError" ||
    /timeout|timed out|aborted|ETIMEDOUT|ECONNABORTED/i.test(message)
  )
}

export function buildPrompt(input: BugDraftInput, hasImage: boolean): string {
  const urlContext = input.appUrl ? `\nApplication under test: ${input.appUrl}` : ""
  // Kept next to the note rather than at the top: the screenshot instruction and
  // the evidence it refers to belong together, or the model reads a page of
  // method between them and treats the image as background.
  const imageNote = hasImage
    ? "\n\nA screenshot of the issue is attached. Read it for the affected screen, the UI state, and any visible error text, and use what you see in the report."
    : ""

  return `You are a senior QA engineer. Draft a bug report from the evidence below.${urlContext}

${BUG_REPORT_CRAFT}

${SEVERITY_PRIORITY_RUBRIC}

${LANGUAGE_RULE}

Tester's note:
"""
${(input.description || "").substring(0, 6000)}
"""${imageNote}

Return ONLY valid JSON (no markdown, no extra text) matching exactly:
{
  "title": "concise, specific title including the affected area and the problem",
  "description": "2-4 sentences: what is broken, where, and the impact on the user. Do not restate the title.",
  "severity": "Low | Medium | High | Critical",
  "priority": "Low | Medium | High | Critical",
  "steps": [
    { "stepNumber": 1, "actionDescription": "clear action a tester performs", "expectedResult": "what should happen at this step" }
  ],
  "expectedResult": "what the system should do overall",
  "actualResult": "what actually happened (the defect)"
}
Every field must be filled with real content. 2 to 6 reproduction steps.
Output valid JSON only.`
}

async function callOllama(
  input: BugDraftInput,
  hasImage: boolean,
  installed: string[],
  ollamaUrl: string
): Promise<string> {
  // Pick a model: a vision model when we have an image and one is installed,
  // otherwise a small/fast TEXT model. Installed names carry a tag (e.g.
  // "llama3.2:latest"), so match by prefix rather than exact equality.
  // The installed list is probed once by the caller and handed down, so a
  // draft costs one /api/tags round trip rather than one per attempt.
  const isVision = (m: string) => VISION_MODEL_HINTS.some((h) => m.toLowerCase().includes(h))
  const configured = process.env.OLLAMA_MODEL || "llama3.2"
  const matchesConfigured = (m: string) => m === configured || m.split(":")[0] === configured

  let model = configured
  if (hasImage) {
    const visionModel = installed.find(isVision)
    if (visionModel) model = visionModel
  } else {
    // Text-only: never use a heavy vision model. Prefer the configured model if
    // installed, else the first installed non-vision (text) model.
    const configuredInstalled = installed.find(matchesConfigured)
    const textModel = installed.find((m) => !isVision(m))
    model = configuredInstalled || textModel || model
  }

  const useImage = hasImage && VISION_MODEL_HINTS.some((h) => model.toLowerCase().includes(h))
  const prompt = buildPrompt(input, useImage)

  // Vision models can be slow to load on the first (cold) call, so allow more time.
  const timeout = 180000

  if (useImage && input.imageBase64) {
    // Multimodal models (llava, llama3.2-vision, …) are most reliably driven through
    // the chat API with the image attached to the message.
    const res = await axios.post(
      `${ollamaUrl}/api/chat`,
      {
        model,
        messages: [{ role: "user", content: prompt, images: [input.imageBase64] }],
        stream: false,
        format: "json",
        options: { temperature: 0.3 },
      },
      { timeout }
    )
    return res.data?.message?.content || ""
  }

  const res = await axios.post(
    `${ollamaUrl}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0.3, num_predict: 800 },
    },
    { timeout }
  )
  return res.data?.response || ""
}

async function callHuggingFace(input: BugDraftInput): Promise<string> {
  const hfToken = process.env.HUGGINGFACE_API_TOKEN
  const model = process.env.HUGGINGFACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.2"
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (hfToken) headers["Authorization"] = `Bearer ${hfToken}`

  const res = await axios.post(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      inputs: buildPrompt(input, false),
      parameters: { temperature: 0.3, max_new_tokens: 2000, return_full_text: false },
    },
    { headers, timeout: 120000 }
  )
  const result = res.data
  if (Array.isArray(result) && result.length > 0) return result[0].generated_text || ""
  if (result?.generated_text) return result.generated_text
  return JSON.stringify(result)
}

const VALID_LEVELS = ["Low", "Medium", "High", "Critical"] as const

function normalize(
  raw: any,
  provider: BugDraft["provider"],
  degradedReason?: string
): BugDraft {
  const level = (v: any): BugDraft["severity"] =>
    VALID_LEVELS.includes(v) ? v : "Medium"

  const steps: BugDraftStep[] = (Array.isArray(raw?.steps) ? raw.steps : [])
    .map((s: any, i: number) => ({
      stepNumber: Number(s?.stepNumber) || i + 1,
      actionDescription: String(s?.actionDescription || s?.action || s?.description || "").substring(0, 500),
      expectedResult: String(s?.expectedResult || s?.expected || "").substring(0, 500),
    }))
    .filter((s: BugDraftStep) => s.actionDescription.length > 0)

  const stepsToReproduce = steps.map((s) => `${s.stepNumber}. ${s.actionDescription}`).join("\n")

  return {
    title: String(raw?.title || "Untitled defect").substring(0, 200),
    description: String(raw?.description || raw?.summary || "").substring(0, 4000),
    severity: level(raw?.severity),
    priority: level(raw?.priority),
    steps,
    stepsToReproduce,
    expectedResult: String(raw?.expectedResult || raw?.expected || "").substring(0, 2000),
    actualResult: String(raw?.actualResult || raw?.actual || "").substring(0, 2000),
    provider,
    ...(degradedReason ? { degradedReason } : {}),
  }
}

/**
 * Close a JSON object that stopped mid-sentence.
 *
 * A reply cut off at the token ceiling is not garbage — it is most of a bug
 * report with its lid missing, and throwing it away costs the tester every
 * field the model did finish. So walk it, shut whatever is still open, and let
 * JSON.parse have the last word on whether the result is usable.
 *
 * Deliberately conservative: it only ever appends closers and drops a dangling
 * key, never invents content.
 */
export function repairTruncatedJson(text: string): string | null {
  const start = text.indexOf("{")
  if (start < 0) return null

  const closers: string[] = []
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") closers.push("}")
    else if (ch === "[") closers.push("]")
    else if (ch === "}" || ch === "]") closers.pop()
  }

  let out = text.slice(start)
  // Cut off inside a string value: end the string before closing anything.
  if (inString) {
    if (escaped) out = out.slice(0, -1) // a lone trailing backslash escapes our own quote
    out += '"'
  }
  out = out.trimEnd()
  // A key whose value never arrived ("severity":) takes the key with it.
  out = out.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, "")
  // A trailing comma is legal in the tester's head and nowhere else.
  out = out.replace(/,\s*$/, "")

  return out + closers.reverse().join("")
}

export interface ParsedDraft {
  data: any | null
  /** The reply was cut short and had to be closed to parse at all. */
  repaired: boolean
}

function parseJson(text: string): ParsedDraft {
  let jsonText = text
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonText = codeBlock[1].trim()
  const objMatch = jsonText.match(/\{[\s\S]*\}/)
  if (objMatch) jsonText = objMatch[0]
  try {
    return { data: JSON.parse(jsonText), repaired: false }
  } catch {
    // Fall through to the salvage attempt.
  }

  const repaired = repairTruncatedJson(text)
  if (repaired) {
    try {
      return { data: JSON.parse(repaired), repaired: true }
    } catch {
      // Not truncation — genuinely not JSON.
    }
  }
  return { data: null, repaired: false }
}

/** Arabic (and Persian/Urdu) script, so the fallback does not answer in English. */
function isArabic(text: string): boolean {
  return /[؀-ۿݐ-ݿ\ufb50-\ufdff\ufe70-\ufeff]/.test(text)
}

/** Deterministic fallback so the feature works with no AI provider at all. */
export function ruleBasedDraft(input: BugDraftInput, fallbackReason?: string): BugDraft {
  const desc = (input.description || "").trim()
  const firstLine = desc.split(/\n|\. |؟/)[0]?.trim() || "Reported defect"
  const title = firstLine.substring(0, 120)

  const lower = desc.toLowerCase()
  let severity: BugDraft["severity"] = "Medium"
  // Keyword sets per language. With English patterns alone every Arabic note
  // scored "Medium", however plainly it described a crash.
  if (/crash|blocker|data loss|cannot|unable|500|broken|not work|توقف|انهيار|لا يعمل|لا يمكن|معطل|فقدان البيانات/.test(lower))
    severity = "High"
  if (/critical|security|payment|corrupt|production down|حرج|خطير|أمن|دفع|تلف|الإنتاج متوقف/.test(lower))
    severity = "Critical"
  if (/typo|cosmetic|minor|alignment|spacing|إملائي|شكلي|بسيط|محاذاة|تنسيق/.test(lower))
    severity = "Low"

  // Turn sentences into rough steps.
  const sentences = desc.split(/\n|\. |؟|،/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  const steps: BugDraftStep[] = (sentences.length > 0 ? sentences : [desc || "Reproduce the issue"]).map(
    (s, i) => ({ stepNumber: i + 1, actionDescription: s.substring(0, 300), expectedResult: "" })
  )

  return {
    title,
    description: desc.substring(0, 4000),
    severity,
    priority: severity,
    steps,
    stepsToReproduce: steps.map((s) => `${s.stepNumber}. ${s.actionDescription}`).join("\n"),
    expectedResult: isArabic(desc)
      ? "يجب أن يكتمل الإجراء المذكور دون خطأ."
      : "The described action should complete without error.",
    actualResult: desc.substring(0, 1000),
    provider: "rule-based",
    fallbackReason: fallbackReason || "no AI provider is configured",
  }
}

export async function generateBugReportDraft(input: BugDraftInput): Promise<BugDraft> {
  const hasImage = !!input.imageBase64

  // Why the tester ended up with a template, in their words. Only read once
  // every provider below has failed. It stays at "not configured" unless a
  // provider was actually resolved, because when nothing is set up the Ollama
  // and HuggingFace failures underneath are expected, not the story.
  let reason = "no AI provider is configured"

  // 1. The workspace's configured provider (Section 11). Without this the draft
  // only ever tried a local Ollama and a HuggingFace token, so a deployed box
  // always landed on the rule-based template no matter what the hub said.
  //
  // Resolved here rather than asked via hasConfiguredProvider(): the same
  // lookup then serves both the decision and the error message, instead of
  // costing a second query and still leaving us unable to name the provider
  // that let the tester down.
  const resolved = await resolveProvider(input.projectId || undefined).catch(() => null)
  if (resolved) {
    reason = `the configured provider (${resolved.provider}) returned no usable draft`

    const ask = (withImage: boolean) =>
      chatWithConfiguredProvider({
        prompt: buildPrompt(input, withImage),
        imageBase64: withImage ? input.imageBase64 || undefined : undefined,
        // Was dropped here, so every screenshot went up labelled image/png.
        // A JPEG or WebP paste is then a 400 from the provider and the whole
        // draft silently degrades to the template.
        imageMediaType: withImage ? input.imageMimeType || undefined : undefined,
        // The prompt has always asked for JSON; this makes the provider enforce
        // it. Without it a chatty model prefaces the object with a sentence and
        // the draft is thrown away for being unparsable.
        json: true,
        maxTokens: draftMaxTokens(),
        command: "generate-bug-report",
        projectId: input.projectId || undefined,
        // A tester is watching a spinner. The 120s default is a batch-job
        // timeout, and spending all of it before falling through to two more
        // stages is how a draft took minutes to come back as a template.
        timeoutMs: draftTimeoutMs(),
      })

    // Ask twice at most, and only when there is a screenshot to drop. The
    // picture is the expensive half of the request — megabytes of base64
    // uploaded before a token is generated — so a call that ran out of clock
    // with it attached is worth one more try without it. A text-only draft
    // that misses what was on screen still beats the template.
    for (let attempt = 0; attempt < (hasImage ? 2 : 1); attempt++) {
      const withImage = hasImage && attempt === 0
      try {
        const out = await ask(withImage)
        const { data, repaired } = parseJson(out)
        if (data) {
          // Both ways a real draft can still be less than the tester asked for.
          // Either is worth saying out loud; neither is worth a template.
          const degraded =
            hasImage && !withImage
              ? "the screenshot timed out, so this was drafted from your note alone"
              : repaired
                ? `${resolved.provider} ran out of room mid-reply, so the last fields may be short`
                : undefined
          return normalize(data, "provider", degraded)
        }
        reason = `${resolved.provider} (${resolved.model}) replied with something that was not JSON`
        console.warn(
          "[generate-bug-report] provider returned unparsable output:",
          out.slice(0, 300)
        )
        // Prose instead of JSON is not something dropping the screenshot fixes.
        break
      } catch (err) {
        const message = (err as any)?.message || "unknown error"
        reason = withImage
          ? `${resolved.provider} failed: ${message}`
          : `${resolved.provider} failed${hasImage ? ", with and without the screenshot" : ""}: ${message}`
        if (withImage && isTimeout(err)) {
          console.warn(
            "[generate-bug-report] provider timed out with the screenshot attached, retrying text-only:",
            message
          )
          continue
        }
        console.warn(
          "[generate-bug-report] configured provider failed, trying Ollama:",
          message
        )
        break
      }
    }
  }

  // 2. Ollama (local, free) — only when the daemon actually answers.
  //
  // /api/tags gives a definitive yes/no in 5s. Without that probe a deployed
  // box, which has no Ollama and never will, still entered a call carrying a
  // 180s timeout on every single draft.
  // The workspace Ollama card's address, else OLLAMA_URL / localhost.
  const savedOllama = await prisma.aiProviderConfig
    .findUnique({ where: { provider: "Ollama" }, select: { baseUrl: true } })
    .catch(() => null)
  const ollama = await probeOllama(savedOllama?.baseUrl, 5000)
  const installed = ollama.models
  if (installed.length > 0) {
    try {
      const out = await callOllama(input, hasImage, installed, ollama.baseUrl)
      const { data, repaired } = parseJson(out)
      if (data) {
        return normalize(
          data,
          "ollama",
          repaired ? "the local model ran out of room mid-reply, so the last fields may be short" : undefined
        )
      }
    } catch (err) {
      console.warn("[generate-bug-report] Ollama unavailable, trying Hugging Face:", (err as any)?.message)
    }
  }

  // 3. Hugging Face — only with a token.
  //
  // The anonymous free tier this was written against is gone, so with no token
  // the stage cannot succeed; all it could still do was spend another 120s
  // finding that out while the tester waited.
  if (process.env.HUGGINGFACE_API_TOKEN) {
    try {
      const out = await callHuggingFace(input)
      const { data, repaired } = parseJson(out)
      if (data) {
        return normalize(
          data,
          "huggingface",
          repaired ? "the model ran out of room mid-reply, so the last fields may be short" : undefined
        )
      }
    } catch (err) {
      console.warn("[generate-bug-report] Hugging Face unavailable, using rule-based draft:", (err as any)?.message)
    }
  }

  // 4. Deterministic fallback — always succeeds.
  return ruleBasedDraft(input, reason)
}
