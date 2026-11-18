import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubProject, requireVisualBaseline, evidenceInProject } from "@/lib/hub-access"
import { copyPngInto, saveDataUrlPng, computeDiff, baselineImageUrl, comparisonImageUrl } from "@/lib/hub-visual"
import { randomUUID } from "crypto"
import * as fs from "fs"
import * as path from "path"

export const dynamic = "force-dynamic"

function hydrate(c: any, baseline?: any) {
  return {
    ...c,
    currentUrl: c.currentFilePath ? comparisonImageUrl(c, "current") : null,
    diffUrl: c.diffFilePath ? comparisonImageUrl(c, "diff") : null,
    baselineUrl: baseline ? baselineImageUrl(baseline) : c.baseline ? baselineImageUrl(c.baseline) : null
  }
}

// GET /api/hub/visual/comparisons?baselineId= | ?projectId= — comparison history
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const baselineId = sp.get("baselineId")
  let where: any
  if (baselineId) {
    const access = await requireVisualBaseline(baselineId, "read")
    if (!access.ok) return access.response
    where = { baselineId }
  } else {
    const access = await requireHubProject(sp.get("projectId"), "read")
    if (!access.ok) return access.response
    where = { baseline: { projectId: access.projectId } }
  }

  try {
    const comparisons = await prisma.visualComparison.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { baseline: true }
    })
    return NextResponse.json({ comparisons: comparisons.map((c) => hydrate(c)) })
  } catch (err: any) {
    console.error("GET visual comparisons error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/hub/visual/comparisons — run a visual comparison.
// body: { baselineId, current:{type:"evidence"|"upload", evidenceId|dataUrl},
//         threshold, colorSensitivity, ignoreAntiAliasing, ignoreRegions }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const access = await requireVisualBaseline(body.baselineId, "write")
  if (!access.ok) return access.response
  const baseline = access.baseline

  try {
    const { current, threshold, colorSensitivity, ignoreAntiAliasing, ignoreRegions } = body

    if (!fs.existsSync(baseline.filePath)) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 })
    }

    // Resolve the "current" image into the store
    const baseName = randomUUID()
    let currentPath: string
    if (current?.type === "evidence") {
      const ev = baseline.projectId ? await evidenceInProject(String(current.evidenceId || ""), baseline.projectId) : null
      if (!ev || !fs.existsSync(ev.filePath)) {
        return NextResponse.json({ error: "Current screenshot not found" }, { status: 404 })
      }
      currentPath = copyPngInto(ev.filePath, "current", baseName)
    } else if (current?.type === "upload") {
      currentPath = saveDataUrlPng(current.dataUrl, "current", baseName)
    } else {
      return NextResponse.json({ error: "current image source required" }, { status: 400 })
    }

    const thresholdPct = typeof threshold === "number" ? threshold : 5
    const diffOutPath = path.join(path.dirname(path.dirname(currentPath)), "diffs", path.basename(currentPath)).replace(/\.png$/, "-diff.png")

    const result = computeDiff(baseline.filePath, currentPath, diffOutPath, {
      colorSensitivity,
      ignoreAntiAliasing,
      ignoreRegions: Array.isArray(ignoreRegions) ? ignoreRegions : []
    })

    const status = result.diffScore <= thresholdPct ? "pass" : "fail"

    const comparison = await prisma.visualComparison.create({
      data: {
        baselineId: baseline.id,
        currentFilePath: currentPath,
        diffFilePath: result.diffPath,
        diffScore: Math.round(result.diffScore * 100) / 100,
        threshold: thresholdPct,
        status,
        provider: baseline.provider,
        dimensionMismatch: result.dimensionMismatch
      }
    })

    return NextResponse.json({ comparison: hydrate(comparison, baseline), result }, { status: 201 })
  } catch (err: any) {
    console.error("POST visual comparison error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
