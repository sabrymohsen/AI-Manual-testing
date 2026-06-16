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
}

function getClient() {
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1"
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY

  if (!apiKey) {
    throw new Error("AI provider not configured. Set OPENAI_COMPATIBLE_API_KEY in settings.")
  }

  return { baseUrl, apiKey }
}

export async function generateTestCaseFromPrompt(
  prompt: string,
  projectContext: SafeProjectContext
): Promise<GeneratedTestCase> {
  const { baseUrl, apiKey } = getClient()

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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  })

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error("AI returned empty response")
  }

  return JSON.parse(content) as GeneratedTestCase
}

export async function explainFailure(
  errorMessage: string,
  logs: string[],
  stepDescription: string
): Promise<string> {
  const { baseUrl, apiKey } = getClient()

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a QA failure analyst. Explain why a test step failed in simple terms. Be concise.",
        },
        {
          role: "user",
          content: `Step: ${stepDescription}\nError: ${errorMessage}\nLogs: ${logs.join("\n")}`,
        },
      ],
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    return "Unable to analyze failure (AI unavailable)"
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || "No explanation available"
}
