/**
 * "Visually check this screen" inside a test case. Server/worker only.
 *
 * A test case gets one Flow visual test (created on its first checkpoint) and
 * each functional test run gets one visual run, so checkpoints land in the same
 * review screens as whole-site tests: the same baselines, ignore regions,
 * accept/reject and auto-maintenance. A checkpoint never fails the step — a
 * visual difference is something to review, and the run's visual result says so.
 */
import { PNG } from "pngjs"
import type { Page } from "playwright"
import { prisma } from "@/lib/db"
import { saveFile } from "@/lib/storage"
import { collectDynamicRects, settlePage } from "./capture"
import { evaluateScreen, jsonOrNull, refreshRunTallies, regionsFor } from "./compare-service"
import { environmentKey, sanitizeEnvironments, type VisualEnvironment } from "./environments"
import { runOutcome, tallyScreens, type ScreenStatus } from "./status"

async function ensureFlowTest(projectId: string, testCaseId: string, env: VisualEnvironment, startUrl: string) {
  const existing = await prisma.visualTest.findUnique({ where: { testCaseId } })
  if (existing) {
    const envs = sanitizeEnvironments(existing.environments)
    if (!envs.some(e => e.key === env.key)) {
      await prisma.visualTest.update({ where: { id: existing.id }, data: { environments: [...envs, env] as any } })
    }
    return existing
  }
  const tc = await prisma.testCase.findUnique({ where: { id: testCaseId }, select: { title: true, suiteId: true } })
  try {
    return await prisma.visualTest.create({
      data: {
        projectId,
        testCaseId,
        name: tc?.title ? `${tc.title} — checkpoints` : "Test case checkpoints",
        type: "Flow",
        startUrl,
        environments: [env] as any,
        suiteId: tc?.suiteId ?? null,
      },
    })
  } catch {
    // Two checkpoints racing to create the same test: the unique testCaseId lets one win.
    return (await prisma.visualTest.findUnique({ where: { testCaseId } }))!
  }
}

async function ensureRun(test: { id: string; projectId: string; matchLevel: any; captureType: any }, testRunId: string | null, env: VisualEnvironment) {
  if (testRunId) {
    const found = await prisma.visualTestRun.findFirst({ where: { visualTestId: test.id, testRunId } })
    if (found) return found
  }
  return prisma.visualTestRun.create({
    data: {
      visualTestId: test.id,
      projectId: test.projectId,
      testRunId,
      status: "Running",
      startedAt: new Date(),
      environments: [env] as any,
      matchLevel: test.matchLevel,
      captureType: test.captureType,
    },
  })
}

export async function captureFlowCheckpoint(
  page: Page,
  opts: { projectId: string; testCaseId: string; testRunId: string | null; stepId: string; name: string | null; fullPage: boolean | null }
): Promise<{ status: ScreenStatus; screenId: string }> {
  const viewport = page.viewportSize() || { width: 1280, height: 720 }
  const browserName = page.context().browser()?.browserType().name() as "chromium" | "firefox" | "webkit" | undefined
  const browser = browserName === "firefox" || browserName === "webkit" ? browserName : "chromium"
  const env: VisualEnvironment = {
    key: environmentKey({ browser, width: viewport.width, height: viewport.height }),
    name: `${browser === "chromium" ? "Chrome" : browser === "firefox" ? "Firefox" : "Safari (WebKit)"} · ${viewport.width}×${viewport.height}`,
    browser,
    width: viewport.width,
    height: viewport.height,
    device: null,
  }

  const test = await ensureFlowTest(opts.projectId, opts.testCaseId, env, page.url())
  const run = await ensureRun(test, opts.testRunId, env)
  const captureType = opts.fullPage === null ? test.captureType : opts.fullPage ? "FullPage" : "Viewport"
  const screenKey = `step:${opts.stepId}`

  await settlePage(page, captureType)
  const dynamicRects = test.matchLevel === "Dynamic" ? await collectDynamicRects(page, captureType) : null
  const png = await page.screenshot({ type: "png", fullPage: captureType === "FullPage", animations: "disabled", caret: "hide", timeout: 60_000 })
  const actual = PNG.sync.read(png)

  const [baseline, regions] = await Promise.all([
    prisma.visualScreenBaseline.findUnique({ where: { visualTestId_screenKey_envKey: { visualTestId: test.id, screenKey, envKey: env.key } } }),
    prisma.visualTestRegion.findMany({ where: { visualTestId: test.id } }),
  ])

  const screen = await prisma.visualScreen.create({
    data: {
      runId: run.id,
      visualTestId: test.id,
      name: opts.name || `Step checkpoint (${new URL(page.url()).pathname})`,
      screenKey,
      url: page.url(),
      stepId: opts.stepId,
      envKey: env.key,
      envName: env.name,
      browser,
      viewport: `${viewport.width}x${viewport.height}`,
      status: "Unresolved",
      diffState: baseline ? "Existing" : "Added",
    },
  })
  const actualImagePath = await saveFile("visual-tests", `${test.id}/${run.id}/${screen.id}.png`, png)
  const evaluation = await evaluateScreen({
    visualTestId: test.id,
    diffFileStem: screen.id,
    actual,
    baseline,
    dynamicRects,
    matchLevel: test.matchLevel,
    regions: regionsFor(regions, screenKey, env.key),
  })
  await prisma.visualScreen.update({
    where: { id: screen.id },
    data: {
      status: evaluation.status,
      actualImagePath,
      baselineImagePath: evaluation.baselineImagePath,
      diffImagePath: evaluation.diffImagePath,
      mismatchPercent: evaluation.mismatchPercent,
      diffRegions: jsonOrNull(evaluation.diffRegions),
      dynamicRects: jsonOrNull(dynamicRects),
      width: actual.width,
      height: actual.height,
    },
  })
  if (evaluation.status === "New") {
    await prisma.visualScreenBaseline.upsert({
      where: { visualTestId_screenKey_envKey: { visualTestId: test.id, screenKey, envKey: env.key } },
      create: { visualTestId: test.id, screenKey, envKey: env.key, imagePath: actualImagePath, width: actual.width, height: actual.height, dynamicRects: jsonOrNull(dynamicRects), sourceScreenId: screen.id },
      update: { imagePath: actualImagePath, width: actual.width, height: actual.height, dynamicRects: jsonOrNull(dynamicRects), sourceScreenId: screen.id },
    })
  }
  await prisma.visualTestRun.update({ where: { id: run.id }, data: { totalScreens: { increment: 1 }, doneScreens: { increment: 1 } } })
  return { status: evaluation.status, screenId: screen.id }
}

/** Close the visual run of a functional test run once its steps are done. Safe to call when there were no checkpoints. */
export async function finishFlowCheckpoints(testRunId: string, cancelled = false): Promise<{ runId: string; unresolved: number } | null> {
  const run = await prisma.visualTestRun.findFirst({ where: { testRunId, status: "Running" } })
  if (!run) return null
  const rows = await prisma.visualScreen.findMany({ where: { runId: run.id }, select: { status: true } })
  const tally = tallyScreens(rows.map(r => r.status as ScreenStatus))
  await prisma.visualTestRun.update({
    where: { id: run.id },
    data: { status: cancelled ? "Cancelled" : "Completed", completedAt: new Date(), outcome: runOutcome(tally) },
  })
  await refreshRunTallies([run.id])
  return { runId: run.id, unresolved: tally.unresolved }
}
