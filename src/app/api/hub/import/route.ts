import { NextResponse } from "next/server"
import JSZip from "jszip"
import { prisma } from "@/lib/db"
import { requireHubProject } from "@/lib/hub-access"
import { HUB_NAME_PATTERN } from "@/lib/hub-scripts"

export const dynamic = "force-dynamic"

/**
 * POST /api/hub/import (multipart: projectId, file=<zip>) — copy a Playwright
 * project's JavaScript spec files into the Automation Hub as code tests, one per
 * file, keeping their folders. TypeScript specs and helper files are listed as
 * skipped: the hub runs each test as one .spec.js file. (To run a whole project
 * as it is, link it in the desktop app instead.)
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const projectId = String(form?.get("projectId") || "")
  const auth = await requireHubProject(projectId, "write")
  if (!auth.ok) return auth.response
  const file = form?.get("file")
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Choose a .zip file" }, { status: 400 })
  if (file.size > 20_000_000) return NextResponse.json({ error: "The zip is too big (20 MB max)" }, { status: 413 })

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: "That isn't a readable .zip file" }, { status: 400 })
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(node_modules|\.git|test-results|playwright-report)\//.test(f.name))
  const specs = entries.filter((f) => /\.(spec|test)\.(m?js|cjs)$/.test(f.name))
  const skipped = entries.filter((f) => /\.(spec|test)\.(ts|tsx|mts)$/.test(f.name)).map((f) => ({ file: f.name, reason: "TypeScript — link the project in the desktop app to run it as it is" }))
  const imported: { name: string; folder: string }[] = []

  const existing = new Set(
    (await prisma.testScript.findMany({ where: { OR: [{ projectId }, { projectId: null }] }, select: { name: true } })).map((s) => s.name.toLowerCase())
  )
  // Drop a shared top folder ("my-tests/tests/login.spec.js" → "tests/login.spec.js").
  const parts = specs.map((f) => f.name.split("/"))
  const common = parts.length && parts.every((p) => p.length > 1 && p[0] === parts[0][0]) ? 1 : 0

  for (const f of specs.slice(0, 200)) {
    const code = await f.async("string")
    if (code.length > 500_000) {
      skipped.push({ file: f.name, reason: "Larger than 500 KB" })
      continue
    }
    if (/require\(["']\.\.?\/(?!qa-steps)/.test(code) || /from ["']\.\.?\/(?!qa-steps)/.test(code)) {
      skipped.push({ file: f.name, reason: "Uses helper files from the project — link the project in the desktop app instead" })
      continue
    }
    const segs = f.name.split("/").slice(common)
    const fileName = segs.pop()!.replace(/\.(spec|test)\.(m?js|cjs)$/, "")
    const folder = segs.filter((s) => s !== "tests" && s !== "e2e").join("/").slice(0, 80)
    let name = fileName.replace(/[^\p{L}\p{N}\p{M} _-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 70) || "Imported test"
    if (!HUB_NAME_PATTERN.test(name)) name = `Imported ${imported.length + 1}`
    for (let i = 2; existing.has(name.toLowerCase()); i++) name = `${fileName.slice(0, 66)} ${i}`
    existing.add(name.toLowerCase())
    await prisma.testScript.create({ data: { name, type: "Web", code, folder: folder || "Imported", projectId, tags: ["imported"] } })
    imported.push({ name, folder: folder || "Imported" })
  }
  return NextResponse.json({ imported, skipped }, { status: imported.length ? 201 : 200 })
}
