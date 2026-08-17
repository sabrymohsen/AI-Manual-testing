/**
 * syncBugReport — provider-agnostic sync of a BugReport to the connected tracker.
 *
 * Replaces syncBugReportToOpenProject: same description building, attachment
 * de-dup, board placement, priority/source/custom-field mapping — now expressed
 * against WorkItemProvider so it works for OpenProject, Jira, Azure DevOps and
 * ClickUp. The connected provider + config is resolved via loadIntegration.
 *
 * Never assumes a request context — safe to call from the recorder worker.
 */
import fs from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/db"
import { loadIntegration, persistDetectedBugType } from "./load-integration"
import { normalizeStoredCustomFields } from "./custom-fields"
import type { WorkItemProvider } from "./provider"
import type { BoardColumn, WorkItemInput } from "./types"
import { IMAGE_CONTENT_TYPES, entityMarker } from "./types"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

/**
 * How long a mapping row that has been claimed but has no external id yet is
 * treated as "a sync is running". Past this, the claim is assumed to be from an
 * attempt that died and is taken over. Comfortably longer than a sync that is
 * uploading attachments, short enough that a crash isn't a permanent block.
 */
const STALE_CLAIM_MS = 5 * 60 * 1000

/**
 * Does this provider error mean "the work item you asked about isn't there any
 * more"? Distinguishing that from a transient failure decides whether we
 * recreate the item or leave the link alone and surface the error.
 */
export function isMissingRemoteItem(err: unknown): boolean {
  const message = String((err as { message?: unknown } | null)?.message ?? err ?? "")
  return /\b404\b|resource not found|not found|no longer exists/i.test(message)
}

/**
 * Resolves a stored screenshot/attachment reference to an on-disk file.
 * Handles public uploads (/uploads/...), files served via /api/files/..., raw
 * storage-relative paths, and absolute paths. Returns null when not found.
 */
function resolveLocalFile(ref: string): string | null {
  if (!ref) return null
  const STORAGE_ROOT = process.env.STORAGE_ROOT || "./storage"
  let rel = ref
  const apiMatch = ref.match(/^\/api\/files\/(.+)$/)
  if (apiMatch) rel = "/" + apiMatch[1]

  const candidates = [
    path.join(process.cwd(), "public", rel),
    path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel),
    path.join(process.cwd(), STORAGE_ROOT, rel.replace(/^\//, "")),
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
    } catch {
      // ignore and try next candidate
    }
  }
  return null
}

/**
 * Uploads the bug's screenshot and image attachments to the work item, skipping
 * any file already present (by name) so re-syncs don't duplicate. Best-effort.
 */
async function syncBugAttachments(
  provider: WorkItemProvider,
  externalId: string,
  screenshotPath: string | null,
  attachments: Array<{ fileName: string; filePath: string }>
): Promise<void> {
  const refs: Array<{ name: string; ref: string }> = []
  const seenRefs = new Set<string>()
  const pushRef = (ref: string | null, name?: string) => {
    if (!ref || seenRefs.has(ref)) return
    seenRefs.add(ref)
    refs.push({ ref, name: name || path.basename(ref) })
  }
  for (const a of attachments) pushRef(a.filePath, a.fileName)
  pushRef(screenshotPath || null)
  if (refs.length === 0) return

  let existingNames: string[] = []
  try {
    existingNames = await provider.getAttachmentNames(externalId)
  } catch {
    existingNames = []
  }

  for (const { name, ref } of refs) {
    const ext = path.extname(name).toLowerCase()
    const contentType = IMAGE_CONTENT_TYPES[ext]
    if (!contentType) continue
    if (existingNames.includes(name)) continue
    const filePath = resolveLocalFile(ref)
    if (!filePath) {
      console.warn(`[sync-bug-report] Attachment file not found on disk: ${ref}`)
      continue
    }
    try {
      const buffer = fs.readFileSync(filePath)
      await provider.uploadAttachment(externalId, name, buffer, contentType)
    } catch (err: any) {
      console.warn(`[sync-bug-report] Failed to attach "${name}" to ${externalId}: ${err?.message}`)
    }
  }
}

