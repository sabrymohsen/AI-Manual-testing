/**
 * syncBugReportToOpenProject
 *
 * Shared logic to create/update an OpenProject work package for a BugReport.
 * Used by:
 *   - Manual retry route (POST /api/bug-reports/[bugId]/sync/openproject)
 *   - Live QA Session bugs (createBugFromSession), best-effort
 *
 * Never assumes a request context — safe to call from the recorder worker.
 */
import fs from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { OpenProjectClient } from "@/lib/integrations/openproject/openproject.client"

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000"

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
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
  // Strip the file-serving API prefix if present.
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
 * Uploads the bug's screenshot and image attachments to the work package,
 * skipping any file already present (by name) so re-syncs don't duplicate.
 * Best-effort: logs and continues on individual failures.
 */
async function syncBugAttachmentsToWp(
  client: OpenProjectClient,
  wpId: string,
  screenshotPath: string | null,
  attachments: Array<{ fileName: string; filePath: string }>
): Promise<void> {
  // Build a de-duplicated list of {name, path} image references for this bug.
  const refs: Array<{ name: string; ref: string }> = []
  const seenRefs = new Set<string>()
  const pushRef = (ref: string | null, name?: string) => {
    if (!ref || seenRefs.has(ref)) return
    seenRefs.add(ref)
    refs.push({ ref, name: name || path.basename(ref) })
  }
  // Attachments first so their original file names win over the screenshot's
  // stored (UUID) basename when both reference the same file.
  for (const a of attachments) pushRef(a.filePath, a.fileName)
  pushRef(screenshotPath || null)

  if (refs.length === 0) return

  let existingNames: string[] = []
  try {
    existingNames = await client.getWorkPackageAttachmentNames(wpId)
  } catch {
    existingNames = []
  }

  for (const { name, ref } of refs) {
    const ext = path.extname(name).toLowerCase()
    const contentType = IMAGE_CONTENT_TYPES[ext]
    if (!contentType) continue // only sync images
    if (existingNames.includes(name)) continue // already uploaded

    const filePath = resolveLocalFile(ref)
    if (!filePath) {
      console.warn(`[sync-bug-report] Attachment file not found on disk: ${ref}`)
      continue
    }
    try {
      const buffer = fs.readFileSync(filePath)
      await client.uploadWorkPackageAttachment(wpId, name, buffer, contentType)
    } catch (err: any) {
      console.warn(`[sync-bug-report] Failed to attach "${name}" to WP #${wpId}: ${err?.message}`)
    }
  }
}

/**
 * Makes a synced bug work package show up on the given OpenProject board.
 * - Free/basic boards (the OpenProject CE case): append the WP id to the first
 *   column widget's filter, preserving any WPs already placed there.
 * - Attribute boards (version/assignee): set that attribute so the WP lands in
 *   the first column. Status boards need no action — the WP shows by its status.
 * Best-effort: never throws, so a board/permission issue can't fail the sync.
 */
async function placeBugOnBoard(
  client: OpenProjectClient,
  boardId: string,
  wpId: string,
  columnWidgetId?: string | null
): Promise<void> {
  try {
    const columns = await client.getBoardColumns(Number(boardId))
    if (!columns.length) return
    // Place under the explicitly chosen column when provided, else the first column.
    const col =
      (columnWidgetId && columns.find(c => String(c.widgetId) === String(columnWidgetId))) ||
      columns[0]

    if (col.columnType === "basic") {
      await client.addWorkPackageToBoardWidget(Number(boardId), col.widgetId, wpId)
      return
    }

    if (col.attributeId && (col.columnType === "version" || col.columnType === "assignee")) {
      const links: Record<string, { href: string }> = {}
      if (col.columnType === "version") links.version = { href: client.versionHref(col.attributeId) }
      else if (col.columnType === "assignee") links.assignee = { href: client.assigneeHref(col.attributeId) }
      const wp = await client.getWorkPackage(wpId)
      await client.updateWorkPackage(wpId, { _links: links }, wp.lockVersion)
    }
    // status boards: the WP already appears in the column matching its status.
  } catch (err: any) {
    console.warn(`[sync-bug-report] Board placement for WP #${wpId} skipped: ${err?.message}`)
  }
}

