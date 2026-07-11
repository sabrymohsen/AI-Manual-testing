import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { logUserActivity } from "@/lib/user-activity"
import { writeFile, mkdir, unlink } from "fs/promises"
import path from "path"

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

// POST /api/me/avatar -> multipart image upload, replaces the user's avatar
export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.session!.user.id

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

  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be 2MB or smaller" }, { status: 400 })
  }

  const dir = path.join(process.cwd(), "public", "uploads", "avatars")
  await mkdir(dir, { recursive: true })

  const filename = `${userId}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(dir, filename), buffer)

  const avatarUrl = `/uploads/avatars/${filename}`

  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })

  await prisma.user.update({ where: { id: userId }, data: { avatarUrl } })

  // Remove the replaced file, but only if it was one of our local uploads.
  const old = previous?.avatarUrl
  if (old && old.startsWith("/uploads/avatars/") && !old.includes("..")) {
    unlink(path.join(process.cwd(), "public", old)).catch(() => {})
  }

  logUserActivity(userId, "FILE_UPLOADED", "Uploaded a new profile photo")

  return NextResponse.json({ avatarUrl })
}
