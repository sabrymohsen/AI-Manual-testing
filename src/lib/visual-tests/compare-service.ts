/**
 * Compare a captured screen with its approved baseline, and re-compare an
 * existing screen after its ignore regions change. Server/worker only.
 *
 * Shared by the worker (new screens) and the review routes (a person drew or
 * removed an ignore region), so a region behaves the same whether it existed
 * before the run or was added while reviewing it.
 */
import fs from "node:fs/promises"
import { PNG } from "pngjs"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { saveFile } from "@/lib/storage"
import { compareImages, renderDiffOverlay, type DiffRegion, type MatchLevel, type Rect } from "./image-diff"
import { runOutcome, tallyScreens, type ScreenStatus } from "./status"

/** Nullable Json columns: Prisma needs DbNull to write SQL NULL, and `undefined` would leave a stale value. */
export function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue)
}

export async function readPng(filePath: string): Promise<PNG> {
  return PNG.sync.read(await fs.readFile(filePath))
}

export function asRects(value: unknown): Rect[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(r => r && typeof r === "object")
    .map((r: any) => ({ x: Number(r.x), y: Number(r.y), width: Number(r.width), height: Number(r.height) }))
    .filter(r => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0)
}

export function asRegions(value: unknown): DiffRegion[] {
  if (!Array.isArray(value)) return []
  return value.filter((r: any) => r && typeof r.hashBase === "string" && typeof r.hashActual === "string") as DiffRegion[]
}

export interface RegionRow {
  screenKey: string | null
  envKey: string | null
  x: number
  y: number
  width: number
  height: number
}

/** Regions that apply to this page + environment (null on a region means "all"). */
export function regionsFor(regions: RegionRow[], screenKey: string, envKey: string): Rect[] {
  return regions
    .filter(r => (r.screenKey === null || r.screenKey === screenKey) && (r.envKey === null || r.envKey === envKey))
    .map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }))
}

export interface Evaluation {
  status: Extract<ScreenStatus, "New" | "Passed" | "Unresolved">
  baselineImagePath: string | null
  diffImagePath: string | null
  mismatchPercent: number | null
  diffRegions: DiffRegion[] | null
  width: number
  height: number
}

/**
 * Judge `actual` against the baseline image. With no baseline the screen is New
 * and the caller records it as the baseline.
 */
export async function evaluateScreen(opts: {
  visualTestId: string
  diffFileStem: string
  actual: PNG
  baseline: { imagePath: string; dynamicRects: unknown } | null
  dynamicRects: Rect[] | null
  matchLevel: MatchLevel
  regions: Rect[]
}): Promise<Evaluation> {
  if (!opts.baseline) {
    return {
      status: "New",
      baselineImagePath: null,
      diffImagePath: null,
      mismatchPercent: null,
      diffRegions: null,
      width: opts.actual.width,
      height: opts.actual.height,
    }
  }

  let baselinePng: PNG
  try {
    baselinePng = await readPng(opts.baseline.imagePath)
  } catch {
    // The approved image is gone from disk (storage wiped). Treat as a first
    // sighting rather than failing every screen of the run.
    return {
      status: "New",
      baselineImagePath: null,
      diffImagePath: null,
      mismatchPercent: null,
      diffRegions: null,
      width: opts.actual.width,
      height: opts.actual.height,
    }
  }

  const ignore = [...opts.regions]
  if (opts.matchLevel === "Dynamic") {
    // Mask dynamic text found on EITHER side: a date on the old page and a
    // different-length date on the new one occupy different boxes.
    ignore.push(...(opts.dynamicRects ?? []), ...asRects(opts.baseline.dynamicRects))
  }

  const result = compareImages(baselinePng, opts.actual, { matchLevel: opts.matchLevel, ignore })
  let diffImagePath: string | null = null
  if (result.diff) {
    const overlay = renderDiffOverlay(opts.actual, result.diff)
    diffImagePath = await saveFile("visual-tests", `${opts.visualTestId}/${opts.diffFileStem}-diff-${Date.now()}.png`, PNG.sync.write(overlay))
  }
  return {
    status: result.regions.length ? "Unresolved" : "Passed",
    baselineImagePath: opts.baseline.imagePath,
    diffImagePath,
    mismatchPercent: result.mismatchPercent,
    diffRegions: result.regions,
    width: result.width,
    height: result.height,
  }
}

