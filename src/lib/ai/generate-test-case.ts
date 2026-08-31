import { chatWithConfiguredProvider } from "@/lib/ai/provider-chat"

export interface GeneratedTestCase {
  title: string
  preconditions: string
  steps: Array<{
    actionDescription: string
    expectedResult: string
    actionType: string
    targetType: string
    targetValue: string
    inputValue: string
  }>
  requiredRole?: string
}

export interface SafeProjectContext {
  name: string
  webAppUrl: string
  description?: string | null
  /** Prefer this project's own AI key when it has one. */
  projectId?: string
}

export async function generateTestCaseFromPrompt(
  prompt: string,
  projectContext: SafeProjectContext
): Promise<GeneratedTestCase> {
  const systemPrompt = `You are a QA test case generator. Generate structured test cases based on user descriptions.
The test case must include: title, preconditions, and steps (each with actionDescription, expectedResult, actionType, targetType, targetValue, inputValue).
Available action types: open_url, click, fill, select, upload_file, wait_for_text, wait_for_url, assert_visible, assert_hidden, assert_text, assert_url, screenshot
Available target types: test_id, role, text, label, placeholder, css, xpath, url, none
Do NOT include passwords, tokens, or sensitive data.
Return ONLY valid JSON matching this structure:
{
  "title": "string",
  "preconditions": "string",
  "requiredRole": "string | undefined",
  "steps": [
    {
      "actionDescription": "string",
      "expectedResult": "string",
      "actionType": "string",
      "targetType": "string",
      "targetValue": "string",
      "inputValue": "string"
    }
  ]
}`

  const userMessage = `Project: ${projectContext.name}
URL: ${projectContext.webAppUrl}
Description: ${projectContext.description || "N/A"}
Test request: ${prompt}`

  const content = await chatWithConfiguredProvider({
    projectId: projectContext.projectId,
    system: systemPrompt,
    prompt: userMessage,
    temperature: 0.3,
    json: true,
    command: "generate-test-case",
  })

  if (!content) {
    throw new Error("AI returned empty response")
  }

  return JSON.parse(content) as GeneratedTestCase
}

export async function explainFailure(
  errorMessage: string,
  logs: string[],
  stepDescription: string,
  projectId?: string
): Promise<string> {
  try {
    return (
      (await chatWithConfiguredProvider({
        projectId,
        system:
          "You are a QA failure analyst. Explain why a test step failed in simple terms. Be concise.",
        prompt: `Step: ${stepDescription}\nError: ${errorMessage}\nLogs: ${logs.join("\n")}`,
        temperature: 0.3,
        command: "explain-failure",
      })) || "No explanation available"
    )
  } catch {
    // Same contract as before: an unavailable provider is reported in the
    // returned text, never thrown at the caller.
    return "Unable to analyze failure (AI unavailable)"
  }
}
