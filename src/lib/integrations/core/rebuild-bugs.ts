/**
 * rebuildTrackerBugs — wipe every bug work item out of the connected tracker and
 * push the app's bugs back as a clean set.
 *
 * This exists because a tracker's bug list can drift out of shape: duplicate work
 * items from interrupted syncs, cards nobody can account for, bugs people filed
 * directly in the tracker that the app never knew about. Fixing that by hand is
 * hours of clicking; this rebuilds it in one pass.
 *
 * Order matters, and it is chosen so nothing is ever lost:
 *   1. Read every bug-type work item in the tracker project.
 *   2. Any that the app doesn't already know about is IMPORTED as a BugReport
 *      first — that work item is the only copy of it, so it becomes app-owned
 *      before anything is destroyed.
 *   3. Delete the work items. A work item whose delete fails keeps its mapping,
 *      so the re-sync updates it instead of creating yet another duplicate.
 *   4. Re-sync every bug in the app, which recreates them from scratch.
 *
 * Deletion is permanent — the tracker has no undo — so callers must confirm.
 * The whole operation is re-runnable: a partial run (timeout, network blip)
 * picks up where it left off, because each step is idempotent on its own.
 */
import { prisma } from "@/lib/db"
import { loadIntegration } from "./load-integration"
import { syncBugReport } from "./sync-bug-report"
import { entityMarker } from "./types"
import type { WorkItem } from "./types"
import type { WorkItemProvider } from "./provider"
import { nextBugKey } from "@/lib/bug-reports/keys"

/** What the rebuild will do with a single tracker work item. */
export type RebuildAction = "delete" | "import-then-delete"

export interface RebuildPlanItem {
  externalId: string
  title: string
  url: string
  action: RebuildAction
  /** The app bug this work item belongs to, when it has one. */
  localBugId: string | null
}

export interface RebuildBugsPlan {
  provider: string
  /** Bug-type work items found in the tracker project. */
  trackerBugs: number
  /** Already represented in the app — deleted and recreated by the re-sync. */
  linked: number
  /** Tracker-only — imported into the app, then deleted. */
  unlinked: number
  /** App bugs that the re-sync will push back (including the newly imported). */
  localBugs: number
  items: RebuildPlanItem[]
}

export interface RebuildBugsResult extends RebuildBugsPlan {
  imported: number
  deleted: number
  deleteFailed: number
  resynced: number
  resyncFailed: number
  /** Human-readable reasons, capped — enough to diagnose without flooding. */
  errors: string[]
}

const MARKER_RE = /AI-Manual-QA-Tester:BugReport:([0-9a-f-]{36})/i
const MAX_REPORTED_ERRORS = 20

/**
 * Decide what to do with one tracker work item.
 *
 * A work item counts as "already in the app" when a sync mapping points at it,
 * or when the marker this app writes into every description names a bug that
 * still exists. A marker naming a bug that was since deleted locally is treated
 * as tracker-only, so the bug isn't silently lost.
 */
export function classifyTrackerBug(
  item: Pick<WorkItem, "externalId" | "description">,
  mappedExternalIds: Set<string>,
  liveLocalBugIds: Set<string>
): { action: RebuildAction; localBugId: string | null } {
  if (mappedExternalIds.has(String(item.externalId))) {
    return { action: "delete", localBugId: null }
  }
  const marker = (item.description || "").match(MARKER_RE)
  if (marker && liveLocalBugIds.has(marker[1])) {
    return { action: "delete", localBugId: marker[1] }
  }
  return { action: "import-then-delete", localBugId: null }
}

/** Tracker priority/severity names → the app's four levels. */
function mapPriority(name: string | null | undefined): "Low" | "Medium" | "High" | "Critical" {
  const t = (name || "").toLowerCase()
  if (t.includes("immediate") || t.includes("critical") || t.includes("urgent")) return "Critical"
  if (t.includes("high")) return "High"
  if (t.includes("low")) return "Low"
  return "Medium"
}

/** Tracker status names → BugStatus. Anything unrecognised starts as Open. */
function mapStatus(name: string | null | undefined) {
  const t = (name || "").toLowerCase()
  if (t.includes("progress") || t.includes("develop")) return "InProgress" as const
  if (t.includes("test") || t.includes("retest") || t.includes("review")) return "ReadyForRetest" as const
  if (t.includes("reject") || t.includes("invalid") || t.includes("wont")) return "Rejected" as const
  if (t.includes("duplicate")) return "Duplicate" as const
  if (t.includes("closed")) return "Closed" as const
  if (t.includes("resolved") || t.includes("fixed") || t.includes("done")) return "Resolved" as const
  return "Open" as const
}

