import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, requireProjectPermission } from "@/lib/api-guards"
import { notify } from "@/lib/notifications"
import { logUserActivity } from "@/lib/user-activity"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_BRD_SIZE,
  brdAbsDir,
  brdRelPath,
  brdAudit,
  serializeBrd,
} from "@/lib/brd/server"
import { sniffBrdType, extractTextFromBuffer, ensureVersionText } from "@/lib/brd/content"
import { purgeExpiredBrds, TRASH_DAYS } from "@/lib/brd/lifecycle"

/**
 * GET /api/projects/:projectId/brds?search=&type=&status=&uploader=&sort=&includeArchived=&trash=
 *
 * `search` matches the name OR the text of the current version (full-text),
 * and returns a snippet around the first hit. `trash=true` lists deleted BRDs
 * still inside the 30-day window. Expired trash is purged here.
 */
export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const search = url.searchParams.get("search")?.trim()
  const type = url.searchParams.get("type") // pdf | docx
  const status = url.searchParams.get("status") // Draft|Reviewed|Final|Archived
  const uploader = url.searchParams.get("uploader")
  const sort = url.searchParams.get("sort") || "updated"
  const includeArchived = url.searchParams.get("includeArchived") === "true"
  const trash = url.searchParams.get("trash") === "true"

  await purgeExpiredBrds(params.projectId).catch((e) => console.error("BRD purge failed:", e))

  const orderBy =
    sort === "name" ? { name: "asc" as const }
    : sort === "created" ? { createdAt: "desc" as const }
    : { updatedAt: "desc" as const }

  const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { boardKey: true } })

  if (trash) {
    const deleted = await prisma.brdDocument.findMany({
      where: { projectId: params.projectId, isDeleted: true },
      orderBy: { deletedAt: "desc" },
      include: { _count: { select: { links: true, versions: true, annotations: true } } },
    })
    return NextResponse.json({
      brds: deleted.map((b) => ({
        ...serializeBrd(b, project?.boardKey),
        deletedAt: b.deletedAt,
        daysLeft: b.deletedAt
          ? Math.max(0, TRASH_DAYS - Math.floor((Date.now() - b.deletedAt.getTime()) / 86_400_000))
          : TRASH_DAYS,
      })),
    })
  }

  const where: any = { projectId: params.projectId, isDeleted: false }
  if (type) where.fileType = type
  if (status) where.status = status
  else if (!includeArchived) where.status = { not: "Archived" }
  if (uploader) where.uploaderId = uploader

  // Full-text: fill in text for current versions that predate text extraction
  // (a few per request), then match name OR current-version text.
  const snippets = new Map<string, string>()
  if (search) {
    const missing = await prisma.brdDocument.findMany({
      where: { projectId: params.projectId, isDeleted: false, currentVersionId: { not: null } },
      select: { currentVersionId: true },
    })
    const ids = missing.map((m) => m.currentVersionId!)
    const untexted = await prisma.brdVersion.findMany({
      where: { id: { in: ids }, textContent: null },
      select: { id: true },
      take: 10,
    })
    for (const v of untexted) await ensureVersionText(v.id)

    const hits = await prisma.$queryRaw<{ id: string; text: string }[]>`
      SELECT d.id, v."textContent" AS text
      FROM "BrdDocument" d JOIN "BrdVersion" v ON v.id = d."currentVersionId"
      WHERE d."projectId" = ${params.projectId} AND d."isDeleted" = false
        AND v."textContent" ILIKE ${"%" + search.replace(/[%_\\]/g, "\\$&") + "%"}`
    for (const h of hits) {
      const i = h.text.toLowerCase().indexOf(search.toLowerCase())
      const start = Math.max(0, i - 60)
      snippets.set(
        h.id,
        (start > 0 ? "…" : "") + h.text.slice(start, i + search.length + 80).replace(/\s+/g, " ").trim() + "…"
      )
    }
    where.OR = [{ name: { contains: search, mode: "insensitive" } }, { id: { in: Array.from(snippets.keys()) } }]
  }

  const [brds, archivedCount, trashCount] = await Promise.all([
    prisma.brdDocument.findMany({
      where,
      orderBy,
      include: { _count: { select: { links: true, versions: true, annotations: true, requirements: true } } },
    }),
    prisma.brdDocument.count({ where: { projectId: params.projectId, isDeleted: false, status: "Archived" } }),
    prisma.brdDocument.count({ where: { projectId: params.projectId, isDeleted: true } }),
  ])

  return NextResponse.json({
    brds: brds.map((b) => ({
      ...serializeBrd(b, project?.boardKey),
      requirementCount: b._count.requirements,
      snippet: snippets.get(b.id) ?? null,
    })),
    archivedCount,
    trashCount,
  })
}

