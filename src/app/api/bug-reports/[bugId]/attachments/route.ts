import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, notFoundResponse, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

const MAX_IMAGE_SIZE = 15 * 1024 * 1024 // 15 MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200 MB
const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"]
const ALLOWED_VIDEO_EXTENSIONS = [".webm", ".mp4", ".mov", ".m4v", ".ogg"]
const IMAGE_DIR = path.join(process.cwd(), "public", "uploads", "bug-screenshots")
const VIDEO_DIR = path.join(process.cwd(), "public", "uploads", "bug-videos")

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
          where: { filePath, session: { project: { userId: auth.session!.user.id } } },
          select: { id: true },
        }),
        prisma.sessionRecording.findFirst({
          where: { filePath, session: { project: { userId: auth.session!.user.id } } },
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

      const sourcePath = path.resolve(process.cwd(), filePath)
      if (!fs.existsSync(sourcePath)) {
        return notFoundResponse("Artifact file not found on disk")
      }

      const targetDir = artifactIsVideo ? VIDEO_DIR : IMAGE_DIR
      const publicPrefix = artifactIsVideo ? "/uploads/bug-videos" : "/uploads/bug-screenshots"
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

    // Persist under public/ so the stored path can be served directly as a static asset.
    const targetDir = isVideo ? VIDEO_DIR : IMAGE_DIR
    const publicPrefix = isVideo ? "/uploads/bug-videos" : "/uploads/bug-screenshots"
    fs.mkdirSync(targetDir, { recursive: true })
    const storedName = `${params.bugId}-${randomUUID()}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(path.join(targetDir, storedName), buffer)
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
