/**
 * A person's decisions on screens: accept, reject, undo, and auto-maintenance
 * (the same decision applied to every other screen showing the same change).
 * Server only.
 *
 * Baseline rules:
 * - Accepting a screen makes its image the approved one for that page +
 *   environment, unless a NEWER capture of the same page already became the
 *   baseline. Approving last Tuesday's picture must not roll back today's.
 * - Every baseline change keeps the previous image, so undo restores it.
 * - Rejecting a screen whose image had become the baseline (a New screen, or one
 *   accepted earlier) puts the previous baseline back.
 */
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { isSameChange } from "./image-diff"
import { asRegions, jsonOrNull, refreshRunTallies } from "./compare-service"
import { isResolvable, type ScreenStatus } from "./status"

export type ReviewAction = "accept" | "reject"
/** none = only this screen; run = same-change screens in this run; test = in every run of the test. */
export type MaintenanceScope = "none" | "run" | "test"

export class ReviewError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

type ScreenRow = Awaited<ReturnType<typeof loadScreen>>

async function loadScreen(id: string) {
  const s = await prisma.visualScreen.findUnique({ where: { id } })
  if (!s) throw new ReviewError("Screen not found", 404)
  return s
}

/** Is there a capture of the same page + environment newer than `screen` that owns the baseline? */
async function newerCaptureOwnsBaseline(screen: NonNullable<ScreenRow>, baseline: { sourceScreenId: string | null } | null) {
  if (!baseline?.sourceScreenId || baseline.sourceScreenId === screen.id) return false
  const owner = await prisma.visualScreen.findUnique({ where: { id: baseline.sourceScreenId }, select: { createdAt: true } })
  return !!owner && owner.createdAt > screen.createdAt
}

async function makeBaseline(screen: NonNullable<ScreenRow>, userId: string | null): Promise<boolean> {
  if (!screen.actualImagePath || !screen.width || !screen.height) return false
  const where = { visualTestId_screenKey_envKey: { visualTestId: screen.visualTestId, screenKey: screen.screenKey, envKey: screen.envKey } }
  const current = await prisma.visualScreenBaseline.findUnique({ where })
  if (current?.sourceScreenId === screen.id) return true
  if (await newerCaptureOwnsBaseline(screen, current)) return false
  if (current) {
    await prisma.visualScreenBaseline.update({
      where: { id: current.id },
      data: {
        previousImagePath: current.imagePath,
        previousWidth: current.width,
        previousHeight: current.height,
        previousDynamicRects: jsonOrNull(current.dynamicRects),
        previousSourceScreenId: current.sourceScreenId,
        imagePath: screen.actualImagePath,
        width: screen.width,
        height: screen.height,
        dynamicRects: jsonOrNull(screen.dynamicRects),
        sourceScreenId: screen.id,
        updatedById: userId,
      },
    })
  } else {
    await prisma.visualScreenBaseline.create({
      data: {
        visualTestId: screen.visualTestId,
        screenKey: screen.screenKey,
        envKey: screen.envKey,
        imagePath: screen.actualImagePath,
        width: screen.width,
        height: screen.height,
        dynamicRects: jsonOrNull(screen.dynamicRects),
        sourceScreenId: screen.id,
        updatedById: userId,
      },
    })
  }
  return true
}

/** If this screen's image is the baseline, put the previous one back (or drop it when there was none). */
async function releaseBaseline(screen: NonNullable<ScreenRow>): Promise<void> {
  const where = { visualTestId_screenKey_envKey: { visualTestId: screen.visualTestId, screenKey: screen.screenKey, envKey: screen.envKey } }
  const current = await prisma.visualScreenBaseline.findUnique({ where })
  if (!current || current.sourceScreenId !== screen.id) return
  if (!current.previousImagePath || !current.previousWidth || !current.previousHeight) {
    await prisma.visualScreenBaseline.delete({ where: { id: current.id } })
    return
  }
  await prisma.visualScreenBaseline.update({
    where: { id: current.id },
    data: {
      imagePath: current.previousImagePath,
      width: current.previousWidth,
      height: current.previousHeight,
      dynamicRects: jsonOrNull(current.previousDynamicRects),
      sourceScreenId: current.previousSourceScreenId,
      previousImagePath: null,
      previousWidth: null,
      previousHeight: null,
      previousDynamicRects: Prisma.DbNull,
      previousSourceScreenId: null,
    },
  })
}

