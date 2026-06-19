import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"
import fs from "node:fs"
import { saveFile } from "@/lib/storage"

export interface VisualDiffResult {
  mismatchPercent: number
  diffImagePath: string | null
  width: number
  height: number
}

export async function compareImages(
  figmaPath: string,
  actualPath: string,
  tolerancePercent: number = 1.0
): Promise<VisualDiffResult> {
  const figmaBuffer = fs.readFileSync(figmaPath)
  const actualBuffer = fs.readFileSync(actualPath)

  const figmaPng = PNG.sync.read(figmaBuffer)
  const actualPng = PNG.sync.read(actualBuffer)

  const width = Math.min(figmaPng.width, actualPng.width)
  const height = Math.min(figmaPng.height, actualPng.height)

  // Resize both images to the minimum dimensions
  const figmaResized = resizePNG(figmaPng, width, height)
  const actualResized = resizePNG(actualPng, width, height)

  const diff = new PNG({ width, height })
  const mismatchedPixels = pixelmatch(
    figmaResized.data,
    actualResized.data,
    diff.data,
    width,
    height,
    { threshold: tolerancePercent / 100 }
  )

  const totalPixels = width * height
  const mismatchPercent = (mismatchedPixels / totalPixels) * 100

  let diffImagePath: string | null = null
  if (mismatchedPixels > 0) {
    const diffBuffer = PNG.sync.write(diff)
    diffImagePath = await saveFile("visual-checks/diff", `diff-${Date.now()}.png`, diffBuffer)
  }

  return { mismatchPercent, diffImagePath, width, height }
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
