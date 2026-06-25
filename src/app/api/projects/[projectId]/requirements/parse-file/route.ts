import { NextRequest, NextResponse } from "next/server"
import { requireProjectOwner, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { parseRequirementsFile, detectLanguage } from "@/lib/requirements/parsers"

const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 MB
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".docx", ".txt", ".md"]

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    // Validate extension
    const fileName = file.name.toLowerCase()
    const isAllowed = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext))
    if (!isAllowed) {
      return NextResponse.json(
        { error: `Unsupported file type. Supported: ${ALLOWED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      )
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 15 MB." },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Detect file type
    const ext = fileName.split(".").pop() || ""

    // Parse requirements
    const parsedItems = await parseRequirementsFile(buffer, file.name, ext)

    if (parsedItems.length === 0) {
      return NextResponse.json(
        { error: "No user stories or requirements detected in the file. Please check the format." },
        { status: 422 }
      )
    }

    // Detect overall language
    const combinedText = parsedItems.map(i => `${i.title} ${i.description || ""}`).join(" ")
    const overallLanguage = detectLanguage(combinedText)

    // Store raw text for large files
    const rawText = parsedItems.map(i =>
      `${i.requirementKey ? `[${i.requirementKey}] ` : ""}${i.title}\n${i.description || ""}\n${(i.acceptanceCriteria || []).join("\n")}`
    ).join("\n\n").substring(0, 50000)

    // Create RequirementImport record
    const importRecord = await prisma.requirementImport.create({
      data: {
        projectId: params.projectId,
        fileName: file.name,
        fileType: ext,
        language: overallLanguage,
        status: "Parsed",
        rawText,
        parsedItems: parsedItems as any,
        summary: {
          totalItems: parsedItems.length,
          language: overallLanguage,
          parsedAt: new Date().toISOString(),
          fileSize: file.size,
        } as any,
      },
    })

    return NextResponse.json({
      importId: importRecord.id,
      fileName: file.name,
      fileType: ext,
      language: overallLanguage,
      totalItems: parsedItems.length,
      parsedItems,
      summary: {
        total: parsedItems.length,
        withAcceptanceCriteria: parsedItems.filter(i => (i.acceptanceCriteria?.length ?? 0) > 0).length,
        languages: {
          english: parsedItems.filter(i => i.language === "English").length,
          arabic: parsedItems.filter(i => i.language === "Arabic").length,
          mixed: parsedItems.filter(i => i.language === "Mixed").length,
        },
        modules: [...new Set(parsedItems.map(i => i.module).filter(Boolean))],
      },
    })
  } catch (error: any) {
    console.error("POST /requirements/parse-file error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to parse file" },
      { status: 500 }
    )
  }
}
