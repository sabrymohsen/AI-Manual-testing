import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

function getClient() {
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1"
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY

  if (!apiKey) {
    throw new Error("AI provider not configured. Set OPENAI_COMPATIBLE_API_KEY in settings.")
  }

  return { baseUrl, apiKey }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { actionDescription, testCaseTitle } = body

    if (!actionDescription) {
      return NextResponse.json({ error: "actionDescription is required" }, { status: 400 })
    }

    const { baseUrl, apiKey } = getClient()

    const systemPrompt = `You are a professional QA test assistant.
Suggest a clear, concise, and standard QA expected result for a given manual test step action description.
Return ONLY a plain text containing the suggested expected result (max 2 sentences).`

    const userMessage = `Action Description: ${actionDescription}
Test Case Title context: ${testCaseTitle || "General"}`

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
      }),
    })

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const suggestion = data.choices?.[0]?.message?.content?.trim() || "Observed output meets specifications."

    return NextResponse.json({ suggestion })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to suggest expected result" }, { status: 500 })
  }
}
