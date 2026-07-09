// Annotation editor — shared types (Phase 1 Konva foundation + Phase 2 tools).
// Coordinates are ALWAYS in image space (natural pixels). Display zoom/pan is a
// stage transform on top; export renders the model at natural resolution.

export type ToolId =
  | "select"
  | "rect"
  | "highlight"
  | "ellipse"
  | "arrow"
  | "text"
  | "blur"
  | "crop"
  // Phase 2 tools
  | "line"
  | "freehand"
  | "pixelate"
  | "number"
  | "sticker"
  | "measure"
  | "spotlight"
  | "magnifier"

export type AnnotationType =
  | "rect"
  | "highlight"
  | "blur"
  | "ellipse"
  | "arrow"
  | "text"
  | "line"
  | "freehand"
  | "pixelate"
  | "number"
  | "sticker"
  | "measure"
  | "spotlight"

export interface Annotation {
  id: string
  type: AnnotationType
  // Box types (rect/highlight/blur/ellipse/pixelate/measure/spotlight) + text/
  // number/sticker anchor use x/y (+ width/height for boxes).
  x: number
  y: number
  width: number
  height: number
  // Arrow/line use [x1,y1,x2,y2]; freehand uses a flat [x0,y0,x1,y1,…] polyline.
  points?: number[]
  text?: string
  fontSize?: number
  // Numbering badge value; sticker catalog key.
  badge?: number
  sticker?: string
  rotation?: number
  color: string
  strokeWidth: number
  locked?: boolean
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Snapshot {
  annotations: Annotation[]
  crop: CropRect | null
}

export const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#000000", "#ffffff"]

export const uid = () => Math.random().toString(36).slice(2, 10)

// Box-shaped types share the rect drawing flow + Transformer handles.
export const BOX_TYPES: ReadonlySet<AnnotationType> = new Set([
  "rect",
  "highlight",
  "blur",
  "ellipse",
  "pixelate",
  "measure",
  "spotlight",
])

// Single-click placement types.
export const POINT_TYPES: ReadonlySet<AnnotationType> = new Set(["number", "sticker"])

// QA sticker catalog. kind "badge" = colored text pill; "emoji" = glyph.
export interface StickerDef {
  key: string
  label: string
  kind: "badge" | "emoji"
  color?: string
}
export const STICKERS: StickerDef[] = [
  { key: "bug", label: "BUG", kind: "badge", color: "#ef4444" },
  { key: "fixed", label: "FIXED", kind: "badge", color: "#22c55e" },
  { key: "review", label: "NEEDS REVIEW", kind: "badge", color: "#eab308" },
  { key: "approved", label: "APPROVED", kind: "badge", color: "#3b82f6" },
  { key: "blocker", label: "BLOCKER", kind: "badge", color: "#7c3aed" },
  { key: "star", label: "⭐", kind: "emoji" },
  { key: "warning", label: "⚠️", kind: "emoji" },
  { key: "check", label: "✅", kind: "emoji" },
  { key: "point", label: "👉", kind: "emoji" },
  { key: "fire", label: "🔥", kind: "emoji" },
]
export const stickerByKey = (k?: string) => STICKERS.find((s) => s.key === k) || STICKERS[0]

// Crop aspect-ratio presets. null = freeform.
export const ASPECT_RATIOS: { key: string; label: string; ratio: number | null }[] = [
  { key: "free", label: "Freeform", ratio: null },
  { key: "16:9", label: "16:9", ratio: 16 / 9 },
  { key: "4:3", label: "4:3", ratio: 4 / 3 },
  { key: "1:1", label: "1:1", ratio: 1 },
]

export const MAGNIFIER_POWERS = [2, 4] as const

// Keyboard shortcut → tool. Single-key, no modifiers (handled in the editor).
export const TOOL_SHORTCUTS: Record<string, ToolId> = {
  v: "select",
  r: "rect",
  h: "highlight",
  e: "ellipse",
  a: "arrow",
  t: "text",
  b: "blur",
  c: "crop",
  l: "line",
  p: "freehand",
  n: "number",
  s: "sticker",
  m: "measure",
  g: "magnifier",
  k: "pixelate",
  o: "spotlight",
}

export const ZOOM_MIN = 0.1 // 10%
export const ZOOM_MAX = 8 // 800%
export const ZOOM_STEP = 0.01 // 1% per click, per spec

// ── Phase 3: metadata + issue templates ──
export type Severity = "critical" | "major" | "minor" | "trivial"

export interface ScreenshotMetadata {
  title: string
  description: string
  tags: string[]
  url: string
  severity: Severity | null
  // Auto-captured (read-only in UI)
  capturedAt: string
  os: string
  browser: string
  dimensions: string // "W × H"
}

export const SEVERITY_META: Record<Severity, { label: string; color: string }> = {
  critical: { label: "Critical", color: "#dc2626" },
  major: { label: "Major", color: "#ea580c" },
  minor: { label: "Minor", color: "#ca8a04" },
  trivial: { label: "Trivial", color: "#2563eb" },
}

// Quick-insert QA bug report body per severity.
export const ISSUE_TEMPLATES: Record<Severity, string> = {
  critical:
    "### 🔴 Critical Bug\n\n**Steps to reproduce:**\n1. \n2. \n\n**Expected:** \n**Actual:** \n\n**Impact:** Blocks core functionality / data loss / security.",
  major:
    "### 🟠 Major Bug\n\n**Steps to reproduce:**\n1. \n2. \n\n**Expected:** \n**Actual:** \n\n**Impact:** Significant feature broken, workaround exists.",
  minor:
    "### 🟡 Minor Bug\n\n**Steps to reproduce:**\n1. \n\n**Expected:** \n**Actual:** \n\n**Impact:** Cosmetic / low-severity behavior issue.",
  trivial:
    "### 🔵 Trivial\n\n**Note:** \n\n**Impact:** Nitpick / polish; no functional effect.",
}

// Browser/OS detection from a user-agent string.
export function detectPlatform(ua: string): { os: string; browser: string } {
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
    ? "macOS"
    : /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Linux/.test(ua)
    ? "Linux"
    : "Unknown"
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Unknown"
  return { os, browser }
}
