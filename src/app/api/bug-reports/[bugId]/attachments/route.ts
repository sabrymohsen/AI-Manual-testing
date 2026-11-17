import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, notFoundResponse, unauthorizedResponse, badRequestResponse, memberProjectWhere } from "@/lib/api-guards"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

const MAX_IMAGE_SIZE = 15 * 1024 * 1024 // 15 MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200 MB
const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"]
const ALLOWED_VIDEO_EXTENSIONS = [".webm", ".mp4", ".mov", ".m4v", ".ogg"]

// Bug evidence lives under STORAGE_ROOT (a persistent volume in production) and
// is served through the authenticated /api/files streamer. It must NOT go in
// public/ — the standalone production build snapshots public/ at boot, so files
// written there at runtime 404 (and the copied public/ isn't writable by the
// app user anyway). Same rule as avatars in /api/me/avatar.
const STORAGE_ROOT = process.env.STORAGE_ROOT || "./storage"
const IMAGE_DIR = path.join(STORAGE_ROOT, "bug-screenshots")
const VIDEO_DIR = path.join(STORAGE_ROOT, "bug-videos")
const IMAGE_URL_PREFIX = "/api/files/bug-screenshots"
const VIDEO_URL_PREFIX = "/api/files/bug-videos"

/**
 * Locate a stored session artifact on disk. Session screenshots/recordings are
 * saved as STORAGE_ROOT-relative paths ("screenshots/liveqa-….png"), which in
 * production is the mounted volume, not the working directory.
 */
