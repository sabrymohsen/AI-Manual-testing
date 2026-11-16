/**
 * Execute one visual test run: work out which pages to capture, capture each on
 * every environment, compare with the approved baselines, record the screens.
 * Worker only.
 *
 * Failure policy: one page that will not load is an Error screen, not a failed
 * run; one browser that will not launch fails that environment's screens with
 * the reason, not the run. The run itself fails only when nothing can proceed
 * (the test was deleted, the database is gone).
 */
import { PNG } from "pngjs"
import type { Browser, BrowserContext } from "playwright"
import { prisma } from "@/lib/db"
import { saveFile } from "@/lib/storage"
import { decryptSecret } from "@/lib/crypto"
import { handleLogin } from "@/lib/playwright/login-handler"
import { isVisualTestCancelSignalSet } from "@/lib/queue"
import { captureScreen, launchBrowser, newEnvironmentContext, openPage } from "./capture"
import { discoverSitePages } from "./discovery"
import { evaluateScreen, jsonOrNull, refreshRunTallies, regionsFor } from "./compare-service"
import { sanitizeEnvironments, type VisualBrowser, type VisualEnvironment } from "./environments"
import { activePages, planPageSync } from "./page-sync"
import { runOutcome, tallyScreens, type ScreenStatus } from "./status"

const PAGES_IN_PARALLEL = 2

async function mapLimit<T>(items: T[], limit: number, fn: (_item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++]
        await fn(item)
      }
    })
  )
}

