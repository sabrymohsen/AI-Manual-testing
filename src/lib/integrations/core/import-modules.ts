/**
 * Modules from the tracker's Epics and Features.
 *
 * A module (TestSuite) describes a part of the system under test. In every
 * tracker this app integrates with, that shape already exists as an Epic or a
 * Feature — so rather than making people retype the product structure, a module
 * can be imported from one and stay linked to it.
 *
 * Deliberately CONTAINER types only. A Story or a Task is a unit of work, not a
 * part of the system: importing those would produce hundreds of modules that
 * each hold one test case. `searchByRole("epic")` is what enforces that, per
 * provider.
 *
 * What a link means, exactly:
 *   - the module's NAME and PARENT follow the tracker on refresh;
 *   - nothing else does — its cases, its bugs and its ordering are the app's
 *     own, and are never touched here;
 *   - unlinking or deleting the Epic upstream never deletes the module, because
 *     that would unfile every case and bug beneath it. A vanished Epic simply
 *     stops being refreshed.
 */
import { prisma } from "@/lib/db"
import { loadIntegration } from "./load-integration"
import type { WorkItem } from "./types"
import type { ProviderId } from "./types"

/** One Epic/Feature as offered to the import picker. */
export interface ImportableModule {
  externalId: string
  title: string
  /** Tracker type name — "Epic" or "Feature". */
  type: string | null
  url: string
  /** Tracker parent, used to nest a Feature under its Epic. */
  parentExternalId: string | null
  /** Set when this Epic is already a module here. */
  linkedSuiteId: string | null
  linkedSuiteName: string | null
}

export interface ImportableResult {
  provider: ProviderId | null
  /** Why there is nothing to show, when there is nothing to show. */
  unavailable?: "no-integration" | "provider-unsupported"
  items: ImportableModule[]
}

/** Modules already linked to this provider, keyed by external id. */
async function linkedByExternalId(projectId: string, provider: ProviderId) {
  const linked = await prisma.testSuite.findMany({
    where: { projectId, externalProvider: provider as any, externalId: { not: null } },
    select: { id: true, name: true, parentId: true, externalId: true },
  })
  return new Map(linked.map((s) => [s.externalId as string, s]))
}

/** The Epics/Features available in the tracker, marked with what is already imported. */
export async function listImportableModules(projectId: string): Promise<ImportableResult> {
  const loaded = await loadIntegration(projectId)
  if (!loaded) return { provider: null, unavailable: "no-integration", items: [] }

  const provider = loaded.getClient()
  if (!provider.searchByRole) {
    return { provider: loaded.provider, unavailable: "provider-unsupported", items: [] }
  }

  const [items, linked] = await Promise.all([
    provider.searchByRole("epic"),
    linkedByExternalId(projectId, loaded.provider),
  ])

  return {
    provider: loaded.provider,
    items: items.map((item) => {
      const match = linked.get(item.externalId)
      return {
        externalId: item.externalId,
        title: item.title,
        type: item.typeName,
        url: item.url || provider.workItemUrl(item.externalId),
        parentExternalId: item.parentId,
        linkedSuiteId: match?.id ?? null,
        linkedSuiteName: match?.name ?? null,
      }
    }),
  }
}

export interface ImportSummary {
  created: number
  linked: number
  skipped: number
  provider: ProviderId | null
  error?: string
}

/**
 * Create modules for the chosen Epics/Features, or link them to modules that
 * already match by name.
 *
 * Idempotent in both directions: an Epic already linked is skipped, and an Epic
 * whose title matches an existing unlinked module adopts that module rather
 * than creating a duplicate beside it. Re-running the import after adding two
 * Epics upstream adds exactly two modules.
 */
export async function importModules(
  projectId: string,
  externalIds: string[]
): Promise<ImportSummary> {
  const loaded = await loadIntegration(projectId)
  if (!loaded) return { created: 0, linked: 0, skipped: 0, provider: null, error: "No integration configured" }

  const provider = loaded.getClient()
  if (!provider.searchByRole) {
    return {
      created: 0, linked: 0, skipped: 0, provider: loaded.provider,
      error: `${loaded.provider} cannot list Epics or Features`,
    }
  }

  const wanted = new Set(externalIds)
  const all = await provider.searchByRole("epic")
  const chosen = all.filter((i) => wanted.has(i.externalId))

  const linked = await linkedByExternalId(projectId, loaded.provider)
  const existingByName = new Map(
    (
      await prisma.testSuite.findMany({
        where: { projectId, externalId: null },
        select: { id: true, name: true },
      })
    ).map((s) => [s.name.trim().toLowerCase(), s.id])
  )

  // Parents first, so a Feature imported alongside its Epic can nest under a
  // module that already exists by the time it is created.
  const ordered = orderParentsFirst(chosen)

  let created = 0
  let adopted = 0
  let skipped = 0
  // External id -> local suite id, for nesting within this same import.
  const localOf = new Map<string, string>()
  for (const [externalId, row] of linked) localOf.set(externalId, row.id)

  const maxOrder = await prisma.testSuite.aggregate({
    where: { projectId },
    _max: { orderIndex: true },
  })
  let nextOrder = (maxOrder._max.orderIndex ?? 0) + 1

  for (const item of ordered) {
    if (linked.has(item.externalId)) {
      skipped++
      continue
    }

    const parentId = item.parentId ? localOf.get(item.parentId) ?? null : null
    const link = {
      externalProvider: loaded.provider as any,
      externalId: item.externalId,
      externalType: item.typeName,
      externalUrl: item.url || provider.workItemUrl(item.externalId),
      externalSyncedAt: new Date(),
    }

    const adoptId = existingByName.get(item.title.trim().toLowerCase())
    if (adoptId) {
      // An "Onboarding" module already typed by hand IS this Epic. Adopting it
      // keeps the cases and bugs already filed under it; creating a second
      // "Onboarding" beside it would split them.
      const row = await prisma.testSuite.update({ where: { id: adoptId }, data: link })
      localOf.set(item.externalId, row.id)
      existingByName.delete(item.title.trim().toLowerCase())
      adopted++
      continue
    }

    const row = await prisma.testSuite.create({
      data: {
        projectId,
        name: item.title,
        description: null,
        parentId,
        orderIndex: nextOrder++,
        ...link,
      },
      select: { id: true },
    })
    localOf.set(item.externalId, row.id)
    created++
  }

  return { created, linked: adopted, skipped, provider: loaded.provider }
}

