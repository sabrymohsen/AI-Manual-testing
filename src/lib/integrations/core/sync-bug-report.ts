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
 * Places / moves a synced bug on the given board, idempotently. Mirrors the
 * OpenProject placeBugOnBoard rules but via provider board primitives:
 *  - explicit column  → reconcile to EXACTLY that column (moves it; no-op if there)
 *  - new card         → drop into the chosen/first column
 *  - re-sync, basic, no explicit column → only place if not already on the board
 *  - re-sync, attribute column, no explicit → leave as-is
 * Best-effort: never throws.
 */
async function placeBugOnBoard(
  provider: WorkItemProvider,
  boardId: string,
  externalId: string,
  columnId: string | null | undefined,
  isCreate: boolean
): Promise<void> {
  try {
    const columns = await provider.getBoardColumns(boardId)
    if (!columns.length) return
    const explicit: BoardColumn | null = columnId
      ? columns.find((c) => String(c.id) === String(columnId)) || null
      : null
    const col = explicit || columns[0]

    if (explicit) {
      await provider.reconcileColumn(boardId, col, externalId)
      return
    }
    if (isCreate) {
      await provider.placeOnColumn(boardId, col, externalId)
      return
    }
    if (col.columnType === "basic") {
      if (!(await provider.boardContains(boardId, externalId))) {
        await provider.placeOnColumn(boardId, col, externalId)
      }
    }
    // attribute columns on plain re-sync with no explicit column: leave as-is.
  } catch (err: any) {
    console.warn(`[sync-bug-report] Board placement for ${externalId} skipped: ${err?.message}`)
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

  if (existingMapping) {
    const wp = await provider.updateWorkItem(existingMapping.externalId, input)
    if (boardId) await placeBugOnBoard(provider, boardId, existingMapping.externalId, columnId, false)
    await syncBugAttachments(provider, existingMapping.externalId, bug.screenshotPath, bug.bugAttachments)
    await prisma.externalSyncMapping.update({
      where: { id: existingMapping.id },
      data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    })
    return { status: "updated", externalId: wp.externalId, externalUrl: existingMapping.externalUrl }
  }

  const wp = await provider.createWorkItem(input)
  if (boardId) await placeBugOnBoard(provider, boardId, wp.externalId, columnId, true)
  await syncBugAttachments(provider, wp.externalId, bug.screenshotPath, bug.bugAttachments)
  await prisma.externalSyncMapping.create({
    data: {
      projectId: bug.projectId,
      provider: loaded.provider as any,
      localEntityType: "BugReport",
      localEntityId: bug.id,
      externalId: wp.externalId,
      externalUrl: wp.url,
      externalType: "Bug",
      lastSyncedAt: new Date(),
      lastSyncStatus: "success",
    },
  })
  return { status: "created", externalId: wp.externalId, externalUrl: wp.url }
}
