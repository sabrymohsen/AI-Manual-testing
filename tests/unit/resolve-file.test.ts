import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveStoredFile, storageSegments } from "@/lib/storage/resolve-file"

/**
 * /api/files used to serve any path a signed-in user asked for, including
 * the app's .env and absolute paths. These pin down that only files inside a
 * storage root resolve.
 */
describe("resolveStoredFile", () => {
  let root: string
  let outside: string
  const prev = process.env.STORAGE_ROOT

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "storage-"))
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"))
    fs.mkdirSync(path.join(root, "brds", "proj-1", "brd-1"), { recursive: true })
    fs.writeFileSync(path.join(root, "brds", "proj-1", "brd-1", "v1-spec.pdf"), "%PDF-1.4")
    fs.writeFileSync(path.join(outside, "secret.txt"), "nope")
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "link.txt"))
    process.env.STORAGE_ROOT = root
  })

  afterAll(() => {
    process.env.STORAGE_ROOT = prev
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })

  it("serves a file stored relative to the storage root", () => {
    const real = resolveStoredFile(["brds", "proj-1", "brd-1", "v1-spec.pdf"])
    expect(real).toBe(fs.realpathSync(path.join(root, "brds", "proj-1", "brd-1", "v1-spec.pdf")))
    expect(storageSegments(real!)).toEqual(["brds", "proj-1", "brd-1", "v1-spec.pdf"])
  })

  it("serves an absolute path that is inside storage", () => {
    const abs = path.join(root, "brds", "proj-1", "brd-1", "v1-spec.pdf")
    expect(resolveStoredFile(abs.split("/").filter(Boolean))).not.toBeNull()
  })

  it("refuses the app's .env and other files outside storage", () => {
    expect(resolveStoredFile([".env"])).toBeNull()
    expect(resolveStoredFile(["package.json"])).toBeNull()
    expect(resolveStoredFile(["etc", "passwd"])).toBeNull()
    expect(resolveStoredFile(outside.split("/").filter(Boolean).concat("secret.txt"))).toBeNull()
  })

  it("refuses traversal and symlinks that point outside", () => {
    expect(resolveStoredFile(["brds", "..", "..", "secret.txt"])).toBeNull()
    expect(resolveStoredFile(["link.txt"])).toBeNull()
  })

  it("refuses directories", () => {
    expect(resolveStoredFile(["brds"])).toBeNull()
  })
})