/**
 * Applies the bug's stored OpenProject custom-field values to the work-package
 * payload. Link-valued fields (dropdowns/references) are merged into `links`;
 * scalar/formattable fields are returned as top-level body properties.
 * Stored shape: { [fieldKey]: { kind: "text"|"formattable"|"link-single"|"link-multi", value } }.
 */
function applyBugCustomFields(
  stored: unknown,
  links: Record<string, any>
): Record<string, any> {
  const body: Record<string, any> = {}
  if (!stored || typeof stored !== "object") return body
  for (const [key, entry] of Object.entries(stored as Record<string, any>)) {
    if (!entry || typeof entry !== "object") continue
    const kind: string = entry.kind
    const value = entry.value
    if (kind === "text") {
      if (value !== undefined && value !== null && value !== "") body[key] = value
    } else if (kind === "formattable") {
      if (value !== undefined && value !== null && value !== "") {
        body[key] = { format: "markdown", raw: String(value) }
      }
    } else if (kind === "link-single") {
      if (value) links[key] = { href: value }
    } else if (kind === "link-multi") {
      const arr = (Array.isArray(value) ? value : [value]).filter(Boolean)
      if (arr.length > 0) links[key] = arr.map((href: string) => ({ href }))
    }
  }
  return body
}

export type BugSyncResult =
  | { status: "created" | "updated"; externalId: string; externalUrl: string | null }
  | { status: "skipped"; reason: string }

/**
 * @param bugId            BugReport id to sync.
 * @param opts.requireAutoFlag  When true (auto-sync callers), skip unless the
 *                              project's autoSyncBugToOpenProject toggle is on.
 * Throws on unexpected errors (token decrypt / OpenProject API failures) so the
 * manual route can surface them; returns a "skipped" result for benign no-ops.
 */
