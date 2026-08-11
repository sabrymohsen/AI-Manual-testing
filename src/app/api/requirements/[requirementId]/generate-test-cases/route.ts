import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { chatWithConfiguredProvider } from "@/lib/ai/provider-chat"

export async function POST(
  request: Request,
  { params }: { params: { requirementId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.requirementId },
      include: {
        project: { select: { id: true, userId: true } },
        epic: { select: { epicKey: true, title: true } },
        feature: { select: { featureKey: true, name: true } }
      }
    })

    if (!requirement) {
      return notFoundResponse("Requirement not found")
    }

    if (requirement.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    const systemPrompt = `You are an expert QA tester. Analyze the requirement parameters and generate a list of positive, negative, boundary, validation, and security test cases.
Generate at least 3-5 distinct test cases covering different scenarios.
Return ONLY valid JSON matching this exact structure:
{
  "testCases": [
    {
      "title": "Clear concise test case title",
      "preconditions": "Any precondition setup context",
      "priority": "Medium", // Low, Medium, High, Critical
      "steps": [
        {
          "actionDescription": "Action step description",
          "expectedResult": "Expected step outcome",
          "actionType": "custom_instruction", // click, fill, open_url, assert_visible, custom_instruction, select, upload_file, wait_for_text, wait_for_url, assert_hidden, assert_text, assert_url, screenshot
          "targetType": "none", // test_id, role, text, label, placeholder, css, xpath, url, none
          "targetValue": "",
          "inputValue": ""
        }
      ]
    }
  ]
}`

    const userMessage = `Requirement Key: ${requirement.requirementKey}
Title: ${requirement.title}
Description: ${requirement.description || "N/A"}
Acceptance Criteria: ${requirement.acceptanceCriteria || "N/A"}
Priority: ${requirement.priority}
Epic: ${requirement.epic ? `${requirement.epic.epicKey} ${requirement.epic.title}` : "N/A"}
Feature: ${requirement.feature ? `${requirement.feature.featureKey} ${requirement.feature.name}` : "N/A"}`

    // Goes through the shared provider layer: the requirement's own project
    // config first, then the workspace provider, then a key from the
    // environment. This route used to read OPENAI_COMPATIBLE_API_KEY directly
    // and hardcode gpt-4o, so it ignored whatever the hub had configured.
    let content: string
    try {
      content = await chatWithConfiguredProvider({
        system: systemPrompt,
        prompt: userMessage,
        temperature: 0.5,
        command: "generate-test-cases-from-requirement",
        projectId: requirement.project.id,
      })
    } catch (err: any) {
      return NextResponse.json(
        {
          error:
            err?.message === "No AI provider is configured"
              ? "No AI provider is configured. Add one in the project's AI Provider tab."
              : err?.message || "AI request failed",
        },
        { status: 500 }
      )
    }

    if (!content) {
      return NextResponse.json({ error: "AI returned empty response" }, { status: 500 })
    }

    // Models wrap JSON in prose or a code fence often enough to be worth handling.
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonText = (fenced ? fenced[1] : content).match(/\{[\s\S]*\}/)?.[0] || content
    const parsedResult = JSON.parse(jsonText)
    return NextResponse.json(parsedResult)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to generate test cases via AI" },
      { status: 500 }
    )
  }
}