async function applyDecision(
  screen: NonNullable<ScreenRow>,
  action: ReviewAction,
  userId: string | null,
  auto: { fromScreenId: string } | null
): Promise<{ baselineUpdated: boolean }> {
  let baselineUpdated = false
  if (action === "accept") {
    // Accepting a removed page confirms it was meant to go; there is no image to approve.
    if (screen.status !== "Removed") baselineUpdated = await makeBaseline(screen, userId)
  } else {
    await releaseBaseline(screen)
  }
  await prisma.visualScreen.update({
    where: { id: screen.id },
    data: {
      status: action === "accept" ? "Accepted" : "Rejected",
      resolvedById: userId,
      resolvedAt: new Date(),
      resolvedByAuto: !!auto,
      autoFromScreenId: auto?.fromScreenId ?? null,
    },
  })
  return { baselineUpdated }
}

export interface ResolveResult {
  screenId: string
  status: "Accepted" | "Rejected"
  baselineUpdated: boolean
  autoResolved: { id: string; name: string; envName: string; runId: string }[]
}

export async function resolveScreen(opts: {
  screenId: string
  action: ReviewAction
  userId: string | null
  scope: MaintenanceScope
}): Promise<ResolveResult> {
  const screen = await loadScreen(opts.screenId)
  if (!isResolvable(screen.status as ScreenStatus)) {
    throw new ReviewError(
      screen.status === "Error"
        ? "This screen could not be captured, so there is nothing to accept or reject. Fix the page and run the test again."
        : "This screen passed; there is nothing to decide."
    )
  }

  const { baselineUpdated } = await applyDecision(screen, opts.action, opts.userId, null)
  const touchedRuns = new Set<string>([screen.runId])
  const autoResolved: ResolveResult["autoResolved"] = []

  const test = await prisma.visualTest.findUnique({ where: { id: screen.visualTestId }, select: { autoMaintenance: true } })
  const sourceRegions = asRegions(screen.diffRegions)
  if (test?.autoMaintenance && opts.scope !== "none" && sourceRegions.length) {
    const candidates = await prisma.visualScreen.findMany({
      where: {
        visualTestId: screen.visualTestId,
        id: { not: screen.id },
        status: "Unresolved",
        ...(opts.scope === "run" ? { runId: screen.runId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 2000,
    })
    for (const c of candidates) {
      if (!isSameChange(sourceRegions, asRegions(c.diffRegions))) continue
      await applyDecision(c, opts.action, opts.userId, { fromScreenId: screen.id })
      autoResolved.push({ id: c.id, name: c.name, envName: c.envName, runId: c.runId })
      touchedRuns.add(c.runId)
    }
  }

  await refreshRunTallies([...touchedRuns])
  return { screenId: screen.id, status: opts.action === "accept" ? "Accepted" : "Rejected", baselineUpdated, autoResolved }
}

/**
 * Put screens resolved by auto-maintenance back to Unresolved and restore the
 * baselines they had replaced. Only auto decisions can be undone this way — a
 * person's own decision is changed by deciding again.
 */
export async function undoAutoResolutions(screenIds: string[]): Promise<{ undone: number }> {
  const screens = await prisma.visualScreen.findMany({
    where: { id: { in: screenIds }, resolvedByAuto: true, status: { in: ["Accepted", "Rejected"] } },
  })
  const runs = new Set<string>()
  for (const s of screens) {
    if (s.status === "Accepted") await releaseBaseline(s)
    await prisma.visualScreen.update({
      where: { id: s.id },
      data: { status: "Unresolved", resolvedById: null, resolvedAt: null, resolvedByAuto: false, autoFromScreenId: null },
    })
    runs.add(s.runId)
  }
  await refreshRunTallies([...runs])
  return { undone: screens.length }
}
