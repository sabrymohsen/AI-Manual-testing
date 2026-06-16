import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/db"

function getClient() {
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1"
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY

  if (!apiKey) {
    throw new Error("AI provider not configured. Set OPENAI_COMPATIBLE_API_KEY in settings.")
  }

  return { baseUrl, apiKey }
}

function localJaccardSimilarity(str1: string, str2: string): number {
  const getTokens = (s: string) => {
    return new Set(
      s.toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(t => t.length > 2)
    )
  }

  const tokens1 = getTokens(str1)
  const tokens2 = getTokens(str2)

  if (tokens1.size === 0 && tokens2.size === 0) return 100
  if (tokens1.size === 0 || tokens2.size === 0) return 0

  let intersectionCount = 0
  Array.from(tokens1).forEach(t => {
    if (tokens2.has(t)) {
      intersectionCount++
    }
  })

  const unionSize = tokens1.size + tokens2.size - intersectionCount
  return Math.round((intersectionCount / unionSize) * 100)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { projectId, title, steps } = body

    if (!projectId || !title) {
      return NextResponse.json({ error: "projectId and title are required" }, { status: 400 })
    }

    const existing = await prisma.testCase.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true
      }
    })

    if (existing.length === 0) {
      return NextResponse.json({ similarCaseFound: false })
    }

    let apiKey = ""
    let baseUrl = ""
    let hasApiKey = false

    try {
      const client = getClient()
      apiKey = client.apiKey
      baseUrl = client.baseUrl
      hasApiKey = true
    } catch (e) {
      // Local fallback
      let highestSimilarity = 0
      let similarCase: { id: string; title: string } | null = null

      for (const e of existing) {
        const sim = localJaccardSimilarity(title, e.title)
        if (sim > highestSimilarity) {
          highestSimilarity = sim
          similarCase = e
        }
      }

      if (highestSimilarity >= 75 && similarCase) {
        return NextResponse.json({
          similarCaseFound: true,
          title: similarCase.title,
          similarityPercent: highestSimilarity,
          existingCaseId: similarCase.id
        })
      }

      return NextResponse.json({ similarCaseFound: false })
    }

    const systemPrompt = `You are a professional QA duplicate detector. Given a new test case title (and optional steps) and a list of existing test case titles (with IDs) in a project, detect if there is any existing case that is a duplicate or highly similar (e.g. same intent, only slightly different title, or covers the exact same flow).
Return ONLY a valid JSON object matching this structure:
{
  "similarCaseFound": boolean,
  "title": "string (title of similar case found, or empty if none)",
  "similarityPercent": number (from 0 to 100, or 0 if none),
  "existingCaseId": "string (ID of similar case, or empty if none)"
}`

    const userMessage = `New Case Title: ${title}
New Steps: ${JSON.stringify(steps || [])}

Existing cases in project:
${existing.map(e => `- ID: ${e.id} | Title: ${e.title}`).join("\n")}`

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
        temperature: 0.2,
        response_format: { type: "json_object" }
      }),
    })

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json({ similarCaseFound: false })
    }

    const result = JSON.parse(content)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to detect duplicate" }, { status: 500 })
  }
}
