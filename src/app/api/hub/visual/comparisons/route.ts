import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { copyPngInto, saveDataUrlPng, computeDiff, toPublicUrl } from "@/lib/hub-visual"
import { randomUUID } from "crypto"
import * as fs from "fs"

export const dynamic = "force-dynamic"

function hydrate(c: any, baseline?: any) {
  return {
    ...c,
    currentUrl: c.currentFilePath ? toPublicUrl(c.currentFilePath) : null,
    diffUrl: c.diffFilePath ? toPublicUrl(c.diffFilePath) : null,
    baselineUrl: baseline ? toPublicUrl(baseline.filePath) : c.baseline ? toPublicUrl(c.baseline.filePath) : null
  }
}

// GET /api/hub/visual/comparisons[?baselineId=] — comparison history
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const baselineId = request.nextUrl.searchParams.get("baselineId") || undefined
    const comparisons = await prisma.visualComparison.findMany({
      where: baselineId ? { baselineId } : {},
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
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json().catch(() => ({}))
    const { baselineId, current, threshold, colorSensitivity, ignoreAntiAliasing, ignoreRegions } = body

    const baseline = await prisma.visualBaseline.findUnique({ where: { id: baselineId } })
    if (!baseline || !fs.existsSync(baseline.filePath)) {
      return NextResponse.json({ error: "Baseline not found" }, { status: 404 })
    }

    // Resolve the "current" image into the store
    const baseName = randomUUID()
    let currentPath: string
    if (current?.type === "evidence") {
      const ev = await prisma.evidenceFile.findUnique({ where: { id: current.evidenceId } })
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
    const diffOutPath = currentPath.replace("/current/", "/diffs/").replace(/\.png$/, "-diff.png")

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
