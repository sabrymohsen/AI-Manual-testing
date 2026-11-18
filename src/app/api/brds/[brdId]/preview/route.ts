import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { readFile } from "fs/promises"
import path from "path"
import mammoth from "mammoth"
import { requireBrdAccess, STORAGE_ROOT } from "@/lib/brd/server"
import { sanitizeBrdHtml } from "@/lib/brd/sanitize"

// GET /api/brds/:brdId/preview?versionId= -> rendered HTML for a Word BRD.
// Uses the editor-saved HTML when present, otherwise converts the .docx via
// mammoth. PDFs are previewed client-side (iframe) and don't use this.
export async function GET(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!

  if (brd.fileType !== "docx") {
    return NextResponse.json({ error: "Preview HTML is only available for Word documents" }, { status: 400 })
  }

  const versionId = new URL(request.url).searchParams.get("versionId") || brd.currentVersionId
  const version = versionId
    ? await prisma.brdVersion.findFirst({ where: { id: versionId, brdId: brd.id } })
    : null
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 })

  if (version.contentHtml) {
    return NextResponse.json({ html: sanitizeBrdHtml(version.contentHtml), versionNumber: version.versionNumber })
  }

  try {
    const buffer = await readFile(path.join(STORAGE_ROOT, version.storagePath))
    const { value } = await mammoth.convertToHtml({ buffer })
    return NextResponse.json({
      html: sanitizeBrdHtml(value),
      versionNumber: version.versionNumber,
      // The editor can't round-trip images into .docx; it warns before editing.
      hasImages: /<img\b/i.test(value),
    })
  } catch (e: any) {
    console.error("BRD preview conversion failed:", e?.message)
    return NextResponse.json({ error: "Could not render this document" }, { status: 500 })
  }
}