/**
 * Places / moves a synced bug on the given board.
 *
 * The tracker board is a shared surface: the app decides where a card starts,
 * but from then on people drag cards around in the tracker itself. So a sync
 * only asserts a column when the app-side choice actually CHANGED since the
 * last sync (`placedColumnId`, recorded on the mapping); otherwise it leaves
 * the card wherever the user put it. Re-asserting the stored column on every
 * sync — what this used to do — dragged cards back to their original column
 * and, racing the user's own drag, could leave the same card showing in two.
 *
 *  - new card                      → drop into the chosen/first column
 *  - app-side column changed       → reconcile to EXACTLY that column
 *  - card missing from a basic board → put it back (chosen/first column)
 *  - otherwise                     → leave as-is; the tracker wins
 *
 * Returns the column id actually placed into, or undefined when nothing was
 * placed (so the caller only records real placements). Best-effort: never throws.
 */
export async function placeBugOnBoard(
  provider: WorkItemProvider,
  boardId: string,
  externalId: string,
  columnId: string | null | undefined,
  isCreate: boolean,
  placedColumnId: string | null | undefined
): Promise<string | undefined> {
  try {
    const columns = await provider.getBoardColumns(boardId)
    if (!columns.length) return undefined
    const chosen: BoardColumn | null = columnId
      ? columns.find((c) => String(c.id) === String(columnId)) || null
      : null
    const col = chosen || columns[0]

    if (isCreate) {
      await provider.placeOnColumn(boardId, col, externalId)
      return String(col.id)
    }
    // The app-side column moved since we last placed the card: honour it.
    if (chosen && String(columnId) !== String(placedColumnId ?? "")) {
      await provider.reconcileColumn(boardId, chosen, externalId)
      return String(chosen.id)
    }
    if (col.columnType === "basic" && !(await provider.boardContains(boardId, externalId))) {
      await provider.placeOnColumn(boardId, col, externalId)
      return String(col.id)
    }
    return undefined
  } catch (err: any) {
    console.warn(`[sync-bug-report] Board placement for ${externalId} skipped: ${err?.message}`)
    return undefined
  }
}

/**
 * Reflects the app-side "Bug Source" onto a matching /source/i list custom field
 * on the bug type, if the provider exposes one. Best-effort.
 */
async function applyBugSource(
  provider: WorkItemProvider,
  bugTypeId: string | null,
  source: string | null | undefined,
  linkFields: Record<string, string | string[]>
): Promise<void> {
  if (!source || !bugTypeId) return
  try {
    const fields = await provider.getTypeCustomFields(bugTypeId, { onlyRequired: false })
    const sf = fields.find((f) => /source/i.test(f.name) && f.allowedValues.length > 0)
    if (!sf) return
    const match = sf.allowedValues.find((v) => v.title === source)
    if (!match) return
    linkFields[sf.key] = sf.isMulti ? [match.id] : match.id
  } catch (err: any) {
    console.warn(`[sync-bug-report] Bug source mapping skipped: ${err?.message}`)
  }
}

/** Map the app priority (Low/Medium/High/Critical) to the provider's priority id by name. */
async function resolvePriorityId(
  provider: WorkItemProvider,
  appPriority: string | null | undefined
): Promise<string | null> {
  if (!appPriority) return null
  try {
    const priorities = await provider.getPriorities()
    if (!priorities.length) return null
    const wanted = appPriority.toLowerCase()
    const aliases: Record<string, string[]> = {
      low: ["low"],
      medium: ["normal", "medium"],
      high: ["high"],
      critical: ["immediate", "critical", "urgent"],
    }
    const candidates = aliases[wanted] || [wanted]
    const match =
      priorities.find((p) => candidates.includes(p.name.toLowerCase())) ||
      priorities.find((p) => p.name.toLowerCase() === wanted)
    return match ? match.id : null
  } catch {
    return null
  }
}

export type BugSyncResult =
  | { status: "created" | "updated"; externalId: string; externalUrl: string | null }
  | { status: "skipped"; reason: string }

/**
 * @param bugId  BugReport id to sync.
 * @param opts.requireAutoFlag  When true (auto-sync callers), skip unless the
 *   project's autoSyncBugToTracker toggle is on.
 * Throws on unexpected errors so manual routes can surface them; returns a
 * "skipped" result for benign no-ops.
 */
