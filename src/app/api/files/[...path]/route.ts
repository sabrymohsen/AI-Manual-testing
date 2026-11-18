import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, canUseProject } from "@/lib/api-guards"
import fs from "node:fs"
import path from "node:path"
import { resolveStoredFile, storageSegments } from "@/lib/storage/resolve-file"

/**
 * GET /api/files/<path>
 *
 * Streams a stored file (screenshots, recordings, BRDs, …) to a signed-in user.
 *
 * SECURITY: the file must resolve inside a storage root (see
 * resolveStoredFile). This route used to fall back to "/<path>" and
 * "<cwd>/<path>", so any signed-in user could read /api/files/.env or any
 * absolute path on the server.
 */

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".ogg": "video/ogg",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".md": "text/markdown",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
}

export async function GET(_request: Request, { params }: { params: { path: string[] } }) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const filePath = resolveStoredFile(params.path)
  if (!filePath) return new NextResponse("File not found", { status: 404 })

  // BRDs are stored as brds/<projectId>/… — only that project's members may read them.
  const parts = storageSegments(filePath)
  if (parts[0] === "brds" && parts[1]) {
    if (!(await canUseProject(parts[1], auth.session!.user.id, "read"))) {
      return new NextResponse("File not found", { status: 404 })
    }
  }

  try {
    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        // Never let a stored file be sniffed into something executable.
        "X-Content-Type-Options": "nosniff",
        // Revalidate every load. These files were historically served "immutable"
        // for a year while filenames collided across runs, so browsers kept showing
        // stale/wrong screenshots even after the file changed on disk.
        "Cache-Control": "no-cache, must-revalidate",
      },
    })
  } catch {
    return new NextResponse("File not found", { status: 404 })
  }
}
