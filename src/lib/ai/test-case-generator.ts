import axios from "axios";
import {
  chatWithConfiguredProvider,
  hasConfiguredProvider,
  hasLocalAi,
} from "@/lib/ai/provider-chat";
import { withQaSkills } from "@/lib/ai/qa-skills";
import { sanitizeJsonControlChars } from "@/lib/json-sanitize";
import { TEST_DESIGN_CRAFT, LANGUAGE_RULE } from "@/lib/ai/qa-craft";

export interface AIGeneratedTestCase {
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  preconditions?: string;
  steps: AIGeneratedStep[];
  tags: string[];
}

export interface AIGeneratedStep {
  stepNumber: number;
  actionDescription: string;
  expectedResult: string;
  actionType?: string;
  targetType?: string;
  targetValue?: string;
  inputValue?: string;
}

export interface GenerateOptions {
  /** Use this project's own AI provider config when it has one. */
  projectId?: string;
  provider?: "ollama" | "huggingface";
  model?: string;
  temperature?: number;
  maxTokens?: number;
  language?: "en" | "ar";
  testCaseCount?: number;
  includeNegativeCases?: boolean;
  includeEdgeCases?: boolean;
  includeExploratory?: boolean;
  /** Whose request: lets it run on that user's own Ollama (desktop app) from a background job. */
  userId?: string;
  /** How long the AI may take (a local model can need minutes). */
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: GenerateOptions = {
  provider: "ollama",
  model: "llama3.2",
  temperature: 0.3,
  maxTokens: 4000,
  language: "en",
  testCaseCount: 10,
  includeNegativeCases: true,
  includeEdgeCases: true,
  includeExploratory: false,
};

/**
 * Generate test cases from requirements text using AI
 * Primary: Ollama (local, free)
 * Fallback: Hugging Face Inference API (free cloud)
 */
export async function generateTestCasesFromRequirements(
  requirements: string,
  projectUrl?: string,
  options: GenerateOptions = {}
): Promise<AIGeneratedTestCase[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const prompt = buildPrompt(requirements, projectUrl, opts);

  let response: string;
  // The configured provider's failure is the one worth telling the user; the
  // legacy fallbacks below usually aren't set up on a deployed server.
  let primaryError: string | null = null;

  // The workspace's configured provider (Section 11) comes first. Without this
  // the generator only ever tried a local Ollama and a HuggingFace token, so on
  // a deployed box it always ended up on the offline path regardless of what
  // was configured in the hub.
  try {
    if ((await hasConfiguredProvider(opts.projectId)) || (await hasLocalAi(opts.userId))) {
      const out = await chatWithConfiguredProvider({
        prompt,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        command: "generate-test-cases",
        projectId: opts.projectId,
        userId: opts.userId,
        timeoutMs: opts.timeoutMs,
      });
      if (out) return parseTestCasesFromResponse(out, opts);
    }
  } catch (error) {
    primaryError = (error as any)?.message || String(error);
    console.warn("[test-case-generator] configured provider failed, falling back:", primaryError);
  }

  try {
    if (opts.provider === "ollama") {
      response = await callOllama(prompt, opts);
    } else {
      response = await callHuggingFace(prompt, opts);
    }
  } catch (error) {
    console.warn(`Primary provider ${opts.provider} failed, trying fallback:`, error);
    // Try fallback
    try {
      if (opts.provider === "ollama") {
        response = await callHuggingFace(prompt, opts);
      } else {
        response = await callOllama(prompt, opts);
      }
    } catch (fallbackError) {
      throw new Error(primaryError || (fallbackError as any)?.message || "No AI provider could generate test cases");
    }
  }

  return parseTestCasesFromResponse(response, opts);
}

/**
 * Build the prompt for test case generation
 */
function buildPrompt(
  requirements: string,
  projectUrl?: string,
  opts: GenerateOptions = {}
): string {
  const isArabic = opts.language === "ar";
  const urlContext = projectUrl ? `\nTarget Application URL: ${projectUrl}` : "";

  const testTypes = [
    "positive/functional tests",
    opts.includeNegativeCases ? "negative/validation tests" : null,
    opts.includeEdgeCases ? "edge case tests" : null,
    opts.includeExploratory ? "exploratory/ad-hoc tests" : null,
  ].filter(Boolean);

  if (isArabic) {
    return `أنت مهندس ضمان جودة خبير. بناءً على المتطلبات التالية، قم بإنشاء حالات اختبار مفصلة ومنظمة باللغة العربية.
${urlContext}

${TEST_DESIGN_CRAFT}

المتطلبات:
"""
${requirements.substring(0, 15000)}
"""

التعليمات:
- أنشئ حوالي ${opts.testCaseCount} حالات اختبار شاملة
- تشمل: ${testTypes.join(", ")}
- لكل حالة اختبار: عنوان، وصف، أولوية (Low/Medium/High/Critical)، شروط مسبقة، وخطوات
- لكل خطوة: رقم، إجراء (وصف دقيق)، نتيجة متوقعة
- يجب أن تكون الخطوات قابلة للتنفيذ آلياً باستخدام Playwright
- استخدم محددات CSS واضحة عند الإشارة إلى عناصر UI
- اجعل النتائج المتوقعة قابلة للتحقق (قابلة للقياس)
- أضف وسوم (tags) مناسبة لكل حالة اختبار
- اكتب المحتوى بالعربية، مع إبقاء مفاتيح JSON وقيم الأولوية (Low/Medium/High/Critical) بالإنجليزية كما هي

صيغة الإخراج (JSON فقط):
[
  {
    "title": "",
    "description": "",
    "priority": "Medium",
    "preconditions": "",
    "steps": [
      {
        "stepNumber": 1,
        "actionDescription": "",
        "expectedResult": "",
        "actionType": "custom_instruction",
        "targetType": "none",
        "targetValue": "",
        "inputValue": ""
      }
    ],
    "tags": ["functional"]
  }
]

أخرج JSON صالح فقط. لا تضف أي نص إضافي.`;
  }

  return `You are a senior QA engineer. Based on the following requirements, generate detailed, structured test cases.
${urlContext}

${TEST_DESIGN_CRAFT}

Requirements:
"""
${requirements.substring(0, 15000)}
"""

Instructions:
- Generate approximately ${opts.testCaseCount} comprehensive test cases
- Include: ${testTypes.join(", ")}
- For each test case: title, description, priority (Low/Medium/High/Critical), preconditions, and steps
- For each step: step number, action (precise description), expected result
- Steps should be automatable using Playwright
- Use clear CSS selectors when referring to UI elements
- Expected results should be verifiable (measurable/checkable)
- Add appropriate tags to each test case
- Consider the target application URL for realistic locators
- ${LANGUAGE_RULE}

Output format (JSON only):
[
  {
    "title": "",
    "description": "",
    "priority": "Medium",
    "preconditions": "",
    "steps": [
      {
        "stepNumber": 1,
        "actionDescription": "",
        "expectedResult": "",
        "actionType": "custom_instruction",
        "targetType": "none",
        "targetValue": "",
        "inputValue": ""
      }
    ],
    "tags": ["functional"]
  }
]

Output valid JSON only. Do not add any extra text.`;
}

/**
 * Call Ollama local API (completely free, runs locally)
 */
async function callOllama(prompt: string, opts: GenerateOptions): Promise<string> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const model = opts.model || "llama3.2";

