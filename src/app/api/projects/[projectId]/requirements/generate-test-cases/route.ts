import { NextRequest, NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import {
  generateTestCasesFromParsedItems,
  detectDuplicates,
  type GenerationMode,
  type OutputLanguage,
} from "@/lib/requirements/rule-based-generator"
import type { ParsedRequirementItem } from "@/lib/requirements/parsers"

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const {
      importId,
      parsedItems,
      mode = "balanced",
      outputLanguage = "source",
      selectedIndices,
    }: {
      importId?: string
      parsedItems: ParsedRequirementItem[]
      mode: GenerationMode
      outputLanguage: OutputLanguage
      selectedIndices?: number[]
    } = body

    if (!parsedItems || !Array.isArray(parsedItems) || parsedItems.length === 0) {
      return NextResponse.json({ error: "No requirements provided" }, { status: 400 })
    }

    // If user selected specific items, filter to those only
    const itemsToGenerate = selectedIndices && selectedIndices.length > 0
      ? parsedItems.filter((_, i) => selectedIndices.includes(i))
      : parsedItems

    // Generate test cases using rule-based engine (always free)
    const generatedTestCases = generateTestCasesFromParsedItems(itemsToGenerate, { mode, outputLanguage })

    // Fetch existing test case titles for duplicate detection
    const existingCases = await prisma.testCase.findMany({
      where: { projectId: params.projectId },
      select: { title: true },
    })
    const existingTitles = existingCases.map(tc => tc.title)
    const duplicateInfo = detectDuplicates(generatedTestCases, existingTitles)

    // Update import status if importId provided
    if (importId) {
      await prisma.requirementImport.update({
        where: { id: importId },
        data: {
          status: "Generated",
          summary: {
            generatedTestCases: generatedTestCases.length,
            mode,
            outputLanguage,
            generatedAt: new Date().toISOString(),
          } as any,
        },
      })
    }

    return NextResponse.json({
      testCases: generatedTestCases,
      count: generatedTestCases.length,
      duplicates: duplicateInfo.filter(d => d.isDuplicate),
      generationMode: mode,
      outputLanguage,
    })
  } catch (error: any) {
    console.error("POST /requirements/generate-test-cases error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate test cases" },
      { status: 500 }
    )
  }
}
