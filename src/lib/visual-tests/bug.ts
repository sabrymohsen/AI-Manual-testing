/**
 * File a bug from a visual screen. The bug lands in the test's module, carries
 * the three images (approved, new, differences) and says in plain words what was
 * compared, so whoever picks it up does not need to open the analyzer.
 */
import { prisma } from "@/lib/db"
import { applyModulePrefix } from "@/lib/bug-reports/title-prefix"
import { asRegions } from "./compare-service"

export async function fileBugFromScreen(opts: {
  screenId: string
  userId: string
  title?: string
  severity?: "Low" | "Medium" | "High" | "Critical"
  priority?: "Low" | "Medium" | "High" | "Critical"
  notes?: string
}) {
  const screen = await prisma.visualScreen.findUnique({
    where: { id: opts.screenId },
    include: {
      visualTest: { include: { suite: { select: { id: true, name: true } }, project: { select: { id: true, environment: true } } } },
      run: { select: { id: true, matchLevel: true, captureType: true, createdAt: true } },
    },
  })
  if (!screen) throw Object.assign(new Error("Screen not found"), { status: 404 })
  if (screen.bugReportId) {
    const existing = await prisma.bugReport.findUnique({ where: { id: screen.bugReportId }, select: { id: true, bugKey: true } })
    if (existing) return { bug: existing, created: false }
  }

  const test = screen.visualTest
  const projectId = test.project.id
  let pathLabel = screen.name
  try {
    if (screen.url) pathLabel = new URL(screen.url).pathname
  } catch {}

  const moduleNames = (await prisma.testSuite.findMany({ where: { projectId }, select: { name: true } })).map(m => m.name)
  const kind =
    screen.status === "Error" ? "does not load" : screen.status === "Removed" ? "is missing" : "looks different"
  const baseTitle = opts.title?.trim() || `${pathLabel} ${kind} on ${screen.envName}`
  const title = applyModulePrefix(baseTitle, test.suite?.name, moduleNames)

  const regions = asRegions(screen.diffRegions)
  const [width, height] = screen.viewport.split("x").map(Number)
  const steps = [
    `1. Open ${screen.url || screen.name}`,
    `2. Use ${screen.envName} (${screen.viewport}${screen.browser ? `, ${screen.browser}` : ""})`,
    `3. Compare the page with the approved screenshot from visual test "${test.name}"`,
    regions.length
      ? `4. Changed areas: ${regions.slice(0, 5).map(r => `${r.width}×${r.height} at (${r.x}, ${r.y})`).join("; ")}${regions.length > 5 ? ` and ${regions.length - 5} more` : ""}`
      : null,
    opts.notes ? `\nNotes: ${opts.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const count = await prisma.bugReport.count({ where: { projectId } })
  const bug = await prisma.bugReport.create({
    data: {
      bugKey: `BUG-${String(count + 1).padStart(4, "0")}`,
      title,
      projectId,
      suiteId: test.suiteId,
      severity: opts.severity || (screen.status === "Error" ? "High" : "Medium"),
      priority: opts.priority || "Medium",
      status: "Open",
      environment: test.project.environment,
      roleUsed: "None",
      browser: screen.browser === "firefox" ? "Firefox" : screen.browser === "webkit" ? "WebKit" : "Chromium",
      viewport: width && width <= 480 ? "Mobile" : width && width <= 1024 ? "Tablet" : "Desktop",
      screenResolution: width && height ? `${width}x${height}` : null,
      pageUrl: screen.url,
      source: "Visual test",
      tags: ["visual"],
      reporterId: opts.userId,
      stepsToReproduce: steps,
      expectedResult:
        screen.status === "Removed"
          ? "The page is still published."
          : "The page matches the approved screenshot, apart from content expected to change.",
      actualResult:
        screen.status === "Error"
          ? screen.errorMessage || "The page could not be loaded."
          : screen.status === "Removed"
            ? "The page is no longer listed in the sitemap."
            : `${regions.length} area(s) differ from the approved screenshot (${(screen.mismatchPercent ?? 0).toFixed(2)}% of the page).`,
      screenshotPath: screen.actualImagePath,
    },
    select: { id: true, bugKey: true },
  })

  const attachments = [
    screen.baselineImagePath && { fileName: "approved.png", filePath: screen.baselineImagePath },
    screen.actualImagePath && { fileName: "new.png", filePath: screen.actualImagePath },
    screen.diffImagePath && { fileName: "differences.png", filePath: screen.diffImagePath },
  ].filter((a): a is { fileName: string; filePath: string } => !!a)
  if (attachments.length) {
    await prisma.bugAttachment.createMany({ data: attachments.map(a => ({ ...a, bugId: bug.id, fileType: "image/png" })) })
  }
  await prisma.bugActivity.create({
    data: { bugId: bug.id, action: "CREATE_FROM_VISUAL_TEST", details: `Filed from visual test "${test.name}", screen ${screen.id}.` },
  })
  await prisma.visualScreen.update({ where: { id: screen.id }, data: { bugReportId: bug.id } })
  return { bug, created: true }
}