  const response = await axios.post(
    `${ollamaUrl}/api/generate`,
    {
      model,
      prompt,
      // Same QA skills as every other AI call (qa-skills.ts).
      system: withQaSkills(undefined, "generate-test-cases"),
      stream: false,
      options: {
        temperature: opts.temperature ?? 0.3,
        num_predict: opts.maxTokens ?? 4000,
      },
    },
    {
      timeout: 120000, // 2 minutes
    }
  );

  return response.data?.response || "";
}

/**
 * Call Hugging Face Inference API (free tier, rate-limited)
 * Fallback when Ollama is not available
 */
async function callHuggingFace(prompt: string, opts: GenerateOptions): Promise<string> {
  const hfToken = process.env.HUGGINGFACE_API_TOKEN;
  const model = opts.model || "mistralai/Mistral-7B-Instruct-v0.2";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (hfToken) {
    headers["Authorization"] = `Bearer ${hfToken}`;
  }

  const response = await axios.post(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      inputs: prompt,
      parameters: {
        temperature: opts.temperature ?? 0.3,
        max_new_tokens: opts.maxTokens ?? 4000,
        return_full_text: false,
      },
    },
    {
      headers,
      timeout: 120000,
    }
  );

  // Hugging Face returns array of generated texts
  const result = response.data;
  if (Array.isArray(result) && result.length > 0) {
    return result[0].generated_text || "";
  }
  if (result.generated_text) {
    return result.generated_text;
  }
  return JSON.stringify(result);
}

