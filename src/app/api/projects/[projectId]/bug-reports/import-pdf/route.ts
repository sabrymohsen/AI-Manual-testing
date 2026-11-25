import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { parseBugReportPdf } from "@/lib/bug-reports/pdf-import"
import { importDir, IMPORT_URL_PREFIX } from "@/lib/bug-reports/pdf-import-storage"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_PDF_SIZE = 60 * 1024 * 1024 // reports with many screenshots get big

/**
 * POST /api/projects/:projectId/bug-reports/import-pdf
 *
 * Step 1 of "Import bugs from PDF": read the automation's bug report PDF and
 * return the bugs found in it, for the tester to check and edit. Nothing is
 * created yet. Screenshots are cut out of the PDF and kept under
 * storage/bug-imports/<projectId>/<importId>/ so the preview can show them and
 * step 2 (…/import-pdf/commit) can attach them without uploading again.
 */
export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const form = await request.formData().catch(() => null)
  const file = form?.get("file") as File | null
  if (!file) return badRequestResponse("No file uploaded")
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return badRequestResponse("Upload the bug report as a PDF file")
  }
  if (file.size > MAX_PDF_SIZE) return badRequestResponse("The PDF is larger than 60 MB")

  let report
  try {
    report = await parseBugReportPdf(Buffer.from(await file.arrayBuffer()))
  } catch (e: any) {
    console.error("import-pdf parse failed:", e)
    return badRequestResponse(`Could not read this PDF: ${e?.message || e}`)
  }

  const importId = randomUUID()
  const dir = importDir(params.projectId, importId)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: `Could not save the screenshots to storage (${e?.code || e?.message}).` },
      { status: 500 }
    )
  }

  // Bugs already in the project with the same title were probably imported
  // from an earlier run of the same report; the preview leaves them unticked.
  const titles = report.bugs.map((b) => b.title)
  const existing = await prisma.bugReport.findMany({
    where: { projectId: params.projectId, title: { in: titles } },
    select: { id: true, bugKey: true, title: true, status: true },
  })
  const byTitle = new Map(existing.map((b) => [b.title, b]))

  const bugs = report.bugs.map((bug) => {
    const screenshots = bug.screenshots.map((s) => {
      const fileName = `${bug.ref}_${s.index}.png`
      fs.writeFileSync(path.join(dir, fileName), s.png)
      return {
        fileName,
        url: `${IMPORT_URL_PREFIX}/${params.projectId}/${importId}/${fileName}`,
        caption: s.caption,
        pageUrl: s.pageUrl,
        originalName: s.fileName,
        width: s.width,
        height: s.height,
      }
    })
    return { ...bug, screenshots, existing: byTitle.get(bug.title) || null }
  })

  fs.writeFileSync(
    path.join(dir, "report.json"),
    JSON.stringify({ fileName: file.name, uploadedBy: auth.session!.user.id, createdAt: new Date().toISOString() })
  )

  return NextResponse.json({
    importId,
    fileName: file.name,
    report: { ...report, bugs },
  })
}
