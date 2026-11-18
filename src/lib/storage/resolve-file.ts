import fs from "node:fs"
import path from "node:path"

/**
 * Safe resolution of stored-file paths for /api/files.
 *
 * Stored paths come in three shapes: relative to STORAGE_ROOT ("brds/…"),
 * "storage/…" relative to the app, or absolute paths inside storage. Every
 * candidate is realpath-resolved and rejected unless it lands inside a storage
 * root, so "..", absolute paths and symlinks can't reach anything else (the
 * old route served /api/files/.env and any absolute path on disk).
 */

export function storageRoot() {
  return process.env.STORAGE_ROOT || "./storage"
}

export function allowedRoots(): string[] {
  const roots = [path.resolve(storageRoot()), path.resolve(process.cwd(), "storage")]
  return Array.from(new Set(roots.map((r) => (fs.existsSync(r) ? fs.realpathSync(r) : r))))
}

function isInside(file: string, root: string) {
  const rel = path.relative(root, file)
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
}

/** First candidate that exists, is a regular file and resolves inside a storage root. */
export function resolveStoredFile(segments: string[]): string | null {
  if (!segments.length || segments.some((s) => s === ".." || s.includes("\0"))) return null
  const roots = allowedRoots()
  const root = storageRoot()
  const withoutStoragePrefix = segments[0] === "storage" ? segments.slice(1) : segments
  const candidates = [
    path.join(root, ...segments),
    "/" + segments.join("/"),
    path.join(process.cwd(), ...segments),
    path.join(root, ...withoutStoragePrefix),
  ]
  for (const c of candidates) {
    let real: string
    try {
      real = fs.realpathSync(c)
    } catch {
      continue
    }
    if (!roots.some((r) => isInside(real, r))) continue
    try {
      if (!fs.statSync(real).isFile()) continue
    } catch {
      continue
    }
    return real
  }
  return null
}

/** Path of a resolved file relative to its storage root, split into segments. */
export function storageSegments(realFile: string): string[] {
  for (const r of allowedRoots()) {
    const rel = path.relative(r, realFile)
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep)
  }
  return []
}
