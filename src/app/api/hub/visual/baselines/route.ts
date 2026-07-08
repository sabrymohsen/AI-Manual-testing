import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { copyPngInto, saveDataUrlPng, pngDimensions, toPublicUrl } from "@/lib/hub-visual"
import { randomUUID } from "crypto"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/visual/baselines — list baselines (+ filters) and evidence
// screenshots available as baseline/current sources.
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const sp = request.nextUrl.searchParams
    const where: any = {}
    if (sp.get("testName")) where.testName = { contains: sp.get("testName"), mode: "insensitive" }
    if (sp.get("browser") && sp.get("browser") !== "all") where.browser = sp.get("browser")

    const baselines = await prisma.visualBaseline.findMany({ where, orderBy: { createdAt: "desc" } })

    // Evidence screenshots that can seed a baseline or act as the "current" image
    const shots = await prisma.evidenceFile.findMany({
      where: { fileType: "screenshot" },
      orderBy: { createdAt: "desc" },
      take: 40
    })
    const execIds = Array.from(new Set(shots.map((s) => s.testExecutionId)))
    const execs = await prisma.testExecution.findMany({
      where: { id: { in: execIds } },
      include: { script: { select: { name: true } } }
    })
    const execMap = new Map(execs.map((e) => [e.id, e]))
    const screenshotOptions = shots
      .filter((s) => fs.existsSync(s.filePath))
      .map((s) => ({
        id: s.id,
        testName: execMap.get(s.testExecutionId)?.script?.name || "test",
        stepNumber: s.stepNumber,
        pageUrl: s.pageUrl,
        url: `/api/hub/evidence/${s.id}/file`
      }))

    return NextResponse.json({
      baselines: baselines.map((b) => ({ ...b, url: toPublicUrl(b.filePath) })),
      browsers: Array.from(new Set(baselines.map((b) => b.browser))).sort(),
      screenshotOptions
    })
  } catch (err: any) {
    console.error("GET visual baselines error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/hub/visual/baselines — create a baseline from an evidence
// screenshot ({ source:{type:"evidence", evidenceId} }) or an upload
// ({ source:{type:"upload", dataUrl} }).
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const { testName, pageName, browser, viewport, versionTag, provider, source } = body
    if (!testName || !source?.type) {
      return NextResponse.json({ error: "testName and source are required" }, { status: 400 })
    }

    const baseName = randomUUID()
    let filePath: string
    if (source.type === "evidence") {
      const ev = await prisma.evidenceFile.findUnique({ where: { id: source.evidenceId } })
      if (!ev || !fs.existsSync(ev.filePath)) {
        return NextResponse.json({ error: "Evidence screenshot not found on disk" }, { status: 404 })
      }
      filePath = copyPngInto(ev.filePath, "baselines", baseName)
    } else if (source.type === "upload") {
      filePath = saveDataUrlPng(source.dataUrl, "baselines", baseName)
    } else {
      return NextResponse.json({ error: "Unsupported source type" }, { status: 400 })
    }

    const dims = pngDimensions(filePath)
    const baseline = await prisma.visualBaseline.create({
      data: {
        testName,
        pageName: pageName || "",
        browser: browser || "chrome",
        viewport: viewport || (dims ? `${dims.width}x${dims.height}` : ""),
        filePath,
        versionTag: versionTag || "",
        provider: provider || "shaft-opencv",
        width: dims?.width ?? null,
        height: dims?.height ?? null
      }
    })

    return NextResponse.json({ baseline: { ...baseline, url: toPublicUrl(baseline.filePath) } }, { status: 201 })
  } catch (err: any) {
    console.error("POST visual baseline error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
