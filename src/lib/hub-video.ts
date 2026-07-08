// Backend for the Video Lab (Section 10). Videos are the existing
// EvidenceFile rows with fileType='video' (SHAFT shaft-video / Appium native
// recording). Recording config persists to custom.properties; clips are cut
// with the real ffmpeg binary and registered back as video evidence so they
// also surface in the Evidence Vault.

import { prisma } from "@/lib/db"
import { execFile } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { MAVEN_PROJECT_PATH } from "@/lib/hub-evidence"

const CUSTOM_PROPS = path.join(MAVEN_PROJECT_PATH, "src/main/resources/properties/custom.properties")
export const CLIPS_DIR = path.join(MAVEN_PROJECT_PATH, "target/video-clips")

// ---------- custom.properties helpers ----------

function readProps(): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fs.existsSync(CUSTOM_PROPS)) return out
  for (const line of fs.readFileSync(CUSTOM_PROPS, "utf8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

function upsertProps(pairs: Record<string, string>) {
  let body = fs.existsSync(CUSTOM_PROPS) ? fs.readFileSync(CUSTOM_PROPS, "utf8") : ""
  for (const [key, value] of Object.entries(pairs)) {
    const lines = body.split("\n")
    let found = false
    const next = lines.map((line) => {
      if (line.trim().startsWith(`${key}=`) || line.trim() === key) {
        found = true
        return `${key}=${value}`
      }
      return line
    })
    if (!found) next.push(`${key}=${value}`)
    body = next.join("\n")
  }
  fs.mkdirSync(path.dirname(CUSTOM_PROPS), { recursive: true })
  fs.writeFileSync(CUSTOM_PROPS, body, "utf8")
}

// ---------- Recording settings ----------

export interface VideoSettings {
  recordVideo: boolean
  scope: string // "DriverSession" (per-test) | "TestRun" (whole suite)
  quality: string // "Low" | "Medium" | "High"
  format: string // "webm" | "mp4"
  autoDeleteDays: number // 0 = keep forever
  maxStorageMb: number
}

export function readVideoSettings(): VideoSettings {
  const p = readProps()
  return {
    recordVideo: p["videoParams.recordVideo"] === "true",
    scope: p["videoParams.scope"] || "DriverSession",
    quality: p["videoParams.quality"] || "Medium",
    format: p["videoParams.type"] || "webm",
    autoDeleteDays: Number(p["videoLab.autoDeleteDays"]) || 0,
    maxStorageMb: Number(p["videoLab.maxStorageMb"]) || 500
  }
}

export function writeVideoSettings(opts: Partial<VideoSettings>): VideoSettings {
  const pairs: Record<string, string> = {}
  if (opts.recordVideo !== undefined) pairs["videoParams.recordVideo"] = opts.recordVideo ? "true" : "false"
  if (opts.scope !== undefined) pairs["videoParams.scope"] = opts.scope
  if (opts.quality !== undefined) pairs["videoParams.quality"] = opts.quality
  if (opts.format !== undefined) pairs["videoParams.type"] = opts.format
  if (opts.autoDeleteDays !== undefined) pairs["videoLab.autoDeleteDays"] = String(Math.max(0, opts.autoDeleteDays))
  if (opts.maxStorageMb !== undefined) pairs["videoLab.maxStorageMb"] = String(Math.max(50, opts.maxStorageMb))
  upsertProps(pairs)
  return readVideoSettings()
}

// ---------- Storage usage ----------

export async function computeVideoStorage() {
  const vids = await prisma.evidenceFile.findMany({ where: { fileType: "video" } })
  let bytes = 0
  let count = 0
  for (const v of vids) {
    try {
      if (fs.existsSync(v.filePath)) {
        bytes += fs.statSync(v.filePath).size
        count++
      }
    } catch {}
  }
  return { count, bytes, mb: Math.round((bytes / 1024 / 1024) * 10) / 10 }
}

// ---------- Retention cleanup ----------

export async function cleanupOldVideos(days: number): Promise<number> {
  if (!days || days <= 0) return 0
  const cutoff = new Date(Date.now() - days * 86_400_000)
  const old = await prisma.evidenceFile.findMany({ where: { fileType: "video", createdAt: { lt: cutoff } } })
  let removed = 0
  for (const v of old) {
    try {
      const resolved = path.resolve(v.filePath)
      if (resolved.startsWith(MAVEN_PROJECT_PATH) && fs.existsSync(resolved)) fs.unlinkSync(resolved)
    } catch {}
    try {
      await prisma.evidenceFile.delete({ where: { id: v.id } })
      removed++
    } catch {}
  }
  return removed
}

// ---------- Clip creation (real ffmpeg) ----------

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function createClip(opts: {
  sourceEvidenceId: string
  startSec: number
  endSec: number
  title: string
  description?: string
}): Promise<{ id: string; filePath: string }> {
  const source = await prisma.evidenceFile.findUnique({ where: { id: opts.sourceEvidenceId } })
  if (!source || source.fileType !== "video") throw new Error("Source video not found")
  if (!fs.existsSync(source.filePath)) throw new Error("Source video missing on disk")

  const start = Math.max(0, opts.startSec)
  const duration = Math.max(0.2, opts.endSec - start)
  if (opts.endSec <= start) throw new Error("End must be after start")

  fs.mkdirSync(CLIPS_DIR, { recursive: true })
  const ext = (path.extname(source.filePath) || ".webm").toLowerCase()
  const safeTitle = (opts.title || "clip").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40)
  const outPath = path.join(CLIPS_DIR, `${safeTitle}-${Date.now()}${ext}`)

  // Frame-accurate cut: seek + trim AFTER the input and re-encode, so the clip
  // boundaries match the user's selection exactly (stream copy would snap to
  // keyframes). Encoder is chosen to match the container.
  const encoder =
    ext === ".mp4" || ext === ".mov"
      ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"]
      : ["-c:v", "libvpx", "-b:v", "1M"]
  await runFfmpeg(["-y", "-i", source.filePath, "-ss", String(start), "-t", String(duration), ...encoder, outPath])
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error("ffmpeg produced no output")
  }

  // Register the clip as a new video evidence row (also visible in Evidence Vault).
  const clip = await prisma.evidenceFile.create({
    data: {
      testExecutionId: source.testExecutionId,
      fileType: "video",
      filePath: outPath,
      stepNumber: 0,
      pageUrl: source.pageUrl,
      elementLocator: opts.description || "",
      status: source.status,
      tags: Array.from(new Set([...source.tags, "clip", opts.title].filter(Boolean)))
    }
  })
  return { id: clip.id, filePath: outPath }
}
