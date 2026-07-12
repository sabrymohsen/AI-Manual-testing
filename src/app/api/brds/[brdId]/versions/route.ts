import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { notify } from "@/lib/notifications"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { z } from "zod"
import { requireBrdAccess, brdAudit, brdAbsDir, brdRelPath } from "@/lib/brd/server"
import { htmlToDocxBuffer } from "@/lib/brd/docx"

const saveSchema = z.object({
  contentHtml: z.string(),
  changeSummary: z.string().min(1, "A change summary is required").max(500),
})

// POST /api/brds/:brdId/versions -> save a new version from editor HTML (Word).
// Converts the HTML to a .docx, stores it, bumps the version, and re-points the
// master. (PDF versions come from re-upload, not this editor path.)
export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true })
  if (access.error !== null) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!
  const user = access.session!.user

  if (brd.fileType !== "docx") {
    return NextResponse.json({ error: "Only Word BRDs can be edited in the editor" }, { status: 400 })
  }
  if (brd.status === "Final") {
    return NextResponse.json({ error: "This BRD is Final and locked for editing" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || "Validation failed" }, { status: 400 })
  }

  const last = await prisma.brdVersion.findFirst({
    where: { brdId: brd.id },
    orderBy: { versionNumber: "desc" },
  })
  const nextNumber = (last?.versionNumber ?? 0) + 1

  let buffer: Buffer
  try {
    buffer = await htmlToDocxBuffer(parsed.data.contentHtml)
  } catch (e: any) {
    console.error("BRD docx build failed:", e?.message)
    return NextResponse.json({ error: "Could not build the Word document" }, { status: 500 })
  }

  const storedName = `v${nextNumber}-${brd.filename.replace(/[^\w.\-]+/g, "_")}`
  const relPath = brdRelPath(brd.projectId, brd.id, storedName)
  try {
    await mkdir(brdAbsDir(brd.projectId, brd.id), { recursive: true })
    await writeFile(path.join(brdAbsDir(brd.projectId, brd.id), storedName), buffer)
  } catch (e: any) {
    return NextResponse.json({ error: `Could not save the file (${e?.code || e?.message}).` }, { status: 500 })
  }

  const version = await prisma.brdVersion.create({
    data: {
      brdId: brd.id,
      versionNumber: nextNumber,
      storagePath: relPath,
      fileType: "docx",
      fileSize: buffer.length,
      contentHtml: parsed.data.contentHtml,
      changeSummary: parsed.data.changeSummary,
      editorId: user.id,
      editorName: user.name || user.email,
      previousVersionId: brd.currentVersionId,
    },
  })
  await prisma.brdDocument.update({
    where: { id: brd.id },
    data: { currentVersionId: version.id, updatedAt: new Date() },
  })
  await brdAudit(brd.id, "version_saved", `v${nextNumber}: ${parsed.data.changeSummary}`, user)

  // Notify project members that the BRD was updated.
  const project = await prisma.project.findUnique({
    where: { id: brd.projectId },
    select: { userId: true, projectMembers: { select: { userId: true } } },
  })
  if (project) {
    const recipients = [...new Set([project.userId, ...project.projectMembers.map((m) => m.userId)])].filter(
      (id) => id !== user.id
    )
    notify(
      recipients.map((userId) => ({
        userId,
        type: "SYSTEM" as const,
        title: "BRD updated",
        body: `BRD ${brd.name} updated to v${nextNumber}`,
        projectId: brd.projectId,
        actionUrl: `/projects/${brd.projectId}/brds/${brd.id}`,
      }))
    ).catch(() => {})
  }

  return NextResponse.json(
    { version: { id: version.id, versionNumber: nextNumber, changeSummary: version.changeSummary } },
    { status: 201 }
  )
}
