// Section 1a — Test Data Manager helpers.
// SHAFT reads external data-driven inputs from src/test/resources/testDataFiles/.
// The DB (TestDataFile) is the source of truth; every write is mirrored to disk
// so the Maven runner and @Test(dataProvider) can pick the JSON up at runtime.

import * as fs from "fs"
import * as path from "path"
import { MAVEN_PROJECT_PATH } from "@/lib/hub-evidence"

export const TESTDATA_DIR = path.join(MAVEN_PROJECT_PATH, "src/test/resources/testDataFiles")

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
