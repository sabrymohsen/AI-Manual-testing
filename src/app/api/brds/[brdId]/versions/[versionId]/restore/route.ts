import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import { requireBrdAccess, brdAudit, brdAbsDir, brdRelPath, STORAGE_ROOT } from "@/lib/brd/server"

// POST /api/brds/:brdId/versions/:versionId/restore
// Copies the chosen version's content forward as a brand-new current version.
export async function POST(_req: Request, { params }: { params: { brdId: string; versionId: string } }) {
  const access = await requireBrdAccess(params.brdId, { manage: true })
  if (access.error !== null) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!
  const user = access.session!.user

  if (brd.status === "Final") {
    return NextResponse.json({ error: "This BRD is Final and locked" }, { status: 403 })
  }

  const source = await prisma.brdVersion.findFirst({
    where: { id: params.versionId, brdId: brd.id },
  })
  if (!source) return NextResponse.json({ error: "Version not found" }, { status: 404 })

  const last = await prisma.brdVersion.findFirst({
    where: { brdId: brd.id },
    orderBy: { versionNumber: "desc" },
  })
  const nextNumber = (last?.versionNumber ?? 0) + 1

  const storedName = `v${nextNumber}-${brd.filename.replace(/[^\w.\-]+/g, "_")}`
  const relPath = brdRelPath(brd.projectId, brd.id, storedName)
  try {
    const buffer = await readFile(path.join(STORAGE_ROOT, source.storagePath))
    await mkdir(brdAbsDir(brd.projectId, brd.id), { recursive: true })
    await writeFile(path.join(brdAbsDir(brd.projectId, brd.id), storedName), buffer)
  } catch (e: any) {
    return NextResponse.json({ error: `Could not copy the version file (${e?.code || e?.message}).` }, { status: 500 })
  }

  const version = await prisma.brdVersion.create({
    data: {
      brdId: brd.id,
      versionNumber: nextNumber,
      storagePath: relPath,
      fileType: source.fileType,
      fileSize: source.fileSize,
      contentHtml: source.contentHtml,
      changeSummary: `Restored from v${source.versionNumber}`,
      editorId: user.id,
      editorName: user.name || user.email,
      previousVersionId: brd.currentVersionId,
    },
  })
  await prisma.brdDocument.update({
    where: { id: brd.id },
    data: { currentVersionId: version.id, updatedAt: new Date() },
  })
  await brdAudit(brd.id, "version_restored", `Restored v${source.versionNumber} as v${nextNumber}`, user)

  return NextResponse.json({ version: { id: version.id, versionNumber: nextNumber } }, { status: 201 })
}
