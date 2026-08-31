// Section 1a — Test Data Manager helpers.
//
// The DB (TestDataFile) is the source of truth; every write is mirrored to disk
// so a spec can read its inputs at runtime. Files land next to the specs, in
// the workspace, so a test reaches them with a relative import:
//
//   import users from "../testData/users.json"
//
// They previously went to a Maven src/test/resources path for @Test(dataProvider),
// which no runner has read since the engine moved to Playwright.

import * as fs from "fs"
import * as path from "path"
import { WORKSPACE_ROOT } from "@/lib/hub-workspace"

export const TESTDATA_DIR = path.join(WORKSPACE_ROOT, "testData")

// A safe on-disk file name derived from a display name: letters/digits/_/-, .json
export function toFileName(name: string): string {
  const base = name.trim().replace(/\.json$/i, "").replace(/[^A-Za-z0-9_-]/g, "_")
  return `${base}.json`
}

export function isValidDataName(name: string): boolean {
  return /^[A-Za-z0-9_-]{1,60}$/.test(name.trim().replace(/\.json$/i, ""))
}

// Write JSON content to disk (best-effort — DB remains source of truth)
export function writeDataFileToDisk(fileName: string, content: string): string {
  fs.mkdirSync(TESTDATA_DIR, { recursive: true })
  const filePath = path.join(TESTDATA_DIR, fileName)
  fs.writeFileSync(filePath, content, "utf8")
  return filePath
}

export function removeDataFileFromDisk(fileName: string) {
  try {
    fs.unlinkSync(path.join(TESTDATA_DIR, fileName))
  } catch {
    // already gone — ignore
  }
}

// Derive the field/column names from the first record of a JSON data set.
// Supports both a top-level array and a { data: [...] } wrapper.
export function inferFields(content: string): string[] {
  try {
    const parsed = JSON.parse(content)
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [parsed]
    const keys = new Set<string>()
    for (const row of rows.slice(0, 20)) {
      if (row && typeof row === "object") Object.keys(row).forEach((k) => keys.add(k))
    }
    return Array.from(keys)
  } catch {
    return []
  }
}
