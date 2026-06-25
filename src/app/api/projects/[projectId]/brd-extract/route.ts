import { NextRequest, NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { extractDocument, extractRequirements } from "@/lib/ai/document-extractor"

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) {
    return notFoundResponse("Project not found or access denied")
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    const allowedExtensions = [".pdf", ".docx", ".doc", ".txt", ".md"]
    const isAllowedExt = allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))

    if (!isAllowedExt) {
      return NextResponse.json(
        { error: "Unsupported file type. Supported: PDF, DOCX, TXT, MD" },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Extract text from document
    const extracted = await extractDocument(buffer, file.name, file.type || "application/octet-stream")

    // Extract requirements from text
    const { requirements, summary } = extractRequirements(extracted.text)

    // Create a RequirementImport record
    const requirementImport = await prisma.requirementImport.create({
      data: {
        projectId: params.projectId,
        fileName: file.name,
        fileType: file.type || "unknown",
        rawText: extracted.text.substring(0, 50000), // Limit storage
        parsedItems: requirements as any,
        summary: summary as any,
        status: "Parsed",
      },
    })

    return NextResponse.json({
      importId: requirementImport.id,
      fileName: extracted.fileName,
      fileType: extracted.fileType,
      pageCount: extracted.pageCount,
      wordCount: extracted.wordCount,
      sectionCount: extracted.sections.length,
      requirementCount: requirements.length,
      requirements,
      summary,
      text: extracted.text.substring(0, 3000), // Preview only
    })
  } catch (error: any) {
    console.error("POST /api/projects/[projectId]/brd-extract error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to extract document" },
      { status: 500 }
    )
  }
}
