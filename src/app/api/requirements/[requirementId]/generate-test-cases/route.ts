import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"

export async function POST(
  request: Request,
  { params }: { params: { requirementId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1"
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: "AI provider not configured. Set OPENAI_COMPATIBLE_API_KEY in settings." },
      { status: 500 }
    )
  }

  try {
    const requirement = await prisma.requirement.findUnique({
      where: { id: params.requirementId },
      include: {
        project: true,
        module: true,
        feature: true,
        component: true
      }
    })

    if (!requirement) {
      return NextResponse.json({ error: "Requirement not found" }, { status: 404 })
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
Module: ${requirement.module?.name || "N/A"}
Feature: ${requirement.feature?.name || "N/A"}
Component: ${requirement.component?.name || "N/A"}`

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.5,
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `AI API returned status ${response.status}: ${response.statusText}` },
        { status: 500 }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: "AI returned empty response" }, { status: 500 })
    }

    const parsedResult = JSON.parse(content)
    return NextResponse.json(parsedResult)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to generate test cases via AI" },
      { status: 500 }
    )
  }
}
