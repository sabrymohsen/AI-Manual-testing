/**
 * Screenshot comparison. Pure (operates on decoded PNGs), so it is unit-tested
 * without a browser and re-run by the review routes when a person draws an
 * ignore region.
 *
 * Deliberate choices:
 * - Images of different sizes are PADDED, never resized. A full-page screenshot
 *   that grew by 300px because a section was added is a real difference; scaling
 *   both to one size (what the Figma comparison does) smears every pixel and
 *   reports the whole page as changed.
 * - Differences are reported as REGIONS (boxes), found by flood-filling a coarse
 *   grid of changed cells. A person reviews "the header changed", not 14,000
 *   pixels, and auto-maintenance matches changes box by box.
 * - Each region carries a perceptual hash of the baseline and the actual crop.
 *   Two screens show "the same change" when every region of one matches a region
 *   of the other by size and by both hashes. That is what lets accepting a new
 *   logo on one page accept it everywhere, without accepting an unrelated change
 *   that happens to sit in the same place.
 */
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"

export type MatchLevel = "Strict" | "Dynamic" | "IgnoreColors"

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DiffRegion extends Rect {
  pixels: number
  /** 64-bit dHash of the baseline crop, hex. */
  hashBase: string
  /** 64-bit dHash of the actual crop, hex. */
  hashActual: string
}

export interface CompareResult {
  width: number
  height: number
  diffPixels: number
  mismatchPercent: number
  regions: DiffRegion[]
  /** pixelmatch output; null when nothing differs. */
  diff: PNG | null
}

export interface CompareOptions {
  matchLevel?: MatchLevel
  /** Areas masked on both images before comparing (ignore regions + dynamic text). */
  ignore?: Rect[]
  /** Grid cell size for grouping changed pixels into regions. */
  cellSize?: number
  /** Regions with fewer changed pixels than this are anti-aliasing noise. */
  minRegionPixels?: number
  /** Percentage of changed pixels at or below which a screen still passes. */
  tolerancePercent?: number
}

// Magenta: impossible to mistake for page content.
const PAD: [number, number, number, number] = [255, 0, 255, 255]

/** Place `src` top-left on a `width`x`height` canvas, filling the gap with PAD. */
export function padTo(src: PNG, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src
  const out = new PNG({ width, height })
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = PAD[0]
    out.data[i + 1] = PAD[1]
    out.data[i + 2] = PAD[2]
    out.data[i + 3] = PAD[3]
  }
  PNG.bitblt(src, out, 0, 0, Math.min(src.width, width), Math.min(src.height, height), 0, 0)
  return out
}

export function clampRect(r: Rect, width: number, height: number): Rect | null {
  const x = Math.max(0, Math.floor(r.x))
  const y = Math.max(0, Math.floor(r.y))
  const x2 = Math.min(width, Math.ceil(r.x + r.width))
  const y2 = Math.min(height, Math.ceil(r.y + r.height))
  if (x2 <= x || y2 <= y) return null
  return { x, y, width: x2 - x, height: y2 - y }
}

/** Paint the rects flat grey (in place). */
export function maskRects(img: PNG, rects: Rect[]): void {
  for (const raw of rects) {
    const r = clampRect(raw, img.width, img.height)
    if (!r) continue
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        const i = (y * img.width + x) << 2
        img.data[i] = 128
        img.data[i + 1] = 128
        img.data[i + 2] = 128
        img.data[i + 3] = 255
      }
    }
  }
}

function toGrayscale(img: PNG): void {
  for (let i = 0; i < img.data.length; i += 4) {
    const l = Math.round(0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2])
    img.data[i] = l
    img.data[i + 1] = l
    img.data[i + 2] = l
  }
}

function clone(img: PNG): PNG {
  const out = new PNG({ width: img.width, height: img.height })
  img.data.copy(out.data)
  return out
}

/**
 * 64-bit difference hash of a crop: box-average down to 9x8 greyscale, then one
 * bit per horizontal neighbour comparison. Survives re-encoding and tiny shifts,
 * differs for different content.
 */
