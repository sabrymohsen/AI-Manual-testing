/**
 * POST /api/projects/[projectId]/ai-generate-bug
 *
 * Drafts a structured bug report from a tester's prompt (+ optional screenshot)
 * using the configured AI provider, falling back to Ollama -> Hugging Face ->
 * a rule-based draft.
 * Returns the draft only — it does NOT create the bug; the UI lets the user
 * edit everything before saving.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireProjectMember, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { generateBugReportDraft } from "@/lib/ai/generate-bug-report"

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  // Member-level: drafting a bug is part of filing one. Owner-only meant an
  // ordinary tester got a 404 from the AI button.
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { description, imageBase64, imageMimeType } = body as {
      description?: string
      imageBase64?: string | null
      imageMimeType?: string | null
    }

    const hasImage = !!imageBase64
    if ((!description || description.trim().length < 10) && !hasImage) {
      return badRequestResponse("Provide a description (at least 10 characters) or a screenshot.")
    }

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { webAppUrl: true },
    })

    const draft = await generateBugReportDraft({
      description: description || "",
      imageBase64: imageBase64 || null,
      imageMimeType: imageMimeType || null,
      appUrl: project?.webAppUrl || null,
    })

    return NextResponse.json({ draft })
  } catch (error: any) {
    console.error("POST /api/projects/[projectId]/ai-generate-bug error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate bug draft" },
      { status: 500 }
    )
  }
}
