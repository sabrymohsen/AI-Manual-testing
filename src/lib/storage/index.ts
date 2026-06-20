import fs from "node:fs/promises"
import path from "node:path"
import { v4 as uuidv4 } from "uuid"

const STORAGE_ROOT = process.env.STORAGE_ROOT || "./storage"

export type StorageDir =
  | "screenshots"
  | "recordings"
  | "figma"
  | "diffs"
  | "traces"
  | "videos"
  | "exports"
  | "crops"
  | "dom_snapshots"
  | "visual-checks/figma"
  | "visual-checks/actual"
  | "visual-checks/diff"
  | "visual-checks/crops"
  | "visual-checks/reports"

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // directory already exists
  }
}

export async function saveFile(
  dir: StorageDir,
  filename: string,
  buffer: Buffer
): Promise<string> {
  const fullDir = path.join(STORAGE_ROOT, dir)
  const filePath = path.join(fullDir, filename)
  // Ensure the full parent directory tree exists (filename may contain subdirs)
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, buffer)
  return filePath
}

export async function readFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath)
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch {
    // file doesn't exist
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export function getStoragePath(dir: StorageDir): string {
  return path.join(STORAGE_ROOT, dir)
}
