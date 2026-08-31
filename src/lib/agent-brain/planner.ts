import { AppUnderstanding, ExecutionPlan, ExecutionPlanItem } from "./types"
import { prisma } from "@/lib/db"
import { chatWithConfiguredProvider, resolveProvider } from "@/lib/ai/provider-chat"

export async function generateExecutionPlan(
  projectId: string,
  understanding: AppUnderstanding,
  mode: "Exploration" | "Planning" | "Execution" | "Autonomous"
): Promise<ExecutionPlan> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      credentials: true,
      requirements: true
    }
  })

  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  // If in Exploration Mode, we don't plan execution tests.
  if (mode === "Exploration") {
    return { executionPlan: [] }
  }

  // This project's own AI key first, then workspace, then env — see resolveProvider.
  if (!(await resolveProvider(projectId))) {
    console.warn("[AgentBrain] No AI provider configured for this project. Generating template plan.")
    return getFallbackPlan(project, understanding)
  }

  const systemPrompt = `You are the Planner (Decision & Strategy Layer) of an Autonomous QA Engineer Agent.
Generate a structured, prioritized execution plan based on the application's understanding, credentials, requirements list, and target web URL.
Structure tests into categories:
1. Smoke Tests (Critical priority: login, payment, auth verification).
2. Functional Tests (High priority: core app workflows).
3. Negative Tests (Medium priority: input validation errors, boundary conditions).
4. UI / Layout Tests (Low priority: visual alignments, text labels).

For each step, specify:
- actionDescription: Simple text explanation.
- expectedResult: Clear verification text.
- actionType: click, fill, select, open_url, assert_visible, assert_text, etc.
- targetType: test_id, role, text, label, placeholder, css, etc.
- targetValue: Selector matching targets.
- inputValue: Input text value (if fill/select).

Return ONLY valid JSON matching this exact structure:
{
  "executionPlan": [
    {
      "testName": "Login Flow",
      "priority": "Critical",
      "role": "Admin",
      "strategy": "smoke",
      "steps": [
        {
          "actionDescription": "Navigate to login url",
          "expectedResult": "Login page renders successfully",
          "actionType": "open_url",
          "targetType": "url",
          "targetValue": "https://example.com/login"
        }
      ]
    }
  ]
}`

  const userMessage = `Project Name: ${project.name}
WebApp URL: ${project.webAppUrl}
App Category/Understanding: ${JSON.stringify(understanding)}
Credentials Available: ${project.credentials.map(c => `${c.roleName} (username: ${c.username})`).join(", ") || "None"}
Requirements: ${project.requirements.map(r => r.title).join(", ") || "None"}
Generate a comprehensive execution plan containing at least 3-5 test scenarios.`

  try {
    const content = await chatWithConfiguredProvider({
      projectId,
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0.3,
      json: true,
      command: "agent-brain-plan",
    })
    if (!content) throw new Error("Empty response from LLM")

    return JSON.parse(content) as ExecutionPlan
  } catch (err: any) {
    console.error("[AgentBrain] Failed to generate plan with LLM, falling back to templates:", err.message)
    return getFallbackPlan(project, understanding)
  }
}

function getFallbackPlan(project: any, understanding: AppUnderstanding): ExecutionPlan {
  const plan: ExecutionPlanItem[] = []

  // Default Smoke Test: Homepage
  plan.push({
    testName: "Verify Application Homepage Renders",
    priority: "Critical",
    role: project.credentials[0]?.roleName || "Guest",
    strategy: "smoke",
    steps: [
      {
        actionDescription: `Navigate to homepage at ${project.webAppUrl}`,
        expectedResult: "Homepage loads successfully",
        actionType: "open_url",
        targetType: "url",
        targetValue: project.webAppUrl
      },
      {
        actionDescription: "Verify main container is visible",
        expectedResult: "Body is present in DOM",
        actionType: "assert_visible",
        targetType: "css",
        targetValue: "body"
      }
    ]
  })

  // Default Functional Test: Module Navigation
  if (understanding.modules && understanding.modules.length > 0) {
    plan.push({
      testName: `Verify Modules Discovery: ${understanding.modules.slice(0, 2).join(", ")}`,
      priority: "High",
      role: project.credentials[0]?.roleName || "Guest",
      strategy: "functional",
      steps: [
        {
          actionDescription: `Open target homepage at ${project.webAppUrl}`,
          expectedResult: "Homepage is ready",
          actionType: "open_url",
          targetType: "url",
          targetValue: project.webAppUrl
        },
        {
          actionDescription: `Verify navigation contains module ${understanding.modules[0]}`,
          expectedResult: "Module text is visible on viewport",
          actionType: "assert_visible",
          targetType: "text",
          targetValue: understanding.modules[0]
        }
      ]
    })
  }

  return { executionPlan: plan }
}
