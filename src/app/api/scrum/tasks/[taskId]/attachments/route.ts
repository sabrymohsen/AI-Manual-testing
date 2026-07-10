import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireTaskOwner, logActivity } from "@/lib/scrum/server"
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "task-attachments")
const memberSelect = { id: true, name: true, email: true, avatarUrl: true } as const

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  const auth = await requireTaskOwner(params.taskId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let file: File | null = null
  try {
    const formData = await request.formData()
    file = formData.get("file") as File | null
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum size is 10 MB." }, { status: 400 })
  }

  const ext = path.extname(file.name)
  const storedName = `${params.taskId}-${randomUUID()}${ext}`
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer)
  const url = `/uploads/task-attachments/${storedName}`

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId: params.taskId,
      name: file.name,
      url,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      uploadedById: auth.userId,
    },
    include: { uploadedBy: { select: memberSelect } },
  })

  await logActivity(params.taskId, "attachment_added", `Attached ${file.name} (${humanSize(file.size)})`, auth.userId)

  return NextResponse.json({ attachment }, { status: 201 })
}