export async function syncBugReport(
  bugId: string,
  opts: { requireAutoFlag?: boolean } = {}
): Promise<BugSyncResult> {
  const bug = await prisma.bugReport.findUnique({
    where: { id: bugId },
    include: {
      testCase: { select: { title: true } },
      bugAttachments: { select: { fileName: true, filePath: true } },
    },
  })
  if (!bug) throw new Error("Bug report not found")
  if (!bug.projectId) throw new Error("Bug report has no project")

  const loaded = await loadIntegration(bug.projectId)
  if (!loaded) return { status: "skipped", reason: "No project-management integration configured" }
  if (opts.requireAutoFlag && !loaded.autoSyncBugToTracker) {
    return { status: "skipped", reason: "Auto-sync of bugs to the tracker is disabled" }
  }

  const provider = loaded.getClient()

  const existingMapping = await prisma.externalSyncMapping.findUnique({
    where: {
      provider_localEntityType_localEntityId: {
        provider: loaded.provider as any,
        localEntityType: "BugReport",
        localEntityId: bug.id,
      },
    },
  })

  // ── Description (markdown; providers convert as needed) ──────────────────────
  let description = `## Bug Report\n\n`
  description += `**Bug ID:** \`${bug.bugKey}\`\n`
  description += `**Test Case:** ${bug.testCase?.title || "N/A"}\n`
  description += `**Severity:** ${bug.severity}\n`
  description += `**Priority:** ${bug.priority}\n`
  description += `**Status:** ${bug.status}\n`
  if (bug.environment) description += `**Environment:** ${bug.environment}\n`
  if (bug.browser) description += `**Browser:** ${bug.browser}\n`
  if (bug.viewport) description += `**Viewport:** ${bug.viewport}\n`
  if (bug.osInfo) description += `**OS:** ${bug.osInfo}\n`
  if (bug.screenResolution) description += `**Screen Resolution:** ${bug.screenResolution}\n`
  if (bug.pageUrl) description += `**Page URL:** ${bug.pageUrl}\n`
  description += `\n## Steps to Reproduce\n${bug.stepsToReproduce || "N/A"}\n\n`
  description += `## Expected Result\n${bug.expectedResult || "N/A"}\n\n`
  description += `## Actual Result\n${bug.actualResult || "N/A"}\n\n`
  if (bug.consoleLogs) description += `## Console Logs\n\`\`\`\n${bug.consoleLogs}\n\`\`\`\n\n`
  if (bug.networkErrors) description += `## Network Errors\n\`\`\`\n${bug.networkErrors}\n\`\`\`\n\n`
  if (bug.videoUrl) description += `**Session Recording:** ${APP_URL}${bug.videoUrl}\n\n`
  description += `[View Bug Report](${APP_URL}/bug-reports?bug=${bug.id})\n\n`
  description += `*Created automatically by QA Engine*\n\n`
  description += `<!-- ${entityMarker("BugReport", bug.id)} -->`

  const title = `[BUG] ${bug.title}`

  // ── Type: mapped bug type, else auto-detect a type named "Bug" and persist ───
  let bugTypeId: string | null = loaded.typeMapping.bug || null
  if (!bugTypeId) {
    try {
      const types = await provider.getTypes()
      const bugType = types.find((t) => t.name.toLowerCase() === "bug")
      if (bugType) {
        bugTypeId = bugType.id
        void persistDetectedBugType(loaded, bugType.id)
      }
    } catch {
      // leave default type if lookup fails
    }
  }

  // ── Priority / assignee / parent ─────────────────────────────────────────────
  const priorityId = await resolvePriorityId(provider, bug.priority)
  const parentId = bug.openProjectParentId || loaded.parentConfig.defaultParentId || null

  // ── Custom fields + bug source ───────────────────────────────────────────────
  const { linkFields, scalarFields } = normalizeStoredCustomFields(bug.openProjectCustomFields)
  await applyBugSource(provider, bugTypeId, bug.source, linkFields)

  const input: WorkItemInput = {
    title,
    description,
    typeId: bugTypeId,
    priorityId,
    assigneeId: bug.assignedTo || null,
    parentId,
    linkFields,
    scalarFields,
  }

  const boardId = bug.openProjectBoardId || loaded.boardConfig.boardId || null
  const columnId = bug.openProjectBoardColumnId || null

  // Set to null below if the linked work item turns out to be gone, which sends
  // this sync down the create path instead.
  let mapping = existingMapping

  if (mapping?.externalId) {
    let wp: Awaited<ReturnType<typeof provider.updateWorkItem>> | null = null
    try {
      wp = await provider.updateWorkItem(mapping.externalId, input)
    } catch (err) {
      if (!isMissingRemoteItem(err)) throw err
      // Someone deleted the work item in the tracker. Without this, every future
      // sync of this bug 404s forever and the bug can never come back.
      console.warn(
        `[sync-bug-report] ${loaded.provider} item ${mapping.externalId} is gone; recreating from the app.`
      )
      await prisma.externalSyncMapping.delete({ where: { id: mapping.id } }).catch(() => {})
      mapping = null
    }

    if (wp && mapping) {
      const existingMapping = mapping // narrowed for the block below
      const placed = boardId
        ? await placeBugOnBoard(
            provider, boardId, existingMapping.externalId, columnId, false, existingMapping.placementColumnId
          )
        : undefined
      await syncBugAttachments(provider, existingMapping.externalId, bug.screenshotPath, bug.bugAttachments)
      await prisma.externalSyncMapping.update({
        where: { id: existingMapping.id },
        data: {
          lastSyncedAt: new Date(),
          lastSyncStatus: "success",
          lastSyncError: null,
          ...(placed ? { placementColumnId: placed } : {}),
        },
      })
      return { status: "updated", externalId: wp.externalId, externalUrl: existingMapping.externalUrl }
    }
  }

  // ── First sync for this bug ──────────────────────────────────────────────────
  // Claim the mapping row BEFORE talking to the tracker. The unique key makes
  // the claim atomic, so a second sync racing this one (an impatient re-click,
  // or auto-sync firing while the user syncs by hand) cannot also create a work
  // item — which is how the same bug ended up in the tracker twice.
  let claim = mapping
  if (claim) {
    // A claim with no external id means an earlier sync is either still running
    // or died partway. Recent ones are left alone; older ones are taken over
    // (findByMarker below adopts whatever that attempt managed to create).
    const claimedAt = claim.updatedAt || claim.createdAt
    if (Date.now() - claimedAt.getTime() < STALE_CLAIM_MS) {
      return { status: "skipped", reason: "A sync for this bug is already in progress" }
    }
  }
  if (!claim) {
    try {
      claim = await prisma.externalSyncMapping.create({
        data: {
          projectId: bug.projectId,
          provider: loaded.provider as any,
          localEntityType: "BugReport",
          localEntityId: bug.id,
          externalId: "", // filled in below once the tracker assigns one
          externalType: "Bug",
          lastSyncStatus: "pending",
        },
      })
    } catch {
      // Lost the race: another sync claimed it microseconds ago.
      return { status: "skipped", reason: "A sync for this bug is already in progress" }
    }
  }

  try {
    // A previous attempt may have created the work item and then died before
    // recording it (a request timeout mid-attachment-upload is the usual way).
    // The description carries a stable marker, so adopt that orphan instead of
    // creating a second copy.
    const orphan = await provider.findByMarker("BugReport", bug.id).catch(() => null)
    const wp = orphan
      ? await provider.updateWorkItem(orphan.externalId, input)
      : await provider.createWorkItem(input)
    const externalUrl = wp.url || orphan?.url || null

    // Record the external id immediately — before the slow, best-effort board
    // placement and attachment uploads — so an interruption after this point
    // can never orphan the work item.
    await prisma.externalSyncMapping.update({
      where: { id: claim.id },
      data: {
        externalId: wp.externalId,
        externalUrl,
        lastSyncedAt: new Date(),
        lastSyncStatus: "success",
        lastSyncError: null,
      },
    })

    const placed = boardId
      ? await placeBugOnBoard(provider, boardId, wp.externalId, columnId, !orphan, claim.placementColumnId)
      : undefined
    await syncBugAttachments(provider, wp.externalId, bug.screenshotPath, bug.bugAttachments)
    if (placed) {
      await prisma.externalSyncMapping.update({
        where: { id: claim.id },
        data: { placementColumnId: placed },
      })
    }

    return { status: orphan ? "updated" : "created", externalId: wp.externalId, externalUrl }
  } catch (err: any) {
    // Release the claim so the next attempt can retry rather than being told a
    // sync is in progress forever.
    if (!claim.externalId) {
      await prisma.externalSyncMapping.delete({ where: { id: claim.id } }).catch(() => {})
    }
    throw err
  }
}
