import { NextRequest, NextResponse } from "next/server"
import { requireProjectOwner, notFoundResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import {
  generateTestCasesFromRequirements,
  AIGeneratedTestCase,
} from "@/lib/ai/test-case-generator"

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) {
    return notFoundResponse("Project not found or access denied")
  }

  try {
    const body = await request.json()
    const {
      text,
      importId,
      provider,
      model,
      language,
      testCaseCount,
      includeNegativeCases,
      includeEdgeCases,
      includeExploratory,
    } = body

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: "Text is too short. Provide at least 20 characters of requirements." },
        { status: 400 }
      )
    }

    // Get project URL for context
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { webAppUrl: true, name: true },
    })

    // Generate test cases using AI
    const generatedTestCases = await generateTestCasesFromRequirements(
      text,
      project?.webAppUrl || undefined,
      {
        projectId: params.projectId,
        provider: provider || "ollama",
        model: model || undefined,
        language: language || "en",
        testCaseCount: testCaseCount || 10,
        includeNegativeCases: includeNegativeCases !== false,
        includeEdgeCases: includeEdgeCases !== false,
        includeExploratory: includeExploratory === true,
      }
    )

    // Update import status if importId provided
    if (importId) {
      await prisma.requirementImport.update({
        where: { id: importId },
        data: {
          status: "Generated",
          summary: {
            generatedTestCases: generatedTestCases.length,
            provider: provider || "ollama",
            model: model || "default",
            generatedAt: new Date().toISOString(),
          } as any,
        },
      })
    }

    return NextResponse.json({
      testCases: generatedTestCases,
      count: generatedTestCases.length,
      provider: provider || "ollama",
      model: model || "default",
    })
  } catch (error: any) {
    console.error("POST /api/projects/[projectId]/ai-generate-testcases error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate test cases" },
      { status: 500 }
    )
  }
}