// POST /api/projects/:projectId/brds  (multipart: file, name?) -> upload a new BRD
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectPermission(params.projectId, "canManageBrds")
  if (auth.error !== null) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const user = auth.session.user

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }
  if (!ALLOWED_UPLOAD_TYPES[file.type]) {
    return NextResponse.json({ error: "Only PDF and Word documents are supported" }, { status: 400 })
  }
  if (file.size > MAX_BRD_SIZE) {
    return NextResponse.json({ error: "Maximum file size is 25MB" }, { status: 400 })
  }

  // De-duplicate the display name within the project (append a numeric suffix).
  const baseName = (form.get("name") as string)?.trim() || file.name.replace(/\.[^.]+$/, "")
  let displayName = baseName
  for (let i = 2; ; i++) {
    const clash = await prisma.brdDocument.findFirst({
      where: { projectId: params.projectId, name: displayName, isDeleted: false },
      select: { id: true },
    })
    if (!clash) break
    displayName = `${baseName} (${i})`
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  // The browser's MIME type is only a claim — check the bytes.
  const fileType = sniffBrdType(buffer)
  if (!fileType) {
    return NextResponse.json({ error: "That file isn't a valid PDF or Word (.docx) document" }, { status: 400 })
  }

  // Create master + v1 in a transaction, then write the file to storage.
  const brd = await prisma.brdDocument.create({
    data: {
      name: displayName,
      filename: file.name,
      fileType,
      projectId: params.projectId,
      uploaderId: user.id,
      uploaderName: user.name || user.email,
    },
  })

  const storedName = `v1-${file.name.replace(/[^\w.\-]+/g, "_")}`
  const relPath = brdRelPath(params.projectId, brd.id, storedName)
  try {
    await mkdir(brdAbsDir(params.projectId, brd.id), { recursive: true })
    await writeFile(path.join(brdAbsDir(params.projectId, brd.id), storedName), buffer)
  } catch (e: any) {
    await prisma.brdDocument.delete({ where: { id: brd.id } })
    console.error("BRD write failed:", e?.code, e?.message)
    return NextResponse.json(
      { error: `Could not save the file to storage (${e?.code || e?.message}).`, code: e?.code },
      { status: 500 }
    )
  }

  const version = await prisma.brdVersion.create({
    data: {
      brdId: brd.id,
      versionNumber: 1,
      storagePath: relPath,
      fileType,
      fileSize: file.size,
      textContent: await extractTextFromBuffer(buffer, fileType),
      changeSummary: "Initial upload",
      editorId: user.id,
      editorName: user.name || user.email,
    },
  })
  await prisma.brdDocument.update({
    where: { id: brd.id },
    data: { currentVersionId: version.id },
  })

  await brdAudit(brd.id, "created", `Created BRD: ${file.name}`, user)
  logUserActivity(user.id, "FILE_UPLOADED", `Uploaded BRD "${displayName}"`, params.projectId)

  // Notify all project members (except the uploader).
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { userId: true, boardKey: true, projectMembers: { select: { userId: true } } },
  })
  if (project) {
    const recipients = [...new Set([project.userId, ...project.projectMembers.map((m) => m.userId)])].filter(
      (id) => id !== user.id
    )
    notify(
      recipients.map((userId) => ({
        userId,
        type: "SYSTEM" as const,
        title: "New BRD uploaded",
        body: `${user.name || user.email} uploaded a new BRD: ${displayName}`,
        projectId: params.projectId,
        actionUrl: `/projects/${params.projectId}/brds/${brd.id}`,
      }))
    ).catch(() => {})
  }

  const full = await prisma.brdDocument.findUnique({
    where: { id: brd.id },
    include: { versions: true, _count: { select: { links: true, versions: true, annotations: true } } },
  })
  return NextResponse.json({ brd: serializeBrd(full, project?.boardKey) }, { status: 201 })
}