async function loadProviderAndBugs(projectId: string) {
  const loaded = await loadIntegration(projectId)
  if (!loaded) throw new Error("No project-management integration configured")

  const provider = loaded.getClient()
  if (!provider.searchByRole) {
    throw new Error(`${loaded.provider} cannot list bugs, so a rebuild is not available for it`)
  }
  if (!provider.deleteWorkItem) {
    throw new Error(`${loaded.provider} does not support deleting work items`)
  }

  const [found, mappings, localBugs] = await Promise.all([
    provider.searchByRole("bug"),
    prisma.externalSyncMapping.findMany({
      where: { projectId, provider: loaded.provider as any, localEntityType: "BugReport" },
      select: { id: true, externalId: true, localEntityId: true },
    }),
    prisma.bugReport.findMany({ where: { projectId }, select: { id: true } }),
  ])

  // Second line of defence. Everything returned here is queued for permanent
  // deletion, so we do not take the provider's word for "these are the bugs":
  // each item is re-checked against the bug type this project actually syncs to.
  // If that type can't be determined, nothing qualifies — a rebuild that finds
  // nothing is a fixable annoyance; one that deletes a project's tasks is not.
  const bugTypeId = loaded.typeMapping.bug || (await detectBugTypeId(provider))
  const items = found.filter((item) => isBugWorkItem(item, bugTypeId))

  return { loaded, provider, items, mappings, localBugs }
}

/**
 * Whether a work item is in scope for deletion. Deliberately strict: no known
 * bug type means nothing is in scope, and an item with no type never is.
 */
export function isBugWorkItem(
  item: Pick<WorkItem, "typeId">,
  bugTypeId: string | null
): boolean {
  if (!bugTypeId || item.typeId == null) return false
  return String(item.typeId) === String(bugTypeId)
}

/** The tracker's own "Bug" type, when the project has no explicit mapping. */
async function detectBugTypeId(provider: WorkItemProvider): Promise<string | null> {
  try {
    const types = await provider.getTypes()
    return types.find((t) => /^(bug|defect)$/i.test(t.name))?.id || null
  } catch {
    return null
  }
}

/** Dry run: exactly what a rebuild would do, without touching anything. */
export async function planBugRebuild(projectId: string): Promise<RebuildBugsPlan> {
  const { loaded, items, mappings, localBugs } = await loadProviderAndBugs(projectId)

  const mappedExternalIds = new Set(mappings.map((m) => String(m.externalId)).filter(Boolean))
  const liveLocalBugIds = new Set(localBugs.map((b) => b.id))

  const planItems: RebuildPlanItem[] = items.map((item) => {
    const { action, localBugId } = classifyTrackerBug(item, mappedExternalIds, liveLocalBugIds)
    return { externalId: String(item.externalId), title: item.title, url: item.url, action, localBugId }
  })

  const unlinked = planItems.filter((i) => i.action === "import-then-delete").length
  return {
    provider: loaded.provider,
    trackerBugs: planItems.length,
    linked: planItems.length - unlinked,
    unlinked,
    // The tracker-only ones become app bugs before the re-sync runs.
    localBugs: localBugs.length + unlinked,
    items: planItems,
  }
}

/** Create an app bug from a tracker work item that the app never knew about. */
async function importTrackerBug(projectId: string, item: WorkItem): Promise<string> {
  const bugKey = await nextBugKey(projectId)
  const title = item.title.replace(/^\[BUG\]\s*/i, "").trim() || `Work item ${item.externalId}`

  const bug = await prisma.bugReport.create({
    data: {
      bugKey,
      title,
      projectId,
      severity: mapPriority(item.priorityName),
      priority: mapPriority(item.priorityName),
      status: mapStatus(item.statusName),
      // The tracker has one free-text body; it describes what happened, which is
      // the closest match to "steps to reproduce" the app has a field for.
      stepsToReproduce: item.description || "",
      expectedResult: "",
      actualResult: "",
      assignedTo: item.assigneeId || null,
      roleUsed: "None",
      browser: "Chromium",
      viewport: "Desktop",
    },
  })

  await prisma.bugActivity.create({
    data: {
      bugId: bug.id,
      action: "Imported",
      details: `Imported from work item #${item.externalId} (${item.url}) during a tracker rebuild.`,
    },
  })

  return bug.id
}

/**
 * Run the rebuild. Destructive: deletes every bug work item in the tracker
 * project. Callers are responsible for confirming with the user first.
 */
