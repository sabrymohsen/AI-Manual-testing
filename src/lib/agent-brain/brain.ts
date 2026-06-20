import { prisma } from "@/lib/db"
import { AppUnderstanding } from "./types"

function getClient() {
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1"
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY
  return { baseUrl, apiKey }
}

export async function analyzeApplicationContext(
  projectId: string,
  userInstruction?: string | null
): Promise<AppUnderstanding> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      modules: true,
      requirements: true,
      elementLocators: { take: 10 },
      credentials: true
    }
  })

  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  const { baseUrl, apiKey } = getClient()

  if (!apiKey) {
    console.warn("[AgentBrain] OPENAI_COMPATIBLE_API_KEY is not set. Using context default heuristics.")
    return getFallbackUnderstanding(project)
  }

  const systemPrompt = `You are the LLM Brain (Understanding Layer) of a Fully Autonomous QA Engineer Agent.
Your job is to understand everything about the application under test based on the project information, credentials, requirements list, and locator details provided.
Analyze the target URL and structure to identify the modules, risk areas, suggested E2E test focus areas, and paths detected.
Return ONLY valid JSON matching this exact structure:
{
  "appType": "web app",
  "modules": ["Auth", "Dashboard", "Settings"],
  "riskAreas": ["login", "payment"],
  "suggestedTestFocus": ["smoke", "regression"],
  "pagesDetected": ["/login", "/dashboard"]
}`

  const userMessage = `Project Name: ${project.name}
WebApp URL: ${project.webAppUrl}
Description: ${project.description || "N/A"}
Modules: ${project.modules.map(m => m.name).join(", ") || "None"}
Requirements: ${project.requirements.map(r => r.title).join(", ") || "None"}
Credentials: ${project.credentials.map(c => `${c.roleName} (${c.username})`).join(", ") || "None"}
Sample Locators: ${project.elementLocators.map(l => `${l.friendlyName} (${l.pageUrl})`).join(", ") || "None"}
User Intent/Instruction: ${userInstruction || "N/A"}`

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
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
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) throw new Error(`LLM Error: ${res.statusText}`)
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error("Empty response from LLM")
    
    return JSON.parse(content) as AppUnderstanding
  } catch (err: any) {
    console.error("[AgentBrain] Failed to analyze context with LLM, falling back to heuristics:", err.message)
    return getFallbackUnderstanding(project)
  }
}

function getFallbackUnderstanding(project: any): AppUnderstanding {
  const modules = project.modules.map((m: any) => m.name)
  if (modules.length === 0) {
    modules.push("Authentication", "Dashboard", "Settings")
  }

  const pages = ["/"]
  if (project.credentials.length > 0) {
    pages.push("/login")
  }
  
  return {
    appType: "web app",
    modules,
    riskAreas: project.credentials.length > 0 ? ["login", "navigation"] : ["navigation"],
    suggestedTestFocus: ["smoke", "regression"],
    pagesDetected: pages
  }
}