export interface RefreshSummary {
  checked: number
  updated: number
  missing: number
  provider: ProviderId | null
  skipped?: "no-integration" | "provider-unsupported" | "nothing-linked"
}

/**
 * Bring linked modules back in step with the tracker: name, type and parent.
 *
 * Only ever reads. A module whose Epic no longer exists upstream is counted as
 * missing and otherwise left exactly as it is — deleting it here would unfile
 * every case and bug beneath it over a tracker change nobody confirmed.
 */
export async function refreshLinkedModules(projectId: string): Promise<RefreshSummary> {
  const loaded = await loadIntegration(projectId)
  if (!loaded) return { checked: 0, updated: 0, missing: 0, provider: null, skipped: "no-integration" }

  const provider = loaded.getClient()
  if (!provider.searchByRole) {
    return {
      checked: 0, updated: 0, missing: 0,
      provider: loaded.provider, skipped: "provider-unsupported",
    }
  }

  const linkedRows = await prisma.testSuite.findMany({
    where: { projectId, externalProvider: loaded.provider as any, externalId: { not: null } },
    select: { id: true, name: true, parentId: true, externalId: true, externalType: true },
  })
  if (linkedRows.length === 0) {
    return { checked: 0, updated: 0, missing: 0, provider: loaded.provider, skipped: "nothing-linked" }
  }

  // One search rather than one getWorkItem per module: a project with 40 linked
  // modules costs a single tracker round-trip.
  const upstream = new Map((await provider.searchByRole("epic")).map((i) => [i.externalId, i]))
  const localOf = new Map(linkedRows.map((r) => [r.externalId as string, r.id]))

  let updated = 0
  let missing = 0
  for (const row of linkedRows) {
    const item = upstream.get(row.externalId as string)
    if (!item) {
      missing++
      continue
    }

    // A parent is adopted only when it is itself a linked module here, and never
    // the row itself — a module cannot be its own parent.
    const mappedParent = item.parentId ? localOf.get(item.parentId) ?? null : null
    const nextParent = mappedParent && mappedParent !== row.id ? mappedParent : row.parentId

    const data: Record<string, unknown> = {}
    if (item.title && item.title !== row.name) data.name = item.title
    if (item.typeName !== row.externalType) data.externalType = item.typeName
    if (nextParent !== row.parentId && !(await wouldCycle(row.id, nextParent))) {
      data.parentId = nextParent
    }

    if (Object.keys(data).length > 0) {
      await prisma.testSuite.update({
        where: { id: row.id },
        data: { ...data, externalSyncedAt: new Date() },
      })
      updated++
    }
  }

  return { checked: linkedRows.length, updated, missing, provider: loaded.provider }
}

/** Depth-first order with every parent before its children. */
function orderParentsFirst(items: WorkItem[]): WorkItem[] {
  const byId = new Map(items.map((i) => [i.externalId, i]))
  const out: WorkItem[] = []
  const placed = new Set<string>()

  const visit = (item: WorkItem, seen: Set<string>) => {
    if (placed.has(item.externalId) || seen.has(item.externalId)) return
    seen.add(item.externalId)
    const parent = item.parentId ? byId.get(item.parentId) : undefined
    if (parent) visit(parent, seen)
    if (!placed.has(item.externalId)) {
      placed.add(item.externalId)
      out.push(item)
    }
  }

  for (const item of items) visit(item, new Set())
  return out
}

/**
 * Would making `candidateParentId` the parent of `suiteId` close a loop?
 *
 * The tracker's own hierarchy is acyclic, but only part of it is mirrored here:
 * a module can be re-parented by hand between refreshes, and two halves of a
 * moved Epic can momentarily disagree. A cycle would make the tree infinite to
 * render, so it is cheaper to check than to recover from.
 */
async function wouldCycle(suiteId: string, candidateParentId: string | null): Promise<boolean> {
  if (!candidateParentId) return false
  if (candidateParentId === suiteId) return true

  let cursor: string | null = candidateParentId
  const seen = new Set<string>()
  while (cursor) {
    if (cursor === suiteId) return true
    if (seen.has(cursor)) return true
    seen.add(cursor)
    const row: { parentId: string | null } | null = await prisma.testSuite.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    })
    cursor = row?.parentId ?? null
  }
  return false
}
