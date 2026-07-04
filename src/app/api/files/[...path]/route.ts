import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import fs from "node:fs"
import path from "node:path"

const STORAGE_ROOT = process.env.STORAGE_ROOT || "./storage"

export async function GET(
  _request: Request,
  { params }: { params: { path: string[] } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  // Resolve absolute workspace directory
  const workspaceRoot = process.cwd()

  // Try different ways to locate the file:
  // 1. Directly under STORAGE_ROOT
  let filePath = path.join(STORAGE_ROOT, ...params.path)

  if (!fs.existsSync(filePath)) {
    // 2. As an absolute path (reconstructing the leading slash)
    const absolutePath = "/" + params.path.join("/")
    if (fs.existsSync(absolutePath)) {
      filePath = absolutePath
    } else {
      // 3. Under the workspace root directly
      const workspacePath = path.join(workspaceRoot, ...params.path)
      if (fs.existsSync(workspacePath)) {
        filePath = workspacePath
      } else {
        // 4. Try stripping a duplicate "storage" prefix if it exists
        const cleanedPath = params.path.filter((p, i) => !(p === "storage" && i === 0))
        const altPath = path.join(STORAGE_ROOT, ...cleanedPath)
        if (fs.existsSync(altPath)) {
          filePath = altPath
        }
      }
    }
  }

  try {
    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()

    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".webm": "video/webm",
      ".mp4": "video/mp4",
      ".pdf": "application/pdf",
      ".zip": "application/zip",
      ".md": "text/markdown",
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
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
