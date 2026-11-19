import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { unauthorizedResponse, badRequestResponse, notFoundResponse, requireProjectMember } from "@/lib/api-guards"
import { z } from "zod"
import { fetchFigmaImage } from "@/lib/figma/api-client"
import { parseFigmaUrl } from "@/lib/figma/url-parser"
import { compareImages } from "@/lib/playwright/visual-diff"
import { saveFile } from "@/lib/storage"
import { chromium } from "playwright"
import path from "node:path"

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const body = await request.json()
  const compareSchema = z.object({
    targetUrl: z.string().url().optional().nullable(),
  })
  const parsed = compareSchema.safeParse(body)
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
  }
  const { targetUrl } = parsed.data

  try {
    // 1. Fetch project and Figma config
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      include: { figmaConfig: true },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    if (!project.figmaUrl) {
      return NextResponse.json({ error: "Figma URL is not configured for this project" }, { status: 400 })
    }

    // Determine target URL
    const urlToTest = targetUrl || project.webAppUrl

    // Get api token from config
    const figmaConfig = project.figmaConfig
    if (!figmaConfig || (!figmaConfig.fileKey)) {
      return NextResponse.json({ error: "Figma configuration not found. Please sync first." }, { status: 400 })
    }

    // Figma cached image file path
    // We expect the image to be named figma-${fileKey}.png in storage/figma/
    const storageRoot = process.env.STORAGE_ROOT || "./storage"
    const figmaImagePath = path.join(storageRoot, "figma", `figma-${figmaConfig.fileKey}.png`)

    // Determine viewport size
    let width = 1280
    let height = 800
    if (project.viewport === "Tablet") {
      width = 768
      height = 1024
    } else if (project.viewport === "Mobile") {
      width = 375
      height = 667
    } else if (project.viewport === "Custom" && project.customViewportWidth && project.customViewportHeight) {
      width = project.customViewportWidth
      height = project.customViewportHeight
    }

    // 2. Launch browser and capture page screenshot
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width, height },
    })
    const page = await context.newPage()
    
    await page.goto(urlToTest, { waitUntil: "networkidle" })
    const screenshotBuffer = await page.screenshot({ type: "png", fullPage: true })
    
    await context.close()
    await browser.close()

    // Save actual screenshot
    const actualImagePath = await saveFile(
      "visual-checks/actual",
      `visual-actual-${Date.now()}.png`,
      screenshotBuffer
    )

    // 3. Perform comparison using visual-diff engine
    const tolerance = figmaConfig.visualTolerancePercent || 1.0
    const diffResult = await compareImages(
      figmaImagePath,
      actualImagePath,
      tolerance
    )

    // 4. Create database records (TestRun & VisualComparisonResult)
    const testRun = await prisma.testRun.create({
      data: {
        projectId: params.projectId,
        status: diffResult.mismatchPercent <= tolerance ? "Passed" : "Failed",
        roleUsed: "None",
        browserType: project.browserType,
        viewport: project.viewport,
        viewportWidth: width,
        viewportHeight: height,
        triggeredBy: "Manual",
        startedAt: new Date(),
        completedAt: new Date(),
      },
    })

    const visualResult = await prisma.visualComparisonResult.create({
      data: {
        testRunId: testRun.id,
        figmaImagePath: `storage/figma/figma-${figmaConfig.fileKey}.png`,
        actualImagePath,
        diffImagePath: diffResult.diffImagePath,
        mismatchPercent: diffResult.mismatchPercent,
        tolerancePercent: tolerance,
        viewportWidth: width,
        viewportHeight: height,
        status: diffResult.mismatchPercent <= tolerance ? "Passed" : "Failed",
      },
    })

    return NextResponse.json({
      visualResult,
      testRunId: testRun.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual comparison failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
