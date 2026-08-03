/**
 * Storage persistence check.
 *
 * Everything the app accepts as an upload — profile photos, BRD documents, bug
 * screenshots, recordings, evidence — is written under STORAGE_ROOT, while the
 * database stores only the *path* to it. If STORAGE_ROOT is not backed by a
 * persistent volume, a deploy ships a clean container filesystem: the rows
 * survive, the files don't, and every image on the site 404s until it is
 * re-uploaded.
 *
 * That failure is silent, which is what makes it expensive. This module drops a
 * marker file in STORAGE_ROOT and checks it on boot. If the marker is gone but
 * the database still references stored files, the volume did not persist — and
 * we say so loudly instead of letting it be rediscovered by hand.
 */
import { mkdir, readdir, readFile, writeFile, unlink } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { prisma } from "@/lib/db"

export const STORAGE_ROOT = process.env.STORAGE_ROOT || "./storage"

const MARKER_FILE = ".storage-marker.json"

type Marker = { id: string; createdAt: string }

export type StorageHealth = {
  root: string
  absoluteRoot: string
  writable: boolean
  /** The marker was already there — storage survived at least one restart. */
  persisted: boolean
  markerCreatedAt: string | null
  /**
   * Marker missing while the database still points at stored files: the
   * strongest available signal that the volume is ephemeral.
   */
  looksEphemeral: boolean
  referencedFiles: number
  error: string | null
}

/**
 * Inspect STORAGE_ROOT and (re)create the marker. Safe to call on every boot;
 * never throws.
 */
export async function checkStorageHealth(): Promise<StorageHealth> {
  const absoluteRoot = path.resolve(STORAGE_ROOT)
  const health: StorageHealth = {
    root: STORAGE_ROOT,
    absoluteRoot,
    writable: false,
    persisted: false,
    markerCreatedAt: null,
    looksEphemeral: false,
    referencedFiles: 0,
    error: null,
  }

  try {
    await mkdir(STORAGE_ROOT, { recursive: true })

    // Prove writability rather than assuming it — a mounted-but-root-owned
    // volume fails here with EACCES, which is a different fix from "no volume".
    const probe = path.join(STORAGE_ROOT, `.write-probe-${randomUUID()}`)
    await writeFile(probe, "ok")
    await unlink(probe).catch(() => {})
    health.writable = true
  } catch (e: any) {
    health.error = `${e?.code || "WRITE_FAILED"}: ${e?.message || String(e)}`
    return health
  }

  const markerPath = path.join(STORAGE_ROOT, MARKER_FILE)
  let marker: Marker | null = null
  try {
    marker = JSON.parse(await readFile(markerPath, "utf8")) as Marker
  } catch {
    marker = null
  }

  if (marker?.createdAt) {
    health.persisted = true
    health.markerCreatedAt = marker.createdAt
    return health
  }

  // No marker. Three cases to tell apart:
  //   a) genuinely first run          -> storage empty, DB references nothing
  //   b) first run after this upgrade -> storage still HAS the files, just no
  //                                      marker yet. Not a problem.
  //   c) the volume was wiped         -> storage empty, but the DB still points
  //                                      at files. This is the one to shout about.
  let storageHasContent = false
  try {
    const entries = await readdir(STORAGE_ROOT)
    storageHasContent = entries.some((e) => e !== MARKER_FILE && !e.startsWith(".write-probe-"))
  } catch {
    storageHasContent = false
  }

  try {
    const [avatars, brdVersions] = await Promise.all([
      prisma.user.count({ where: { avatarUrl: { not: null } } }),
      prisma.brdVersion.count(),
    ])
    health.referencedFiles = avatars + brdVersions
    // Files are referenced but the directory came up empty — they're gone.
    health.looksEphemeral = health.referencedFiles > 0 && !storageHasContent
  } catch {
    // DB not reachable yet — leave looksEphemeral false rather than guess.
  }

  const fresh: Marker = { id: randomUUID(), createdAt: new Date().toISOString() }
  await writeFile(markerPath, JSON.stringify(fresh, null, 2)).catch(() => {})
  health.markerCreatedAt = fresh.createdAt

  return health
}

/** Boot-time report. One clear line on success, a loud block on trouble. */
export async function logStorageHealth(): Promise<StorageHealth> {
  const h = await checkStorageHealth()

  if (!h.writable) {
    console.error(
      `\n!!! STORAGE NOT WRITABLE !!!\n` +
        `  STORAGE_ROOT = ${h.root}  (${h.absoluteRoot})\n` +
        `  ${h.error}\n` +
        `  Uploads (avatars, BRDs, screenshots, evidence) WILL FAIL.\n` +
        `  Mount a persistent volume at this path and make it writable by the app user.\n`
    )
    return h
  }

  if (h.looksEphemeral) {
    console.warn(
      `\n!!! STORAGE APPEARS EPHEMERAL !!!\n` +
        `  STORAGE_ROOT = ${h.root}  (${h.absoluteRoot})\n` +
        `  The storage marker is missing, but the database still references ` +
        `${h.referencedFiles} stored file(s).\n` +
        `  Those files were lost — this deploy started with an empty filesystem.\n` +
        `  Mount a persistent volume at ${h.absoluteRoot} to stop losing uploads on every deploy.\n`
    )
    return h
  }

  if (h.persisted) {
    console.log(`> Storage OK at ${h.absoluteRoot} (persistent since ${h.markerCreatedAt})`)
  } else {
    console.log(`> Storage initialised at ${h.absoluteRoot} (first run — marker written)`)
  }
  return h
}
