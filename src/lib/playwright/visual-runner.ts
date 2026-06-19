import { chromium } from "playwright"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { saveFile } from "@/lib/storage"
import { handleLogin } from "./login-handler"
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"
import fs from "node:fs"
import path from "node:path"

export interface VisualCheckOptions {
  runId: string
}

export async function runVisualCheck({ runId }: VisualCheckOptions) {
  const startTime = Date.now()

  // 1. Fetch visual check run info
  const run = await prisma.visualCheckRun.findUnique({
    where: { id: runId },
    include: {
      project: true,
      mapping: {
        include: {
          figmaFrame: true,
          ignoredRegions: true,
          toleranceProfile: true
        }
      }
    }
  })

  if (!run) {
    console.error(`[visual-runner] Run not found: ${runId}`)
    return
  }

  // Update status to running
  await prisma.visualCheckRun.update({
    where: { id: runId },
    data: { status: "NeedsReview" } // starts as NeedsReview until evaluation
  })

  const mapping = run.mapping
  const profile = mapping.toleranceProfile

  const allowedMismatchPercent = profile?.allowedMismatchPercent ?? 2.0
  const pixelThreshold = profile?.pixelThreshold ?? 0.1
  const minRegionArea = profile?.minRegionArea ?? 25
  const ignoreAntiAliasing = profile?.ignoreAntiAliasing ?? true

  let browser: any = null
  let context: any = null
  let actualImagePath = ""

  try {
    // 2. Launch browser & setup context
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({
      viewport: { width: mapping.viewportWidth, height: mapping.viewportHeight },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    })

    const page = await context.newPage()

    // 3. Perform login if required
    let roleUsed: string | null = null
    if (mapping.credentialId) {
      const credential = await prisma.projectCredential.findUnique({
        where: { id: mapping.credentialId }
      })
      if (credential) {
        roleUsed = credential.roleName
        const decryptedPassword = decryptSecret({
          encrypted: credential.encryptedPassword,
          iv: credential.encryptionIv,
          authTag: credential.encryptionAuthTag,
          keyVersion: credential.keyVersion,
        })
        const loginUrl = credential.loginUrl || run.project.webAppUrl
        await handleLogin(page, {
          url: loginUrl,
          username: credential.username,
          password: decryptedPassword,
        })
      }
    }

    // 4. Navigate to mapping URL
    await page.goto(mapping.appUrl, { waitUntil: "load" })

    // 5. Handle Wait Strategies
    if (mapping.waitStrategy === "network_idle") {
      try {
        await page.waitForLoadState("networkidle", { timeout: 10000 })
      } catch (e) {
        console.warn("[visual-runner] Network idle wait timed out, proceeding.")
      }
    } else if (mapping.waitStrategy === "custom_selector" && mapping.waitSelector) {
      try {
        await page.locator(mapping.waitSelector).waitFor({ state: "visible", timeout: 10000 })
      } catch (e) {
        console.warn(`[visual-runner] Wait selector "${mapping.waitSelector}" not found, proceeding.`)
      }
    } else if (mapping.waitStrategy === "delay" && mapping.fixedDelayMs) {
      await page.waitForTimeout(mapping.fixedDelayMs)
    } else {
      // default short stabilization wait
      await page.waitForTimeout(1500)
    }

    // 6. Inject stabilization CSS (freeze transitions, animations, and hide cursor/scrollbars)
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-delay: -1ms !important;
          animation-duration: 1ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
        ::-webkit-scrollbar {
          display: none !important;
        }
        body {
          scrollbar-width: none !important;
        }
      `
    })

    // Capture screenshot
    const screenshotBuffer = await page.screenshot({ type: "png", fullPage: true })
    actualImagePath = await saveFile("visual-checks/actual", `visual-actual-${runId}-${Date.now()}.png`, screenshotBuffer)

    await context.close()
    await browser.close()
    browser = null

    // 7. Load Figma reference image
    if (!mapping.figmaFrame.referenceImagePath) {
      throw new Error(`Figma reference image not found for frame: ${mapping.figmaFrame.name}`)
    }

    const storageRoot = process.env.STORAGE_ROOT || "./storage"
    let figmaAbsPath = mapping.figmaFrame.referenceImagePath
    if (!path.isAbsolute(figmaAbsPath)) {
      figmaAbsPath = path.resolve(figmaAbsPath)
    }

    let actualAbsPath = actualImagePath
    if (!path.isAbsolute(actualAbsPath)) {
      actualAbsPath = path.resolve(actualAbsPath)
    }

    if (!fs.existsSync(figmaAbsPath)) {
      throw new Error(`Figma reference file does not exist at ${figmaAbsPath}`)
    }
    if (!fs.existsSync(actualAbsPath)) {
      throw new Error(`Web screenshot file does not exist at ${actualAbsPath}`)
    }

    const figmaPng = PNG.sync.read(fs.readFileSync(figmaAbsPath))
    const actualPng = PNG.sync.read(fs.readFileSync(actualAbsPath))

    const width = Math.min(figmaPng.width, actualPng.width)
    const height = Math.min(figmaPng.height, actualPng.height)

    // Resize images to minimum dimensions if mismatched
    const figmaResized = resizePNG(figmaPng, width, height)
    const actualResized = resizePNG(actualPng, width, height)

    // 8. Mask Ignored Regions
    // We blank out coordinates in both images to ensure 0 mismatch for ignored zones.
    for (const region of mapping.ignoredRegions) {
      const startX = Math.max(0, region.x)
      const startY = Math.max(0, region.y)
      const endX = Math.min(width, region.x + region.width)
      const endY = Math.min(height, region.y + region.height)

      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const idx = (py * width + px) * 4
          figmaResized.data[idx] = 0
          figmaResized.data[idx + 1] = 0
          figmaResized.data[idx + 2] = 0
          figmaResized.data[idx + 3] = 0

          actualResized.data[idx] = 0
          actualResized.data[idx + 1] = 0
          actualResized.data[idx + 2] = 0
          actualResized.data[idx + 3] = 0
        }
      }
    }

    // 9. Run Pixelmatch
    const diffPng = new PNG({ width, height })
    const mismatchedPixels = pixelmatch(
      figmaResized.data,
      actualResized.data,
      diffPng.data,
      width,
      height,
      {
        threshold: pixelThreshold,
        includeAA: !ignoreAntiAliasing
      }
    )

    const totalPixels = width * height
    const mismatchPercent = (mismatchedPixels / totalPixels) * 100

    let diffImagePath: string | null = null
    if (mismatchedPixels > 0) {
      const diffBuffer = PNG.sync.write(diffPng)
      diffImagePath = await saveFile("visual-checks/diff", `diff-${runId}-${Date.now()}.png`, diffBuffer)
    }

    // 10. Connected components bounding box grouping
    // Group mismatched pixels using a grid-BFS to capture discrepancy regions.
    const gridCellSize = 20
    const gridW = Math.ceil(width / gridCellSize)
    const gridH = Math.ceil(height / gridCellSize)
    const grid = Array.from({ length: gridH }, () => Array(gridW).fill(false))
    const pixelLists: Array<Array<{ x: number; y: number }>> = Array.from(
      { length: gridH * gridW },
      () => []
    )

    // Scan mismatching pixels in diff buffer (pixelmatch sets red output pixels)
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const idx = (py * width + px) * 4
        // Pixelmatch writes red pixels [255, 0, 0, 255] or dark transparent pixels for AA
        // A pixel is mismatched if it is red (diffPng.data[idx] === 255 && diffPng.data[idx+1] === 0)
        if (diffPng.data[idx] === 255 && diffPng.data[idx + 1] === 0 && diffPng.data[idx + 2] === 0) {
          const cx = Math.floor(px / gridCellSize)
          const cy = Math.floor(py / gridCellSize)
          grid[cy][cx] = true
          pixelLists[cy * gridW + cx].push({ x: px, y: py })
        }
      }
    }

    // Find connected groups of cells
    const visited = Array.from({ length: gridH }, () => Array(gridW).fill(false))
    const boundingBoxes: Array<{ x: number; y: number; width: number; height: number; pixels: number }> = []

    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        if (grid[gy][gx] && !visited[gy][gx]) {
          // Start BFS to gather component
          const queue: Array<[number, number]> = [[gx, gy]]
          visited[gy][gx] = true
          const componentCells: Array<[number, number]> = [[gx, gy]]

          while (queue.length > 0) {
            const [cx, cy] = queue.shift()!
            // check 8 neighbors
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = cx + dx
                const ny = cy + dy
                if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
                  if (grid[ny][nx] && !visited[ny][nx]) {
                    visited[ny][nx] = true
                    queue.push([nx, ny])
                    componentCells.push([nx, ny])
                  }
                }
              }
            }
          }

          // Extract bounding box for component
          let minX = width
          let minY = height
          let maxX = 0
          let maxY = 0
          let pixelsCount = 0

          for (const [cx, cy] of componentCells) {
            const list = pixelLists[cy * gridW + cx]
            pixelsCount += list.length
            for (const p of list) {
              if (p.x < minX) minX = p.x
              if (p.y < minY) minY = p.y
              if (p.x > maxX) maxX = p.x
              if (p.y > maxY) maxY = p.y
            }
          }

          if (pixelsCount > 0) {
            // Add padding to crops
            const padding = 10
            const boxX = Math.max(0, minX - padding)
            const boxY = Math.max(0, minY - padding)
            const boxW = Math.min(width - boxX, (maxX - minX) + 1 + padding * 2)
            const boxH = Math.min(height - boxY, (maxY - minY) + 1 + padding * 2)

            boundingBoxes.push({
              x: boxX,
              y: boxY,
              width: boxW,
              height: boxH,
              pixels: pixelsCount
            })
          }
        }
      }
    }

    // 11. Process and save mismatch crops & issues
    const issuesData = []
    for (const box of boundingBoxes) {
      const area = box.width * box.height
      if (area < minRegionArea) continue // Skip micro discrepancies

      // Crop images
      const expectedCrop = cropPNG(figmaResized, box)
      const actualCrop = cropPNG(actualResized, box)
      const diffCrop = cropPNG(diffPng, box)

      const expectedCropBuffer = PNG.sync.write(expectedCrop)
      const actualCropBuffer = PNG.sync.write(actualCrop)
      const diffCropBuffer = PNG.sync.write(diffCrop)

      const cropId = `${runId}-${Math.random().toString(36).substring(2, 7)}`

      const expectedCropPath = await saveFile("visual-checks/crops", `expected-${cropId}.png`, expectedCropBuffer)
      const actualCropPath = await saveFile("visual-checks/crops", `actual-${cropId}.png`, actualCropBuffer)
      const diffCropPath = await saveFile("visual-checks/crops", `diff-${cropId}.png`, diffCropBuffer)

      const boxMismatchPercent = (box.pixels / area) * 100

      issuesData.push({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        mismatchPercent: boxMismatchPercent,
        regionArea: area,
        category: "Unknown" as any,
        severity: "Medium" as any,
        status: "New" as any,
        expectedCropPath,
        actualCropPath,
        diffCropPath
      })
    }

    // Evaluate Run Status
    // Passed if mismatchPercent <= allowedMismatchPercent
    const finalStatus = mismatchPercent <= allowedMismatchPercent ? "Passed" : "Failed"

    // Save issues to database
    await prisma.$transaction(
      issuesData.map((issue) =>
        prisma.visualDifferenceIssue.create({
          data: {
            runId,
            ...issue
          }
        })
      )
    )

    // Update VisualCheckRun
    await prisma.visualCheckRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        actualImagePath,
        diffImagePath,
        mismatchPercent,
        totalRegions: issuesData.length,
        roleUsed: roleUsed || "None",
        completedAt: new Date(),
        durationMs: Date.now() - startTime
      }
    })

  } catch (error: any) {
    console.error(`[visual-runner] Execution failed for runId: ${runId}`, error)
    await prisma.visualCheckRun.update({
      where: { id: runId },
      data: {
        status: "Error",
        completedAt: new Date(),
        durationMs: Date.now() - startTime
      }
    })
  } finally {
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }
}

function resizePNG(png: PNG, targetWidth: number, targetHeight: number): PNG {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png
  }

  const resized = new PNG({ width: targetWidth, height: targetHeight })
  const scaleX = png.width / targetWidth
  const scaleY = png.height / targetHeight

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.floor(x * scaleX)
      const srcY = Math.floor(y * scaleY)
      const srcIdx = (srcY * png.width + srcX) * 4
      const dstIdx = (y * targetWidth + x) * 4
      resized.data[dstIdx] = png.data[srcIdx]
      resized.data[dstIdx + 1] = png.data[srcIdx + 1]
      resized.data[dstIdx + 2] = png.data[srcIdx + 2]
      resized.data[dstIdx + 3] = png.data[srcIdx + 3]
    }
  }

  return resized
}

function cropPNG(png: PNG, box: { x: number; y: number; width: number; height: number }): PNG {
  const crop = new PNG({ width: box.width, height: box.height })
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const srcX = box.x + x
      const srcY = box.y + y
      const srcIdx = (srcY * png.width + srcX) * 4
      const dstIdx = (y * box.width + x) * 4

      crop.data[dstIdx] = png.data[srcIdx]
      crop.data[dstIdx + 1] = png.data[srcIdx + 1]
      crop.data[dstIdx + 2] = png.data[srcIdx + 2]
      crop.data[dstIdx + 3] = png.data[srcIdx + 3]
    }
  }
  return crop
}
