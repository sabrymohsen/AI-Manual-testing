import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject, evidenceInProject } from "@/lib/hub-access"
import { copyPngInto, saveDataUrlPng, pngDimensions, baselineImageUrl } from "@/lib/hub-visual"
import { randomUUID } from "crypto"
import * as fs from "fs"

export const dynamic = "force-dynamic"

// GET /api/hub/visual/baselines?projectId= — the project's baselines (+ filters)
// and the project's evidence screenshots usable as baseline/current sources.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const access = await requireHubProject(sp.get("projectId"), "read")
  if (!access.ok) return access.response
  const projectId = access.projectId

  try {
    const where: any = { projectId }
    if (sp.get("testName")) where.testName = { contains: sp.get("testName"), mode: "insensitive" }
    if (sp.get("browser") && sp.get("browser") !== "all") where.browser = sp.get("browser")

    const baselines = await prisma.visualBaseline.findMany({ where, orderBy: { createdAt: "desc" } })

    // Screenshots from this project's runs only
    const execs = await prisma.testExecution.findMany({
      where: { OR: [{ projectId }, { projectId: null, script: { projectId } }] },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, script: { select: { name: true } } },
    })
    const execMap = new Map(execs.map((e) => [e.id, e]))
    const shots = await prisma.evidenceFile.findMany({
      where: { fileType: "screenshot", testExecutionId: { in: execs.map((e) => e.id) } },
      orderBy: { createdAt: "desc" },
      take: 40,
    })
    const screenshotOptions = shots
      .filter((s) => fs.existsSync(s.filePath))
      .map((s) => ({
        id: s.id,
        testName: execMap.get(s.testExecutionId)?.script?.name || "test",
        stepNumber: s.stepNumber,
        pageUrl: s.pageUrl,
        url: `/api/hub/evidence/${s.id}/file`,
      }))

    return NextResponse.json({
      baselines: baselines.map((b) => ({ ...b, url: baselineImageUrl(b) })),
      browsers: Array.from(new Set(baselines.map((b) => b.browser))).sort(),
      screenshotOptions,
    })
  } catch (err: any) {
    console.error("GET visual baselines error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/hub/visual/baselines — create a baseline in { projectId } from an
// evidence screenshot ({ source:{type:"evidence", evidenceId} }) or an upload
// ({ source:{type:"upload", dataUrl} }).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const access = await requireHubProject(body.projectId, "write")
  if (!access.ok) return access.response

  try {
    const { testName, pageName, browser, viewport, versionTag, provider, source } = body
    if (!testName || !source?.type) {
      return NextResponse.json({ error: "testName and source are required" }, { status: 400 })
    }

    const baseName = randomUUID()
    let filePath: string
    if (source.type === "evidence") {
      const ev = await evidenceInProject(String(source.evidenceId || ""), access.projectId)
      if (!ev || !fs.existsSync(ev.filePath)) {
        return NextResponse.json({ error: "Evidence screenshot not found" }, { status: 404 })
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
        projectId: access.projectId,
        testName,
        pageName: pageName || "",
        browser: browser || "chrome",
        viewport: viewport || (dims ? `${dims.width}x${dims.height}` : ""),
        filePath,
        versionTag: versionTag || "",
        provider: provider || "shaft-opencv",
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      },
    })

    return NextResponse.json({ baseline: { ...baseline, url: baselineImageUrl(baseline) } }, { status: 201 })
  } catch (err: any) {
    console.error("POST visual baseline error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