export function dHash(img: PNG, rect: Rect): string {
  const r = clampRect(rect, img.width, img.height)
  if (!r) return "0000000000000000"
  const cols = 9
  const rows = 8
  const grid = new Array<number>(cols * rows).fill(0)
  for (let gy = 0; gy < rows; gy++) {
    const y0 = r.y + Math.floor((gy * r.height) / rows)
    const y1 = Math.max(y0 + 1, r.y + Math.floor(((gy + 1) * r.height) / rows))
    for (let gx = 0; gx < cols; gx++) {
      const x0 = r.x + Math.floor((gx * r.width) / cols)
      const x1 = Math.max(x0 + 1, r.x + Math.floor(((gx + 1) * r.width) / cols))
      let sum = 0
      let n = 0
      for (let y = y0; y < y1 && y < img.height; y++) {
        for (let x = x0; x < x1 && x < img.width; x++) {
          const i = (y * img.width + x) << 2
          sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
          n++
        }
      }
      grid[gy * cols + gx] = n ? sum / n : 0
    }
  }
  let hex = ""
  for (let gy = 0; gy < rows; gy++) {
    let byte = 0
    for (let gx = 0; gx < 8; gx++) {
      byte = (byte << 1) | (grid[gy * cols + gx] < grid[gy * cols + gx + 1] ? 1 : 0)
    }
    hex += byte.toString(16).padStart(2, "0")
  }
  return hex
}

export function hammingHex(a: string, b: string): number {
  let d = 0
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    let x = parseInt(a[i] || "0", 16) ^ parseInt(b[i] || "0", 16)
    while (x) {
      d += x & 1
      x >>= 1
    }
  }
  return d
}

/**
 * Group changed pixels into boxes: mark grid cells holding any changed pixel,
 * flood-fill 8-connected cells, take each component's pixel-accurate bounds.
 */
export function findRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  cellSize = 16,
  minPixels = 4
): (Rect & { pixels: number })[] {
  const cols = Math.ceil(width / cellSize)
  const rows = Math.ceil(height / cellSize)
  const cellCount = new Uint32Array(cols * rows)
  const bounds = new Int32Array(cols * rows * 4) // minX, minY, maxX, maxY per cell
  for (let y = 0; y < height; y++) {
    const cy = (y / cellSize) | 0
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      const c = cy * cols + ((x / cellSize) | 0)
      const b = c * 4
      if (cellCount[c] === 0) {
        bounds[b] = x
        bounds[b + 1] = y
        bounds[b + 2] = x
        bounds[b + 3] = y
      } else {
        if (x < bounds[b]) bounds[b] = x
        if (x > bounds[b + 2]) bounds[b + 2] = x
        if (y > bounds[b + 3]) bounds[b + 3] = y
      }
      cellCount[c]++
    }
  }

  const visited = new Uint8Array(cols * rows)
  const regions: (Rect & { pixels: number })[] = []
  const stack: number[] = []
  for (let start = 0; start < cols * rows; start++) {
    if (!cellCount[start] || visited[start]) continue
    let minX = Infinity
    let minY = Infinity
    let maxX = -1
    let maxY = -1
    let pixels = 0
    stack.push(start)
    visited[start] = 1
    while (stack.length) {
      const c = stack.pop()!
      const b = c * 4
      pixels += cellCount[c]
      if (bounds[b] < minX) minX = bounds[b]
      if (bounds[b + 1] < minY) minY = bounds[b + 1]
      if (bounds[b + 2] > maxX) maxX = bounds[b + 2]
      if (bounds[b + 3] > maxY) maxY = bounds[b + 3]
      const cx = c % cols
      const cy = (c / cols) | 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
          const n = ny * cols + nx
          if (cellCount[n] && !visited[n]) {
            visited[n] = 1
            stack.push(n)
          }
        }
      }
    }
    if (pixels >= minPixels) {
      regions.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixels })
    }
  }
  return regions.sort((a, b) => a.y - b.y || a.x - b.x)
}

