import axios from "axios"
import { getOllamaModels } from "@/lib/ai/test-case-generator"
import {
  chatWithConfiguredProvider,
  hasConfiguredProvider,
} from "@/lib/ai/provider-chat"

/**
 * Free, self-hostable bug-report drafter.
 *
 * Mirrors the test-case generator's provider strategy so it costs nothing:
 *   Primary : Ollama (local, free) — uses a vision model for the screenshot when one
 *             is installed (llava / llama3.2-vision / bakllava / moondream).
 *   Fallback: Hugging Face Inference API (free tier, text-only).
 *   Last     : a deterministic rule-based draft, so the feature always returns
 *             something even with no AI provider available.
 *
 * It only DRAFTS a bug — the caller (UI) lets the user edit everything before saving.
 */

export interface BugDraftInput {
  description: string
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
  severity: "Low" | "Medium" | "High" | "Critical"
  priority: "Low" | "Medium" | "High" | "Critical"
  steps: BugDraftStep[]
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
  provider: "provider" | "ollama" | "huggingface" | "rule-based"
}

const VISION_MODEL_HINTS = ["llava", "vision", "bakllava", "moondream"]

function buildPrompt(input: BugDraftInput, hasImage: boolean): string {
  const urlContext = input.appUrl ? `\nApplication URL: ${input.appUrl}` : ""
  const imageNote = hasImage
    ? "\nAn attached screenshot of the issue is provided — use it to infer the affected screen, UI elements, and the visible problem."
    : ""

  return `You are a senior QA engineer. Draft a professional, structured bug report from the tester's note${hasImage ? " and screenshot" : ""}.${urlContext}${imageNote}

Tester's note:
"""
${(input.description || "").substring(0, 6000)}
"""

Return ONLY valid JSON (no markdown, no extra text) matching exactly:
{
  "title": "concise, specific title including the affected area and the problem",
  "severity": "Low | Medium | High | Critical",
  "priority": "Low | Medium | High | Critical",
  "steps": [
    { "stepNumber": 1, "actionDescription": "clear action a tester performs", "expectedResult": "what should happen at this step" }
  ],
  "expectedResult": "what the system should do overall",
  "actualResult": "what actually happened (the defect)"
}
Rules:
- 2 to 6 reproduction steps, ordered and specific.
- Choose severity/priority sensibly from the impact described.
- Output valid JSON only.`
}

async function callOllama(input: BugDraftInput, hasImage: boolean): Promise<string> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434"

  // Pick a model: a vision model when we have an image and one is installed,
  // otherwise a small/fast TEXT model. Installed names carry a tag (e.g.
  // "llama3.2:latest"), so match by prefix rather than exact equality.
  const installed = await getOllamaModels()
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

function normalize(raw: any, provider: BugDraft["provider"]): BugDraft {
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
    severity: level(raw?.severity),
    priority: level(raw?.priority),
    steps,
    stepsToReproduce,
    expectedResult: String(raw?.expectedResult || raw?.expected || "").substring(0, 2000),
    actualResult: String(raw?.actualResult || raw?.actual || "").substring(0, 2000),
    provider,
  }
}

function parseJson(text: string): any | null {
  let jsonText = text
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonText = codeBlock[1].trim()
  const objMatch = jsonText.match(/\{[\s\S]*\}/)
  if (objMatch) jsonText = objMatch[0]
  try {
    return JSON.parse(jsonText)
  } catch {
    return null
  }
}

/** Deterministic fallback so the feature works with no AI provider at all. */
function ruleBasedDraft(input: BugDraftInput): BugDraft {
  const desc = (input.description || "").trim()
  const firstLine = desc.split(/\n|\. /)[0]?.trim() || "Reported defect"
  const title = firstLine.substring(0, 120)

  const lower = desc.toLowerCase()
  let severity: BugDraft["severity"] = "Medium"
  if (/crash|blocker|data loss|cannot|unable|500|broken|not work/.test(lower)) severity = "High"
  if (/critical|security|payment|corrupt|production down/.test(lower)) severity = "Critical"
  if (/typo|cosmetic|minor|alignment|spacing/.test(lower)) severity = "Low"

  // Turn sentences into rough steps.
  const sentences = desc.split(/\n|\. /).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  const steps: BugDraftStep[] = (sentences.length > 0 ? sentences : [desc || "Reproduce the issue"]).map(
    (s, i) => ({ stepNumber: i + 1, actionDescription: s.substring(0, 300), expectedResult: "" })
  )

  return {
    title,
    severity,
    priority: severity,
    steps,
    stepsToReproduce: steps.map((s) => `${s.stepNumber}. ${s.actionDescription}`).join("\n"),
    expectedResult: "The described action should complete without error.",
    actualResult: desc.substring(0, 1000),
    provider: "rule-based",
  }
}

export async function generateBugReportDraft(input: BugDraftInput): Promise<BugDraft> {
  const hasImage = !!input.imageBase64

  // 1. The workspace's configured provider (Section 11). Without this the draft
  // only ever tried a local Ollama and a HuggingFace token, so a deployed box
  // always landed on the rule-based template no matter what the hub said.
  try {
    if (await hasConfiguredProvider()) {
      const out = await chatWithConfiguredProvider({
        prompt: buildPrompt(input, hasImage),
        imageBase64: input.imageBase64 || undefined,
        command: "generate-bug-report",
      })
      const parsed = parseJson(out)
      if (parsed) return normalize(parsed, "provider")
    }
  } catch (err) {
    console.warn(
      "[generate-bug-report] configured provider failed, trying Ollama:",
      (err as any)?.message
    )
  }

  // 2. Ollama (local, free)
  try {
    const out = await callOllama(input, hasImage)
    const parsed = parseJson(out)
    if (parsed) return normalize(parsed, "ollama")
  } catch (err) {
    console.warn("[generate-bug-report] Ollama unavailable, trying Hugging Face:", (err as any)?.message)
  }

  // 3. Hugging Face (free tier, text only)
  try {
    const out = await callHuggingFace(input)
    const parsed = parseJson(out)
    if (parsed) return normalize(parsed, "huggingface")
  } catch (err) {
    console.warn("[generate-bug-report] Hugging Face unavailable, using rule-based draft:", (err as any)?.message)
  }

  // 4. Deterministic fallback — always succeeds.
  return ruleBasedDraft(input)
}