export async function runVisualTestRun(runId: string): Promise<void> {
  const run = await prisma.visualTestRun.findUnique({
    where: { id: runId },
    include: { visualTest: { include: { credential: true } } },
  })
  if (!run) throw new Error(`Visual test run ${runId} not found`)
  if (run.status === "Cancelled") return
  const test = run.visualTest
  if (test.type === "Flow") throw new Error("Flow checkpoints are captured by the test run, not by this worker")

  await prisma.visualTestRun.update({ where: { id: runId }, data: { status: "Running", startedAt: new Date(), error: null } })

  try {
    const environments = sanitizeEnvironments(run.environments)
    if (!environments.length) throw new Error("This test has no browsers or screen sizes selected.")

    // ── 1. Which pages ────────────────────────────────────────────────────────
    let addedPages = 0
    let removedPageIds: string[] = []
    const notes: string[] = []
    if (test.type === "FullWebsite") {
      const existing = await prisma.visualTestPage.findMany({ where: { visualTestId: test.id }, orderBy: { createdAt: "asc" } })
      const discovery = await discoverSitePages({ startUrl: test.startUrl, sitemapUrl: test.sitemapUrl, maxUrls: test.maxUrls * 2, budgetMs: 90_000 })
      const plan = planPageSync(existing, discovery.pages, test.excludedFolders, test.maxUrls)
      if (plan.discoveryFailed || discovery.method === "none") {
        notes.push("The sitemap could not be read this time, so the saved page list was used and no page was reported as removed.")
      } else {
        const now = new Date()
        if (plan.create.length) {
          await prisma.visualTestPage.createMany({
            data: plan.create.map(c => ({
              visualTestId: test.id,
              url: c.url,
              urlKey: c.key,
              folder: c.folder,
              source: discovery.method === "sitemap" ? "sitemap" : "crawl",
              excluded: c.excluded,
            })),
            skipDuplicates: true,
          })
          addedPages = plan.create.filter(c => !c.excluded).length
        }
        if (plan.seen.length) {
          await prisma.visualTestPage.updateMany({ where: { id: { in: plan.seen } }, data: { lastSeenAt: now, removedAt: null } })
        }
        if (plan.removed.length) {
          await prisma.visualTestPage.updateMany({ where: { id: { in: plan.removed } }, data: { removedAt: now } })
          removedPageIds = plan.removed
        }
      }
    }

    const allPages = await prisma.visualTestPage.findMany({ where: { visualTestId: test.id }, orderBy: { createdAt: "asc" } })
    const pages = activePages(allPages, test.excludedFolders, test.maxUrls)
    if (!pages.length) throw new Error("No pages are selected for this test.")

    const [baselines, regions] = await Promise.all([
      prisma.visualScreenBaseline.findMany({ where: { visualTestId: test.id } }),
      prisma.visualTestRegion.findMany({ where: { visualTestId: test.id } }),
    ])
    const baselineOf = (screenKey: string, envKey: string) => baselines.find(b => b.screenKey === screenKey && b.envKey === envKey) ?? null

    // ── 2. Removed pages become Removed screens where something was approved ──
    const removedPages = allPages.filter(p => removedPageIds.includes(p.id))
    const removedScreens = removedPages.flatMap(p =>
      environments
        .filter(env => baselineOf(p.urlKey, env.key))
        .map(env => ({
          runId,
          visualTestId: test.id,
          pageId: p.id,
          name: p.url,
          screenKey: p.urlKey,
          url: p.url,
          envKey: env.key,
          envName: env.name,
          browser: env.browser,
          viewport: `${env.width}x${env.height}`,
          status: "Removed" as const,
          diffState: "Removed" as const,
          baselineImagePath: baselineOf(p.urlKey, env.key)!.imagePath,
          errorMessage: "This page is no longer in the sitemap.",
        }))
    )
    if (removedScreens.length) await prisma.visualScreen.createMany({ data: removedScreens })

    const total = pages.length * environments.length
    await prisma.visualTestRun.update({
      where: { id: runId },
      data: {
        totalScreens: total,
        addedPages,
        removedPages: removedPages.length,
        error: notes.length ? notes.join(" ") : null,
      },
    })

    // ── 3. Capture ────────────────────────────────────────────────────────────
    let password: string | null = null
    if (test.credential) {
      try {
        password = decryptSecret({
          encrypted: test.credential.encryptedPassword,
          iv: test.credential.encryptionIv,
          authTag: test.credential.encryptionAuthTag,
          keyVersion: test.credential.keyVersion,
        })
      } catch (err: any) {
        notes.push(`The saved login could not be decrypted (${err?.message || err}); pages were opened signed out.`)
      }
    }

    const browsers = new Map<VisualBrowser, Browser>()
    let cancelled = false
    try {
      for (const env of environments) {
        if (cancelled) break
        let context: BrowserContext | null = null
        let envError: string | null = null
        try {
          let browser = browsers.get(env.browser)
          if (!browser) {
            browser = await launchBrowser(env.browser)
            browsers.set(env.browser, browser)
          }
          context = await newEnvironmentContext(browser, env)
          if (test.credential && password) {
            const loginPage = await context.newPage()
            try {
              await handleLogin(loginPage, {
                url: test.credential.loginUrl || test.startUrl,
                username: test.credential.username,
                password,
              })
            } catch (err: any) {
              notes.push(`Signing in on ${env.name} failed: ${String(err?.message || err).split("\n")[0]}`)
            } finally {
              await loginPage.close().catch(() => {})
            }
          }
        } catch (err: any) {
          envError = String(err?.message || err)
        }

        await mapLimit(pages, PAGES_IN_PARALLEL, async page => {
          if (cancelled) return
          if (await isVisualTestCancelSignalSet(runId)) {
            cancelled = true
            return
          }
          await captureOne({ runId, test, env, page, context, envError, baseline: baselineOf(page.urlKey, env.key), regions })
        })
        await context?.close().catch(() => {})
      }
    } finally {
      for (const b of browsers.values()) await b.close().catch(() => {})
    }

    // ── 4. Verdict ────────────────────────────────────────────────────────────
    const rows = await prisma.visualScreen.findMany({ where: { runId }, select: { status: true } })
    const tally = tallyScreens(rows.map(r => r.status as ScreenStatus))
    await prisma.visualTestRun.update({
      where: { id: runId },
      data: {
        status: cancelled ? "Cancelled" : "Completed",
        completedAt: new Date(),
        passedCount: tally.passed,
        unresolvedCount: tally.unresolved + tally.removed,
        failedCount: tally.failed,
        newCount: tally.new,
        outcome: runOutcome(tally),
        error: notes.length ? notes.join(" ") : null,
      },
    })
  } catch (err: any) {
    await prisma.visualTestRun
      .update({
        where: { id: runId },
        data: { status: "Failed", completedAt: new Date(), error: String(err?.message || err) },
      })
      .catch(() => {})
    await refreshRunTallies([runId]).catch(() => {})
    throw err
  }
}