/**
 * Parse AI response into structured test cases
 */
function parseTestCasesFromResponse(
  response: string,
  opts: GenerateOptions = {}
): AIGeneratedTestCase[] {
  // Extract JSON from response (handle markdown code blocks)
  let jsonText = response;

  // Remove markdown code blocks
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim();
  }

  // Find JSON array
  const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    jsonText = arrayMatch[0];
  }

  try {
    // Models often put real line breaks inside string values; escape them first.
    const parsed = JSON.parse(sanitizeJsonControlChars(jsonText));

    if (!Array.isArray(parsed)) {
      console.warn("AI response is not an array, wrapping in array");
      return [normalizeTestCase(parsed, opts)];
    }

    return parsed
      .map((tc: any) => normalizeTestCase(tc, opts))
      .filter((tc: AIGeneratedTestCase) => tc.title && tc.steps.length > 0);
  } catch (error) {
    console.error("Failed to parse AI response as JSON:", error);
    console.error("Response snippet:", response.substring(0, 500));
    return [];
  }
}

function normalizeTestCase(
  raw: any,
  opts: GenerateOptions = {}
): AIGeneratedTestCase {
  const validPriority = (["Low", "Medium", "High", "Critical"] as const).includes(
    raw?.priority
  )
    ? raw.priority
    : "Medium";

  const steps: AIGeneratedStep[] = (raw?.steps || [])
    .map((step: any, idx: number) => ({
      stepNumber: step?.stepNumber || idx + 1,
      actionDescription: (step?.actionDescription || step?.action || step?.description || "")
        .toString()
        .substring(0, 500),
      expectedResult: (step?.expectedResult || step?.expected || "")
        .toString()
        .substring(0, 500),
      actionType: (step?.actionType || "custom_instruction").toString(),
      targetType: (step?.targetType || "none").toString(),
      targetValue: (step?.targetValue || "").toString().substring(0, 200),
      inputValue: (step?.inputValue || "").toString().substring(0, 200),
    }))
    .filter((step: AIGeneratedStep) => step.actionDescription.length > 0);

  return {
    title: (raw?.title || raw?.name || "Untitled Test Case")
      .toString()
      .substring(0, 200),
    description: (raw?.description || raw?.summary || "")
      .toString()
      .substring(0, 1000),
    priority: validPriority,
    preconditions: (raw?.preconditions || raw?.precondition || "")
      .toString()
      .substring(0, 500),
    steps: steps.length > 0 ? steps : generateDefaultSteps(raw?.title || ""),
    tags: Array.isArray(raw?.tags)
      ? raw.tags.map((t: any) => String(t)).filter((t: string) => t.length > 0)
      : ["functional"],
  };
}

function generateDefaultSteps(title: string): AIGeneratedStep[] {
  return [
    {
      stepNumber: 1,
      actionDescription: `Navigate to the application page for: ${title}`,
      expectedResult: "Page loads successfully with no errors",
      actionType: "custom_instruction",
      targetType: "none",
      targetValue: "",
      inputValue: "",
    },
  ];
}

/**
 * Check if Ollama is available
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    await axios.get(`${ollamaUrl}/api/tags`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get available Ollama models
 */
export async function getOllamaModels(): Promise<string[]> {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    const response = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 5000 });
    return (response.data?.models || []).map((m: any) => m.name || m.model);
  } catch {
    return [];
  }
}

/**
 * Check if Hugging Face API is available (has token or public endpoint works)
 */
export async function isHuggingFaceAvailable(): Promise<boolean> {
  try {
    await axios.get("https://api-inference.huggingface.co/status", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
