import { prisma } from "@/lib/db"
import { AppUnderstanding } from "./types"
import { chatWithConfiguredProvider, resolveProvider } from "@/lib/ai/provider-chat"

export async function analyzeApplicationContext(
  projectId: string,
  userInstruction?: string | null
): Promise<AppUnderstanding> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      epics: true,
      features: true,
      requirements: true,
      elementLocators: { take: 10 },
      credentials: true
    }
  })

  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  // Resolved through the shared cascade: this project's own AI key first, then
  // the workspace provider, then any env key. Previously this read
  // OPENAI_COMPATIBLE_API_KEY alone, so a key saved on the project was ignored.
  if (!(await resolveProvider(projectId))) {
    console.warn("[AgentBrain] No AI provider configured for this project. Using context default heuristics.")
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
Epics: ${project.epics.map(e => e.title).join(", ") || "None"}
Features: ${project.features.map(f => f.name).join(", ") || "None"}
Requirements: ${project.requirements.map(r => r.title).join(", ") || "None"}
Credentials: ${project.credentials.map(c => `${c.roleName} (${c.username})`).join(", ") || "None"}
Sample Locators: ${project.elementLocators.map(l => `${l.friendlyName} (${l.pageUrl})`).join(", ") || "None"}
User Intent/Instruction: ${userInstruction || "N/A"}`

  try {
    const content = await chatWithConfiguredProvider({
      projectId,
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0.2,
      json: true,
      command: "agent-brain-context",
    })
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