async function captureOne(args: {
  runId: string
  test: { id: string; matchLevel: "Strict" | "Dynamic" | "IgnoreColors"; captureType: "FullPage" | "Viewport"; waitBeforeCaptureMs: number; beforeCaptureScript: string | null }
  env: VisualEnvironment
  page: { id: string; url: string; urlKey: string }
  context: BrowserContext | null
  envError: string | null
  baseline: { imagePath: string; dynamicRects: unknown } | null
  regions: { screenKey: string | null; envKey: string | null; x: number; y: number; width: number; height: number }[]
}): Promise<void> {
  const { runId, test, env, page } = args
  const common = {
    runId,
    visualTestId: test.id,
    pageId: page.id,
    name: page.url,
    screenKey: page.urlKey,
    url: page.url,
    envKey: env.key,
    envName: env.name,
    browser: env.browser,
    viewport: `${env.width}x${env.height}`,
    diffState: args.baseline ? ("Existing" as const) : ("Added" as const),
  }

  const recordError = async (message: string, extra: Record<string, unknown> = {}) => {
    await prisma.visualScreen.create({ data: { ...common, status: "Error", errorMessage: message, baselineImagePath: args.baseline?.imagePath ?? null, ...extra } })
    await bump(runId)
  }

  if (!args.context) return recordError(args.envError || "The browser could not be started.")

  const tab = await args.context.newPage()
  let screenId: string | null = null
  try {
    const opened = await openPage(tab, page.url)
    if (opened.httpStatus === null && opened.error) {
      return await recordError(opened.error, { loadMs: opened.loadMs })
    }

    const shot = await captureScreen(tab, {
      captureType: test.captureType,
      waitBeforeCaptureMs: test.waitBeforeCaptureMs,
      beforeCaptureScript: test.beforeCaptureScript,
      collectDynamicText: test.matchLevel === "Dynamic",
    })
    const screen = await prisma.visualScreen.create({
      data: { ...common, status: "Unresolved", httpStatus: opened.httpStatus, loadMs: opened.loadMs },
    })
    screenId = screen.id
    const actualImagePath = await saveFile("visual-tests", `${test.id}/${runId}/${screen.id}.png`, shot.png)
    const actual = PNG.sync.read(shot.png)

    // An HTTP error page is captured as evidence but never becomes a baseline
    // and is never compared — "the 404 page looks the same as last time" is not a pass.
    if (opened.error) {
      await prisma.visualScreen.update({
        where: { id: screen.id },
        data: {
          status: "Error",
          errorMessage: opened.error,
          actualImagePath,
          width: actual.width,
          height: actual.height,
          baselineImagePath: args.baseline?.imagePath ?? null,
        },
      })
      return await bump(runId)
    }

    const evaluation = await evaluateScreen({
      visualTestId: test.id,
      diffFileStem: screen.id,
      actual,
      baseline: args.baseline,
      dynamicRects: shot.dynamicRects,
      matchLevel: test.matchLevel,
      regions: regionsFor(args.regions, page.urlKey, env.key),
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
        dynamicRects: jsonOrNull(shot.dynamicRects),
        width: actual.width,
        height: actual.height,
        errorMessage: shot.scriptError,
      },
    })

    if (evaluation.status === "New") {
      // First sighting of this page on this environment: it becomes the approved image.
      await prisma.visualScreenBaseline.upsert({
        where: { visualTestId_screenKey_envKey: { visualTestId: test.id, screenKey: page.urlKey, envKey: env.key } },
        create: {
          visualTestId: test.id,
          screenKey: page.urlKey,
          envKey: env.key,
          imagePath: actualImagePath,
          width: actual.width,
          height: actual.height,
          dynamicRects: jsonOrNull(shot.dynamicRects),
          sourceScreenId: screen.id,
        },
        update: {
          imagePath: actualImagePath,
          width: actual.width,
          height: actual.height,
          dynamicRects: jsonOrNull(shot.dynamicRects),
          sourceScreenId: screen.id,
        },
      })
    }
    await bump(runId)
  } catch (err: any) {
    const message = `Capturing this page failed: ${String(err?.message || err).split("\n")[0]}`
    if (screenId) {
      // The row exists already; fail it rather than leaving a second screen for the same page.
      await prisma.visualScreen.update({ where: { id: screenId }, data: { status: "Error", errorMessage: message } }).catch(() => {})
      await bump(runId)
    } else {
      await recordError(message)
    }
  } finally {
    await tab.close().catch(() => {})
  }
}

async function bump(runId: string) {
  await prisma.visualTestRun.update({ where: { id: runId }, data: { doneScreens: { increment: 1 } } }).catch(() => {})
}
