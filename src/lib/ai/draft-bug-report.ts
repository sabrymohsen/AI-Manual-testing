import { BUG_REPORT_CRAFT, SEVERITY_PRIORITY_RUBRIC } from "@/lib/ai/qa-craft"
import { chatWithConfiguredProvider } from "@/lib/ai/provider-chat"

export interface DraftBugReportInput {
  /** Prefer this project's own AI key when it has one. */
  projectId?: string
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

export async function draftBugReport(
  input: DraftBugReportInput
): Promise<DraftedBugReport> {
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

  const content = await chatWithConfiguredProvider({
    projectId: input.projectId,
    system: systemPrompt,
    prompt: userMessage,
    temperature: 0.3,
    json: true,
    command: "draft-bug-report",
  })

  if (!content) {
    throw new Error("AI returned empty response")
  }

  return JSON.parse(content) as DraftedBugReport
}