function resolveArtifact(filePath: string): string | null {
  const candidates = [
    path.resolve(STORAGE_ROOT, filePath),
    path.resolve(process.cwd(), filePath),
  ]
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { bugId: string } }
) {
  const existingBug = await prisma.bugReport.findUnique({
    where: { id: params.bugId },
    select: { projectId: true, screenshotPath: true, videoUrl: true }
  })

  if (!existingBug) {
    return notFoundResponse("Bug report not found")
  }

  const auth = await requireProjectOwner(existingBug.projectId!)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    // JSON mode: attach an existing session artifact by server path (Live QA
    // Session screenshots/recordings). Ownership is verified by matching the
    // path to a SessionScreenshot/SessionRecording row whose session belongs
    // to one of the caller's projects — arbitrary paths are rejected.
    const contentType = request.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}))
      const filePath: string = typeof body.filePath === "string" ? body.filePath : ""
      if (!filePath) return badRequestResponse("filePath is required")

      const [shot, rec] = await Promise.all([
        prisma.sessionScreenshot.findFirst({
          where: { filePath, session: { project: memberProjectWhere(auth.session!.user.id) } },
          select: { id: true },
        }),
        prisma.sessionRecording.findFirst({
          where: { filePath, session: { project: memberProjectWhere(auth.session!.user.id) } },
          select: { id: true },
        }),
      ])
      if (!shot && !rec) {
        return badRequestResponse("File is not a session artifact you own")
      }

      const artifactExt = path.extname(filePath).toLowerCase()
      const artifactIsImage = ALLOWED_IMAGE_EXTENSIONS.includes(artifactExt)
      const artifactIsVideo = ALLOWED_VIDEO_EXTENSIONS.includes(artifactExt)
      if (!artifactIsImage && !artifactIsVideo) {
        return badRequestResponse("Unsupported artifact type")
      }

      const sourcePath = resolveArtifact(filePath)
      if (!sourcePath) {
        return notFoundResponse("Artifact file not found on disk")
      }

      const targetDir = artifactIsVideo ? VIDEO_DIR : IMAGE_DIR
      const publicPrefix = artifactIsVideo ? VIDEO_URL_PREFIX : IMAGE_URL_PREFIX
      fs.mkdirSync(targetDir, { recursive: true })
      const storedName = `${params.bugId}-${randomUUID()}${artifactExt}`
      const targetPath = path.join(targetDir, storedName)
      fs.copyFileSync(sourcePath, targetPath)
      const publicPath = `${publicPrefix}/${storedName}`
      const fileName = path.basename(filePath)
      const fileSize = fs.statSync(targetPath).size

      const bug = await prisma.$transaction(async (tx) => {
        await tx.bugAttachment.create({
          data: {
            bugId: params.bugId,
            fileName,
            filePath: publicPath,
            fileType: artifactExt.replace(".", ""),
            fileSize,
          }
        })

        // First image becomes the primary screenshot; first video becomes the videoUrl.
        const data = artifactIsVideo
          ? (existingBug.videoUrl ? {} : { videoUrl: publicPath })
          : (existingBug.screenshotPath ? {} : { screenshotPath: publicPath })
        const updated = await tx.bugReport.update({ where: { id: params.bugId }, data })

        await tx.bugActivity.create({
          data: {
            bugId: params.bugId,
            action: "Attachment Added",
            details: `Attached session ${artifactIsVideo ? "recording" : "screenshot"} "${fileName}".`
          }
        })

        return updated
      })

      return NextResponse.json({ bug, filePath: publicPath, kind: artifactIsVideo ? "video" : "image" }, { status: 201 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return badRequestResponse("No file uploaded")
    }

    const ext = path.extname(file.name).toLowerCase()
    const isImage = ALLOWED_IMAGE_EXTENSIONS.includes(ext)
    const isVideo = ALLOWED_VIDEO_EXTENSIONS.includes(ext)
    if (!isImage && !isVideo) {
      return badRequestResponse(
        `Unsupported file type. Images: ${ALLOWED_IMAGE_EXTENSIONS.join(", ")}; Videos: ${ALLOWED_VIDEO_EXTENSIONS.join(", ")}`
      )
    }
    if (file.size > (isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE)) {
      return badRequestResponse(`File too large. Maximum size is ${isVideo ? "200" : "15"} MB.`)
    }

    const targetDir = isVideo ? VIDEO_DIR : IMAGE_DIR
    const publicPrefix = isVideo ? VIDEO_URL_PREFIX : IMAGE_URL_PREFIX
    const storedName = `${params.bugId}-${randomUUID()}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    // Surface the real filesystem error instead of a blank 500 — an unmounted or
    // read-only volume (EACCES/EROFS) needs an infra fix, not a retry.
    try {
      fs.mkdirSync(targetDir, { recursive: true })
      fs.writeFileSync(path.join(targetDir, storedName), buffer)
    } catch (e: any) {
      console.error("Bug attachment write failed:", { dir: targetDir, code: e?.code, message: e?.message })
      return NextResponse.json(
        {
          error: `Could not save the file to storage (${e?.code || e?.message}). The upload ` +
            `directory "${targetDir}" is not writable — check that the persistent volume is ` +
            `mounted there and writable by the app.`,
          code: e?.code || "WRITE_FAILED",
        },
        { status: 500 }
      )
    }
    const publicPath = `${publicPrefix}/${storedName}`

    const bug = await prisma.$transaction(async (tx) => {
      await tx.bugAttachment.create({
        data: {
          bugId: params.bugId,
          fileName: file.name,
          filePath: publicPath,
          fileType: file.type || ext.replace(".", ""),
          fileSize: file.size
        }
      })

      // First image becomes the primary screenshot; first video becomes the videoUrl.
      const data = isVideo
        ? (existingBug.videoUrl ? {} : { videoUrl: publicPath })
        : (existingBug.screenshotPath ? {} : { screenshotPath: publicPath })
      const updated = await tx.bugReport.update({ where: { id: params.bugId }, data })

      await tx.bugActivity.create({
        data: {
          bugId: params.bugId,
          action: "Attachment Added",
          details: `Uploaded ${isVideo ? "video" : "image"} "${file.name}".`
        }
      })

      return updated
    })

    return NextResponse.json({ bug, filePath: publicPath, kind: isVideo ? "video" : "image" }, { status: 201 })
  } catch (error: any) {
    console.error("POST /api/bug-reports/[bugId]/attachments error:", error)
    return NextResponse.json({ error: error.message || "Failed to upload attachment" }, { status: 500 })
  }
}
