import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"

function sanitizeInputText(text: string): string {
  if (!text) return ""
  return text
    .replace(/(bearer\s+|auth\s+|token\s+|key\s+)[a-zA-Z0-9_\-\.\~]+/gi, "$1[REDACTED]")
    .replace(/("password"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2")
    .replace(/("token"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2")
    .replace(/("cookie"\s*:\s*")[^"]+(")/gi, "$1[REDACTED]$2")
    .replace(/(cookie:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(authorization:\s*)[^\r\n]+/gi, "$1[REDACTED]")
}

function getClient() {
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1"
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY

  if (!apiKey) {
    throw new Error("AI provider not configured.")
  }

  return { baseUrl, apiKey }
}

const bodySchema = z.object({
  action: z.string().min(1, "Action is required"),
  title: z.string().optional(),
  stepsToReproduce: z.string().optional(),
  expectedResult: z.string().optional(),
  actualResult: z.string().optional(),
  consoleLogs: z.string().optional(),
  networkErrors: z.string().optional(),
})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const rawBody = await request.json()
    const parseResult = bodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
    }
    const body = rawBody
    const {
      action,
      title,
      stepsToReproduce,
      expectedResult,
      actualResult,
      consoleLogs,
      networkErrors
    } = body

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 })
    }

    // Sanitize logs
    const cleanLogs = sanitizeInputText(consoleLogs || "")
    const cleanNetwork = sanitizeInputText(networkErrors || "")
    const cleanSteps = sanitizeInputText(stepsToReproduce || "")
    const cleanActual = sanitizeInputText(actualResult || "")
    const cleanExpected = sanitizeInputText(expectedResult || "")

    let apiKey = ""
    let baseUrl = ""
    let hasApiKey = false

    try {
      const client = getClient()
      apiKey = client.apiKey
      baseUrl = client.baseUrl
      hasApiKey = true
    } catch (e) {
      // Local fallback heuristics if API key is not configured
      let output = ""

      if (action === "suggest-title") {
        const words = cleanActual.split(/\s+/).slice(0, 5).join(" ")
        output = `Bug: Unexpected behavior - ${words || "Error in action flow"}`
      } else if (action === "rewrite-steps") {
        const lines = cleanSteps
          .split(/\n/)
          .map(l => l.trim())
          .filter(Boolean)
        output = lines.length > 0
          ? lines.map((l, i) => `${i + 1}. ${l}`).join("\n")
          : "1. Navigate to target URL\n2. Replicate actions leading to unexpected result\n3. Verify actual outcome matches logs"
      } else if (action === "suggest-severity") {
        const fullText = (cleanActual + cleanLogs + cleanNetwork).toLowerCase()
        if (fullText.includes("crash") || fullText.includes("500") || fullText.includes("exception") || fullText.includes("critical")) {
          output = "Critical"
        } else if (fullText.includes("failed") || fullText.includes("error") || fullText.includes("network")) {
          output = "High"
        } else {
          output = "Medium"
        }
      } else if (action === "summarize-logs") {
        const errorLines = cleanLogs
          .split(/\n/)
          .filter(l => l.toLowerCase().includes("error") || l.toLowerCase().includes("failed") || l.toLowerCase().includes("exception"))
          .slice(0, 5)
        output = errorLines.length > 0
          ? `Console logs summary:\n${errorLines.map(l => `- ${l}`).join("\n")}`
          : "Logs analyzed: No severe uncaught script exceptions or resource failures detected in the provided log subset."
      } else if (action === "developer-summary") {
        output = `### Developer Triage Summary\n- **Issue**: ${title || "Bug report"}\n- **Expected**: ${cleanExpected || "N/A"}\n- **Actual**: ${cleanActual || "N/A"}\n- **Console Errors**: ${cleanLogs.substring(0, 150) || "None"}\n- **Network Failures**: ${cleanNetwork.substring(0, 150) || "None"}`
      }

      return NextResponse.json({ suggestion: output })
    }

    // AI API Call
    let systemPrompt = ""
    let userMessage = ""

    if (action === "suggest-title") {
      systemPrompt = "You are a professional QA triage engineer. Generate a concise, clear, professional developer bug title (maximum 10 words) based on the steps, expected result, actual result, and console logs provided. Return ONLY the plain text title, nothing else."
      userMessage = `Steps: ${cleanSteps}\nExpected: ${cleanExpected}\nActual: ${cleanActual}\nLogs: ${cleanLogs}`
    } else if (action === "rewrite-steps") {
      systemPrompt = "You are a senior developer. Rewrite the user's steps to reproduce into a clean, professional, numbered step checklist (e.g. 1. Go to page X, 2. Enter username Z, 3. Observe Y). Return ONLY the rewritten text, nothing else."
      userMessage = `Raw Steps:\n${cleanSteps}`
    } else if (action === "suggest-severity") {
      systemPrompt = "Analyze the bug description, actual result, and error logs. Suggest a severity level: Low, Medium, High, or Critical. Return ONLY one of these four words, nothing else."
      userMessage = `Actual Result: ${cleanActual}\nConsole logs: ${cleanLogs}\nNetwork Errors: ${cleanNetwork}`
    } else if (action === "summarize-logs") {
      systemPrompt = "Analyze the provided browser console logs and network errors. Summarize the root cause or key exceptions in a bulleted list of 2-3 points. Keep it highly technical. Return ONLY the summary, no intro/outro."
      userMessage = `Console logs: ${cleanLogs}\nNetwork errors: ${cleanNetwork}`
    } else if (action === "developer-summary") {
      systemPrompt = "Generate a developer triage report in Markdown. Include Severity, Priority, Steps outline, Root cause summary from logs, and reproduction file pointers if any. Keep it compact and professional."
      userMessage = `Title: ${title}\nExpected: ${cleanExpected}\nActual: ${cleanActual}\nConsole logs: ${cleanLogs}\nNetwork: ${cleanNetwork}`
    }

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
        temperature: 0.2
      }),
    })

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`)
    }

    const data = await response.json()
    const suggestion = data.choices?.[0]?.message?.content || "No suggestion generated."

    return NextResponse.json({ suggestion })
  } catch (error: any) {
    console.error("AI Bug Assistance error:", error)
    return NextResponse.json({ error: error.message || "AI triage service unavailable" }, { status: 500 })
  }
}