export async function rebuildTrackerBugs(
  projectId: string,
  opts: { resync?: boolean } = {}
): Promise<RebuildBugsResult> {
  // Pushing the bugs back is the default, but skipping it is a real workflow:
  // it leaves both sides genuinely empty — tracker cleared, every bug in the app
  // reading "Not Synced" and the synced count at zero — so the next sync starts
  // from a known state instead of from whatever a half-finished run left behind.
  const resync = opts.resync !== false
  const { loaded, provider, items, mappings, localBugs } = await loadProviderAndBugs(projectId)

  const mappedExternalIds = new Set(mappings.map((m) => String(m.externalId)).filter(Boolean))
  const liveLocalBugIds = new Set(localBugs.map((b) => b.id))
  const errors: string[] = []
  const note = (msg: string) => {
    if (errors.length < MAX_REPORTED_ERRORS) errors.push(msg)
  }

  const planItems: RebuildPlanItem[] = []
  let imported = 0
  let deleted = 0
  let deleteFailed = 0
  const deletedExternalIds = new Set<string>()

  for (const item of items) {
    const externalId = String(item.externalId)
    const { action } = classifyTrackerBug(item, mappedExternalIds, liveLocalBugIds)
    let localBugId: string | null = null

    // Import BEFORE deleting: if the import fails, the work item survives and
    // nothing is lost. Skipping the delete is the safe half of that trade.
    if (action === "import-then-delete") {
      try {
        localBugId = await importTrackerBug(projectId, item)
        imported++
      } catch (err: any) {
        note(`Import of #${externalId} failed, so it was left in place: ${err?.message}`)
        planItems.push({ externalId, title: item.title, url: item.url, action, localBugId: null })
        continue
      }
    }

    try {
      await provider.deleteWorkItem(externalId)
      deleted++
      deletedExternalIds.add(externalId)
    } catch (err: any) {
      deleteFailed++
      note(`Delete of #${externalId} failed: ${err?.message}`)
    }
    planItems.push({ externalId, title: item.title, url: item.url, action, localBugId })
  }

  // Clear every link except the ones pointing at a work item that is still
  // there. That covers three cases at once, and getting it wrong leaves bugs
  // permanently unsyncable:
  //   - we just deleted the work item                → link is dead
  //   - the link pointed at a work item deleted in   → link was already dead,
  //     the tracker earlier, by hand                   and updating it 404s
  //   - a claim row from a run that was interrupted  → blocks the bug as
  //     (no external id yet)                            "sync already running"
  // Links to work items we failed to delete survive, so the re-sync updates
  // that survivor instead of adding a second one next to it.
  const survivingIds = new Set(
    planItems.filter((i) => !deletedExternalIds.has(i.externalId)).map((i) => i.externalId)
  )
  const deadMappingIds = mappings
    .filter((m) => !m.externalId || !survivingIds.has(String(m.externalId)))
    .map((m) => m.id)
  if (deadMappingIds.length > 0) {
    await prisma.externalSyncMapping.deleteMany({ where: { id: { in: deadMappingIds } } })
  }

  if (!resync) {
    const remaining = await prisma.bugReport.count({ where: { projectId } })
    return {
      provider: loaded.provider,
      trackerBugs: planItems.length,
      linked: planItems.length - planItems.filter((i) => i.action === "import-then-delete").length,
      unlinked: planItems.filter((i) => i.action === "import-then-delete").length,
      localBugs: remaining,
      items: planItems,
      imported,
      deleted,
      deleteFailed,
      resynced: 0,
      resyncFailed: 0,
      errors,
    }
  }

  // Push every app bug back, oldest first so the tracker's numbering follows the
  // order the bugs were filed in.
  const toSync = await prisma.bugReport.findMany({
    where: { projectId },
    select: { id: true, bugKey: true },
    orderBy: { createdAt: "asc" },
  })
  let resynced = 0
  let resyncFailed = 0
  for (const bug of toSync) {
    try {
      const result = await syncBugReport(bug.id)
      if (result.status === "skipped") {
        resyncFailed++
        note(`${bug.bugKey || bug.id}: ${result.reason}`)
      } else {
        resynced++
      }
    } catch (err: any) {
      resyncFailed++
      note(`${bug.bugKey || bug.id}: ${err?.message}`)
    }
  }

  const unlinked = planItems.filter((i) => i.action === "import-then-delete").length
  return {
    provider: loaded.provider,
    trackerBugs: planItems.length,
    linked: planItems.length - unlinked,
    unlinked,
    localBugs: toSync.length,
    items: planItems,
    imported,
    deleted,
    deleteFailed,
    resynced,
    resyncFailed,
    errors,
  }
}

/** Exposed for the marker used in descriptions, so tests can build fixtures. */
export const bugMarker = (bugId: string) => entityMarker("BugReport", bugId)
