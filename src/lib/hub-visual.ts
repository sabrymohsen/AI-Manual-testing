// Visual regression engine for the Visual Diff section (Section 9).
// SHAFT's shaft-visual module does OpenCV pixel comparison; here we perform the
// equivalent pixel diff with pixelmatch + pngjs (both already dependencies),
// producing a real diff score and a red-highlight diff PNG. Applitools /
// Shutterbug are surfaced as providers but only the built-in engine runs.

import * as fs from "fs"
import * as path from "path"
import { PNG } from "pngjs"
import pixelmatch from "pixelmatch"

import { STORAGE_ROOT } from "@/lib/storage-health"

// Images live under STORAGE_ROOT (not public/): files written to public/ at
// runtime aren't served by `next start`, and anything there skips the
// project check. They are served by /api/hub/visual/image instead.
export const VISUAL_ROOT = path.resolve(STORAGE_ROOT, "visual")

export type VisualSubdir = "baselines" | "current" | "diffs"

export function ensureVisualDirs() {
  for (const d of ["baselines", "current", "diffs"]) {
    fs.mkdirSync(path.join(VISUAL_ROOT, d), { recursive: true })
  }
}

/** True when the path is inside the managed visual store (safe to read/unlink). */
export function inVisualStore(p: string): boolean {
  const root = path.resolve(VISUAL_ROOT) + path.sep
  return path.resolve(p).startsWith(root)
}

/** Access-checked image URL. `v` busts the cache when a baseline is overwritten on approve. */
export function baselineImageUrl(b: { id: string; updatedAt?: Date | string | null }): string {
  const v = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
  return `/api/hub/visual/image?kind=baseline&id=${encodeURIComponent(b.id)}&v=${v}`
}

export function comparisonImageUrl(c: { id: string }, which: "current" | "diff"): string {
  return `/api/hub/visual/image?kind=${which}&id=${encodeURIComponent(c.id)}`
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47])

export function isPng(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.subarray(0, 4).equals(PNG_SIGNATURE)
}

// Persist a base64 data URL (PNG) into a subdir; returns the absolute path.
export function saveDataUrlPng(dataUrl: string, subdir: VisualSubdir, baseName: string): string {
  ensureVisualDirs()
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/)
  if (!m) throw new Error("Expected a base64 PNG data URL")
  const buffer = Buffer.from(m[2], "base64")
  if (!isPng(buffer)) throw new Error("Uploaded image is not a PNG")
  const dest = path.join(VISUAL_ROOT, subdir, `${baseName}.png`)
  fs.writeFileSync(dest, buffer)
  return dest
}

// Copy an existing on-disk PNG (e.g. an evidence screenshot) into the store.
export function copyPngInto(srcPath: string, subdir: VisualSubdir, baseName: string): string {
  ensureVisualDirs()
  const buffer = fs.readFileSync(srcPath)
  if (!isPng(buffer)) throw new Error("Source image is not a PNG")
  const dest = path.join(VISUAL_ROOT, subdir, `${baseName}.png`)
  fs.writeFileSync(dest, buffer)
  return dest
}

// Expand a decoded PNG's RGBA data to a WxH canvas (transparent fill), so that
// mismatched dimensions still diff — the non-overlapping area counts as changed.
function padTo(png: PNG, W: number, H: number): Buffer {
  if (png.width === W && png.height === H) return png.data
  const out = Buffer.alloc(W * H * 4, 0)
  for (let y = 0; y < png.height; y++) {
    const srcStart = y * png.width * 4
    png.data.copy(out, y * W * 4, srcStart, srcStart + png.width * 4)
  }
  return out
}

export interface IgnoreRegion {
  x: number
  y: number
  width: number
  height: number
}

// Blank the ignore regions identically in both buffers so they never count.
function applyIgnoreRegions(a: Buffer, b: Buffer, W: number, H: number, regions: IgnoreRegion[]) {
  for (const r of regions) {
    const x0 = Math.max(0, Math.floor(r.x))
    const y0 = Math.max(0, Math.floor(r.y))
    const x1 = Math.min(W, Math.floor(r.x + r.width))
    const y1 = Math.min(H, Math.floor(r.y + r.height))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * W + x) * 4
        a[idx] = a[idx + 1] = a[idx + 2] = a[idx + 3] = 0
        b[idx] = b[idx + 1] = b[idx + 2] = b[idx + 3] = 0
      }
    }
  }
}

export interface DiffOptions {
  colorSensitivity?: number // 0..100 (higher = stricter); default 90
  ignoreAntiAliasing?: boolean // default true
  ignoreRegions?: IgnoreRegion[]
}

export interface DiffResult {
  diffPixels: number
  totalPixels: number
  diffScore: number // percentage 0..100
  width: number
  height: number
  dimensionMismatch: boolean
  diffPath: string
}

export function computeDiff(baselinePath: string, currentPath: string, diffOutPath: string, opts: DiffOptions = {}): DiffResult {
  const base = PNG.sync.read(fs.readFileSync(baselinePath))
  const curr = PNG.sync.read(fs.readFileSync(currentPath))

  const W = Math.max(base.width, curr.width)
  const H = Math.max(base.height, curr.height)
  const dimensionMismatch = base.width !== curr.width || base.height !== curr.height

  const a = Buffer.from(padTo(base, W, H))
  const b = Buffer.from(padTo(curr, W, H))

  if (opts.ignoreRegions && opts.ignoreRegions.length) {
    applyIgnoreRegions(a, b, W, H, opts.ignoreRegions)
  }

  const sensitivity = opts.colorSensitivity ?? 90
  const pmThreshold = Math.min(0.99, Math.max(0.01, (100 - sensitivity) / 100))
  const includeAA = !(opts.ignoreAntiAliasing ?? true)

  const diff = new PNG({ width: W, height: H })
  const diffPixels = pixelmatch(a, b, diff.data, W, H, {
    threshold: pmThreshold,
    includeAA,
    alpha: 0.4,
    diffColor: [255, 0, 0],
    aaColor: [255, 200, 0]
  })

  ensureVisualDirs()
  fs.writeFileSync(diffOutPath, PNG.sync.write(diff))

  const totalPixels = W * H
  return {
    diffPixels,
    totalPixels,
    diffScore: totalPixels ? (diffPixels / totalPixels) * 100 : 0,
    width: W,
    height: H,
    dimensionMismatch,
    diffPath: diffOutPath
  }
}

export function pngDimensions(absPath: string): { width: number; height: number } | null {
  try {
    const png = PNG.sync.read(fs.readFileSync(absPath))
    return { width: png.width, height: png.height }
  } catch {
    return null
  }
}