export function compareImages(baseline: PNG, actual: PNG, opts: CompareOptions = {}): CompareResult {
  const matchLevel = opts.matchLevel ?? "Strict"
  const width = Math.max(baseline.width, actual.width)
  const height = Math.max(baseline.height, actual.height)

  const paddedBase = padTo(baseline, width, height)
  const paddedAct = padTo(actual, width, height)
  // Mask and recolour copies; the padded originals feed the hashes.
  const base = clone(paddedBase)
  const act = clone(paddedAct)
  if (opts.ignore?.length) {
    maskRects(base, opts.ignore)
    maskRects(act, opts.ignore)
  }
  if (matchLevel === "IgnoreColors") {
    toGrayscale(base)
    toGrayscale(act)
  }

  const diffPng = new PNG({ width, height })
  const diffPixels = pixelmatch(base.data, act.data, diffPng.data, width, height, {
    // Anti-aliasing is ignored at every level: a glyph rendered a subpixel
    // differently is not a change anyone would file.
    threshold: matchLevel === "IgnoreColors" ? 0.2 : 0.1,
    includeAA: false,
    alpha: 0.2,
    diffColor: [255, 0, 0],
    aaColor: [255, 255, 0],
  })

  const mask = new Uint8Array(width * height)
  if (diffPixels > 0) {
    for (let i = 0, p = 0; p < mask.length; i += 4, p++) {
      if (diffPng.data[i] === 255 && diffPng.data[i + 1] === 0 && diffPng.data[i + 2] === 0) mask[p] = 1
    }
  }

  const total = width * height || 1
  const mismatchPercent = (diffPixels / total) * 100
  const tolerance = opts.tolerancePercent ?? 0
  const rawRegions =
    diffPixels > 0 ? findRegions(mask, width, height, opts.cellSize ?? 16, opts.minRegionPixels ?? 4) : []
  const noise = rawRegions.length === 0 || mismatchPercent <= tolerance

  const regions: DiffRegion[] = noise
    ? []
    : rawRegions.map(r => ({ ...r, hashBase: dHash(paddedBase, r), hashActual: dHash(paddedAct, r) }))

  return {
    width,
    height,
    diffPixels: noise ? 0 : diffPixels,
    mismatchPercent: noise ? 0 : mismatchPercent,
    regions,
    diff: regions.length ? diffPng : null,
  }
}

/** How close two hashes must be to count as the same picture (bits out of 64). */
export const SAME_CHANGE_MAX_HAMMING = 6

/**
 * Does `candidate` show the same change as `source`? Every region of the
 * candidate must match a distinct region of the source by size (within 10%, or
 * 8px for small boxes) and by BOTH hashes — what was there, and what is there
 * now. Requiring the baseline hash as well is what stops "a new logo" accepted on
 * one page from approving a broken image in the same box on another.
 */
export function isSameChange(source: DiffRegion[], candidate: DiffRegion[]): boolean {
  if (!source.length || !candidate.length) return false
  if (candidate.length > source.length) return false
  const used = new Set<number>()
  const sizeClose = (a: number, b: number) => Math.abs(a - b) <= Math.max(8, 0.1 * Math.max(a, b))
  for (const c of candidate) {
    let matched = -1
    for (let i = 0; i < source.length; i++) {
      if (used.has(i)) continue
      const s = source[i]
      if (!sizeClose(s.width, c.width) || !sizeClose(s.height, c.height)) continue
      if (hammingHex(s.hashBase, c.hashBase) > SAME_CHANGE_MAX_HAMMING) continue
      if (hammingHex(s.hashActual, c.hashActual) > SAME_CHANGE_MAX_HAMMING) continue
      matched = i
      break
    }
    if (matched < 0) return false
    used.add(matched)
  }
  return true
}

/** Faded page with changed pixels in red: the overlay the analyzer shows. */
export function renderDiffOverlay(actual: PNG, diff: PNG): PNG {
  const width = diff.width
  const height = diff.height
  const act = padTo(actual, width, height)
  const out = new PNG({ width, height })
  for (let i = 0; i < out.data.length; i += 4) {
    const isDiff = diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0
    if (isDiff) {
      out.data[i] = 230
      out.data[i + 1] = 0
      out.data[i + 2] = 60
    } else {
      const l = 0.299 * act.data[i] + 0.587 * act.data[i + 1] + 0.114 * act.data[i + 2]
      const faded = Math.round(190 + l * 0.25)
      out.data[i] = faded
      out.data[i + 1] = faded
      out.data[i + 2] = faded
    }
    out.data[i + 3] = 255
  }
  return out
}