/**
 * Re-run the comparison for screens whose ignore regions changed. Only screens
 * still waiting (Unresolved) or passed on the current rules (Passed) move; a
 * person's decision (Accepted/Rejected) is never overturned by a region.
 */
export async function recompareScreens(screenIds: string[]): Promise<{ id: string; status: string }[]> {
  if (!screenIds.length) return []
  const screens = await prisma.visualScreen.findMany({
    where: { id: { in: screenIds }, status: { in: ["Unresolved", "Passed"] }, actualImagePath: { not: null }, baselineImagePath: { not: null } },
    include: { run: { select: { matchLevel: true } } },
  })
  if (!screens.length) return []
  const visualTestIds = [...new Set(screens.map(s => s.visualTestId))]
  const regionRows = await prisma.visualTestRegion.findMany({ where: { visualTestId: { in: visualTestIds } } })
  // A baseline image is always some earlier screen's capture, so that screen's
  // own dynamic-text boxes are the ones that belong to the image — even after
  // the baseline row has since moved on to a newer picture.
  const sources = await prisma.visualScreen.findMany({
    where: { visualTestId: { in: visualTestIds }, actualImagePath: { in: screens.map(s => s.baselineImagePath!) } },
    select: { actualImagePath: true, dynamicRects: true },
  })

  const out: { id: string; status: string }[] = []
  const touchedRuns = new Set<string>()
  for (const s of screens) {
    let actual: PNG
    try {
      actual = await readPng(s.actualImagePath!)
    } catch {
      continue
    }
    const regions = regionsFor(
      regionRows.filter(r => r.visualTestId === s.visualTestId),
      s.screenKey,
      s.envKey
    )
    const evaluation = await evaluateScreen({
      visualTestId: s.visualTestId,
      diffFileStem: s.id,
      actual,
      baseline: {
        imagePath: s.baselineImagePath!,
        dynamicRects: sources.find(src => src.actualImagePath === s.baselineImagePath)?.dynamicRects ?? null,
      },
      dynamicRects: asRects(s.dynamicRects),
      matchLevel: s.run.matchLevel,
      regions,
    })
    await prisma.visualScreen.update({
      where: { id: s.id },
      data: {
        status: evaluation.status === "New" ? s.status : evaluation.status,
        diffImagePath: evaluation.diffImagePath,
        mismatchPercent: evaluation.mismatchPercent,
        diffRegions: jsonOrNull(evaluation.diffRegions),
      },
    })
    out.push({ id: s.id, status: evaluation.status })
    touchedRuns.add(s.runId)
  }
  await refreshRunTallies([...touchedRuns])
  return out
}

/** Recount a run's screens and outcome from the rows themselves. */
export async function refreshRunTallies(runIds: string[]): Promise<void> {
  for (const runId of runIds) {
    const rows = await prisma.visualScreen.findMany({ where: { runId }, select: { status: true } })
    const t = tallyScreens(rows.map(r => r.status as ScreenStatus))
    const run = await prisma.visualTestRun.findUnique({ where: { id: runId }, select: { status: true } })
    if (!run) continue
    await prisma.visualTestRun.update({
      where: { id: runId },
      data: {
        passedCount: t.passed,
        unresolvedCount: t.unresolved + t.removed,
        failedCount: t.failed,
        newCount: t.new,
        // A run still capturing has no verdict yet.
        outcome: run.status === "Running" || run.status === "Queued" ? null : runOutcome(t),
      },
    })
  }
}
