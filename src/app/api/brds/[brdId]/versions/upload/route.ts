import { NextResponse } from "next/server"
import { requireBrdAccess, ALLOWED_UPLOAD_TYPES, MAX_BRD_SIZE } from "@/lib/brd/server"
import { sniffBrdType } from "@/lib/brd/content"
import { createVersionFromFile } from "@/lib/brd/lifecycle"

/**
 * POST /api/brds/:brdId/versions/upload  (multipart: file, changeSummary)
 *
 * Uploads a new version of a BRD. PDF BRDs had no way to get a v2 at all, and
 * Word BRDs could only change through the in-app editor (which can't keep
 * images). May switch the document between PDF and Word.
 */
export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true, unlocked: true })
  if (access.error !== null) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!
  const user = access.session!.user

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 })
  }
  const file = form.get("file")
  const changeSummary = String(form.get("changeSummary") ?? "").trim()
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!changeSummary) return NextResponse.json({ error: "Describe what changed in this version" }, { status: 400 })
  if (changeSummary.length > 500) return NextResponse.json({ error: "Change summary is too long" }, { status: 400 })
  if (!ALLOWED_UPLOAD_TYPES[file.type]) {
    return NextResponse.json({ error: "Only PDF and Word documents are supported" }, { status: 400 })
  }
  if (file.size > MAX_BRD_SIZE) return NextResponse.json({ error: "Maximum file size is 25MB" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const fileType = sniffBrdType(buffer)
  if (!fileType) {
    return NextResponse.json({ error: "That file isn't a valid PDF or Word (.docx) document" }, { status: 400 })
  }

  try {
    const { version, changed, flagged } = await createVersionFromFile(
      brd,
      { buffer, fileType, name: file.name },
      changeSummary,
      user
    )
    return NextResponse.json(
      { version: { id: version.id, versionNumber: version.versionNumber }, changed, flagged },
      { status: 201 }
    )
  } catch (e: any) {
    console.error("BRD re-upload failed:", e?.code, e?.message)
    return NextResponse.json({ error: `Could not save the file (${e?.code || e?.message}).` }, { status: 500 })
  }
}