export async function syncBugReportToOpenProject(
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

  const integration = await prisma.openProjectIntegration.findUnique({
    where: { projectId: bug.projectId },
  })

  if (!integration?.apiTokenEncrypted) {
    return { status: "skipped", reason: "OpenProject integration not configured" }
  }
  if (opts.requireAutoFlag && !integration.autoSyncBugToOpenProject) {
    return { status: "skipped", reason: "Auto-sync of bugs to OpenProject is disabled" }
  }

  const token = decryptSecret({
    encrypted: integration.apiTokenEncrypted,
    iv: integration.apiTokenIv,
    authTag: integration.apiTokenAuthTag,
    keyVersion: integration.apiTokenKeyVersion,
  })

  const client = new OpenProjectClient(
    integration.baseUrl,
    integration.openProjectProjectIdentifier,
    token
  )

  const existingMapping = await prisma.externalSyncMapping.findUnique({
    where: {
      provider_localEntityType_localEntityId: {
        provider: "OpenProject",
        localEntityType: "BugReport",
        localEntityId: bug.id,
      },
    },
  })

  // Build description (includes auto-captured live-session context when present)
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
  description += `*Created automatically by AI Manual QA Tester*\n\n`
  description += `<!-- AI-Manual-QA-Tester:BugReport:${bug.id} -->`

  const subject = `[BUG] ${bug.title}`

  // _links can hold single ({href}) or multi ([{href}]) values (multi-value custom fields).
  const links: Record<string, any> = {}
  if (integration.bugTypeId) {
    links.type = { href: client.typeHref(integration.bugTypeId) }
  } else {
    // No bug type configured — auto-detect a type named "Bug" so tickets aren't
    // created with OpenProject's default type ("Task").
    try {
      const types = await client.getTypes()
      const bugType = types.find(t => t.name.toLowerCase() === "bug")
      if (bugType) {
        links.type = { href: client.typeHref(String(bugType.id)) }
        // Persist it so the integration config reflects it and future syncs skip
        // the lookup. Best-effort — a failure here must not fail the sync.
        prisma.openProjectIntegration
          .update({ where: { projectId: bug.projectId }, data: { bugTypeId: String(bugType.id) } })
          .catch(() => {})
      }
    } catch {
      // Leave the default type if the lookup fails.
    }
  }
  // Map the bug's priority onto the work package's native priority field so the
  // OpenProject ticket reflects it (otherwise every ticket defaults to "Normal").
  // App priorities (Low/Medium/High/Critical) are matched to the instance's
  // priorities by name, with Medium→Normal and Critical→Immediate fallbacks.
  if (bug.priority) {
    const priorities = await client.getPriorities()
    if (priorities.length > 0) {
      const wanted = bug.priority.toLowerCase()
      const aliases: Record<string, string[]> = {
        low: ["low"],
        medium: ["normal", "medium"],
        high: ["high"],
        critical: ["immediate", "critical", "urgent"],
      }
      const candidates = aliases[wanted] || [wanted]
      const match =
        priorities.find(p => candidates.includes(p.name.toLowerCase())) ||
        priorities.find(p => p.name.toLowerCase() === wanted)
      if (match) {
        links.priority = { href: client.priorityHref(match.id) }
      }
    }
  }
  // assignedTo holds the OpenProject user id when the bug was assigned to a real
  // project member (legacy free-text values are numeric-free and safely ignored).
  if (bug.assignedTo && /^\d+$/.test(bug.assignedTo)) {
    links.assignee = { href: client.assigneeHref(bug.assignedTo) }
  }
  // Nest the bug under a parent work package: prefer the per-bug parent, else fall
  // back to the integration's configured default parent.
  const parentId = bug.openProjectParentId || integration.defaultParentWorkPackageId
  if (parentId && /^\d+$/.test(parentId)) {
    links.parent = { href: client.parentHref(parentId) }
  }

  // Required/custom fields (e.g. "Found in Build", "Bug Componant"). Link fields
  // are merged into `links`; scalar/formattable fields become body properties.
  const customFieldBody = applyBugCustomFields(bug.openProjectCustomFields, links)

  if (existingMapping) {
    const wp = await client.getWorkPackage(existingMapping.externalId)
    await client.updateWorkPackage(
      existingMapping.externalId,
      {
        subject,
        description: { format: "markdown", raw: description },
        ...customFieldBody,
        ...(Object.keys(links).length > 0 ? { _links: links } : {}),
      },
      wp.lockVersion
    )

    const boardId = bug.openProjectBoardId || integration.targetBoardId
    if (boardId) {
      await placeBugOnBoard(client, boardId, existingMapping.externalId, bug.openProjectBoardColumnId)
    }

    await syncBugAttachmentsToWp(client, existingMapping.externalId, bug.screenshotPath, bug.bugAttachments)

    await prisma.externalSyncMapping.update({
      where: { id: existingMapping.id },
      data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    })

    return {
      status: "updated",
      externalId: existingMapping.externalId,
      externalUrl: existingMapping.externalUrl,
    }
  }

  const wp = await client.createWorkPackage({
    subject,
    description: { format: "markdown", raw: description },
    ...customFieldBody,
    _links: links,
  })

  const wpUrl = client.workPackageUrl(wp.id)

  const boardId = bug.openProjectBoardId || integration.targetBoardId
  if (boardId) {
    await placeBugOnBoard(client, boardId, String(wp.id), bug.openProjectBoardColumnId)
  }

  await syncBugAttachmentsToWp(client, String(wp.id), bug.screenshotPath, bug.bugAttachments)

  await prisma.externalSyncMapping.create({
    data: {
      projectId: bug.projectId,
      provider: "OpenProject",
      localEntityType: "BugReport",
      localEntityId: bug.id,
      externalId: String(wp.id),
      externalUrl: wpUrl,
      externalType: "Bug",
      lastSyncedAt: new Date(),
      lastSyncStatus: "success",
    },
  })

  return { status: "created", externalId: String(wp.id), externalUrl: wpUrl }
}
