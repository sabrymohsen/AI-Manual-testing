/**
 * Reconcile a Full-website test's saved pages with what the sitemap says today.
 * Pure: the worker applies the plan, the tests check it.
 *
 * Rules (the same ones Applitools documents for its full-website test):
 * - A page the sitemap adds is tested from now on, unless it sits in an
 *   excluded folder, in which case it is saved as excluded so it never surprises
 *   anyone later.
 * - A page a person excluded stays excluded even if the sitemap still lists it.
 * - A page the sitemap no longer lists is REMOVED — reported, not silently dropped.
 * - When discovery finds nothing at all (site down, sitemap 500), nothing is
 *   marked removed: "the sitemap is unreachable" is not "every page was deleted".
 * - The limit counts pages being tested. Pages keep their original order, so a
 *   page does not fall out of the test because a newer one appeared.
 */
import { isInExcludedFolder } from "./url-tools"

export interface ExistingPage {
  id: string
  urlKey: string
  url: string
  excluded: boolean
  removedAt: Date | null
}

export interface DiscoveredPage {
  url: string
  key: string
  folder: string
}

export interface PageSyncPlan {
  create: (DiscoveredPage & { excluded: boolean })[]
  /** Pages seen again: refresh lastSeenAt and clear removedAt. */
  seen: string[]
  /** Pages that disappeared from the sitemap this run. */
  removed: string[]
  discoveryFailed: boolean
}

export function planPageSync(
  existing: ExistingPage[],
  discovered: DiscoveredPage[],
  excludedFolders: string[],
  maxUrls: number
): PageSyncPlan {
  if (!discovered.length) {
    return { create: [], seen: [], removed: [], discoveryFailed: true }
  }
  const byKey = new Map(existing.map(p => [p.urlKey, p]))
  const discoveredKeys = new Set(discovered.map(d => d.key))

  const seen: string[] = []
  const create: PageSyncPlan["create"] = []
  let activeCount = existing.filter(p => !p.excluded && discoveredKeys.has(p.urlKey)).length

  for (const d of discovered) {
    const prior = byKey.get(d.key)
    if (prior) {
      seen.push(prior.id)
      continue
    }
    if (create.some(c => c.key === d.key)) continue
    const inExcluded = isInExcludedFolder(d.url, excludedFolders)
    if (!inExcluded && activeCount >= maxUrls) continue
    create.push({ ...d, excluded: inExcluded })
    if (!inExcluded) activeCount++
  }

  const removed = existing.filter(p => !p.excluded && !p.removedAt && !discoveredKeys.has(p.urlKey)).map(p => p.id)
  return { create, seen, removed, discoveryFailed: false }
}

/** Pages a run should capture, in saved order, up to the limit. */
export function activePages<T extends { excluded: boolean; removedAt: Date | null; url: string }>(
  pages: T[],
  excludedFolders: string[],
  maxUrls: number
): T[] {
  return pages.filter(p => !p.excluded && !p.removedAt && !isInExcludedFolder(p.url, excludedFolders)).slice(0, Math.max(1, maxUrls))
}
