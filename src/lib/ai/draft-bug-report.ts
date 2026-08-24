import { BUG_REPORT_CRAFT, SEVERITY_PRIORITY_RUBRIC } from "@/lib/ai/qa-craft"

export interface DraftBugReportInput {
  title: string
  actionDescription: string
  expectedResult: string
  actualResult: string
  errorDetails?: string | null
  logs?: string[]
}

export interface DraftedBugReport {
  title: string
  severity: "Low" | "Medium" | "High" | "Critical"
  priority: "Low" | "Medium" | "High" | "Critical"
  stepsToReproduce: string
  expectedResult: string
  actualResult: string
}

function getClient() {
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1"
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY

  if (!apiKey) {
    throw new Error("AI provider not configured. Set OPENAI_COMPATIBLE_API_KEY in settings.")
  }

  return { baseUrl, apiKey }
}

export async function draftBugReport(
  input: DraftBugReportInput
): Promise<DraftedBugReport> {
  const { baseUrl, apiKey } = getClient()

  const systemPrompt = `You are a senior QA engineer drafting a bug report from a failed automated test step.
Analyze the provided step details, error details, and execution logs.

${BUG_REPORT_CRAFT}

${SEVERITY_PRIORITY_RUBRIC}

The failure came from automation, so the reproduction steps must be the manual
steps a person would follow to see the same thing — not a restatement of the
automation log. An assertion message is evidence for the actual result, not the
actual result itself.

Return ONLY valid JSON matching this structure:
{
  "title": "string (concise and descriptive, including component and issue)",
  "severity": "Low | Medium | High | Critical",
  "priority": "Low | Medium | High | Critical",
  "stepsToReproduce": "string (formatted list of steps to reproduce the issue)",
  "expectedResult": "string (what should have happened)",
  "actualResult": "string (what actually happened, with error details)"
}`

  const userMessage = `Failed Step Details:
- Title/Action: ${input.actionDescription}
- Expected: ${input.expectedResult}
- Actual: ${input.actualResult}
- Error: ${input.errorDetails || "None"}
- Logs: ${(input.logs || []).join("\n")}`

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

  return JSON.parse(content) as DraftedBugReport
}
