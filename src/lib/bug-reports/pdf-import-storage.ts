import path from "node:path"
import { storageRoot } from "@/lib/storage/resolve-file"

/** Where a PDF import keeps its screenshots between preview and create. */
export const IMPORT_URL_PREFIX = "/api/files/bug-imports"

const SAFE_ID = /^[A-Za-z0-9-]+$/

export function importDir(projectId: string, importId: string): string {
  if (!SAFE_ID.test(projectId) || !SAFE_ID.test(importId)) throw new Error("Invalid import id")
  return path.join(storageRoot(), "bug-imports", projectId, importId)
}

/** A screenshot file name produced by the preview step ("BUG-01_2.png"). */
export const SAFE_SHOT = /^BUG-\d+_\d+\.png$/
