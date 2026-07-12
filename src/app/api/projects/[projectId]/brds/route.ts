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

// GET /api/projects/:projectId/brds?search=&type=&status=&uploader=&sort=&includeArchived=
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

  const where: any = { projectId: params.projectId, isDeleted: false }
  if (search) where.name = { contains: search, mode: "insensitive" }
  if (type) where.fileType = type
  if (status) where.status = status
  else if (!includeArchived) where.status = { not: "Archived" }
  if (uploader) where.uploaderId = uploader

  const orderBy =
    sort === "name" ? { name: "asc" as const }
    : sort === "created" ? { createdAt: "desc" as const }
    : { updatedAt: "desc" as const }

  const [project, brds] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.projectId }, select: { boardKey: true } }),
    prisma.brdDocument.findMany({
      where,
      orderBy,
      include: { _count: { select: { links: true, versions: true, annotations: true } } },
    }),
  ])

  return NextResponse.json({ brds: brds.map((b) => serializeBrd(b, project?.boardKey)) })
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
  const fileType = ALLOWED_UPLOAD_TYPES[file.type]
  if (!fileType) {
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
