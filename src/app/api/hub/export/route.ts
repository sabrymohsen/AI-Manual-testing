import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"
import { exportFiles, zipFiles } from "@/lib/hub-export"

export const dynamic = "force-dynamic"

/**
 * GET /api/hub/export?projectId=&folder= — the project's Automation Hub tests
 * (or one folder) as a standalone Playwright project, zipped.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") || ""
  const folder = request.nextUrl.searchParams.get("folder")
  const auth = await requireHubProject(projectId, "read")
  if (!auth.ok) return auth.response

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
  const scripts = await prisma.testScript.findMany({
    where: { projectId, ...(folder !== null ? { folder } : {}) },
    orderBy: [{ folder: "asc" }, { name: "asc" }],
    select: { name: true, folder: true, code: true, mode: true, tags: true },
  })
  if (!scripts.length) return NextResponse.json({ error: "There are no tests to export here" }, { status: 404 })

  const root = `${(project?.name || "qa-engine").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "qa-engine"}-tests`
  const zip = await zipFiles(root, exportFiles(project?.name || "QA Engine", scripts))
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(root)}.zip"; filename*=UTF-8''${encodeURIComponent(root)}.zip`,
      "Cache-Control": "no-store",
    },
  })
}
