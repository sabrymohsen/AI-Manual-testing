/**
 * Create a bug-workflow board in OpenProject: one column per bug status, in
 * workflow order.
 *
 * Why status columns rather than the free/basic board this app has been using:
 * a free board has no rule for which column a card belongs to, so the app has to
 * pin cards by id into each column's widget filter. That filter is a second
 * source of truth fighting OpenProject's own, which is how one work package ends
 * up rendering in two columns, and how emptying a column could damage the board.
 *
 * A status column has no such filter. A card appears in a column because the
 * work package holds that status — and it can only hold one, so it can only
 * appear once. The app already syncs bug status, so the board follows along with
 * no placement logic at all.
 *
 * Trade-off worth knowing: dragging a card between columns to CHANGE the status
 * is OpenProject's Enterprise "action board" behaviour. On Community the board
 * displays correctly and stays correct, but people change status on the work
 * package (or in this app) rather than by dragging.
 */
import { prisma } from "@/lib/db"
import { loadIntegration } from "@/lib/integrations/core/load-integration"
import { resolveOpenProject } from "./resolve"

/** App bug statuses in workflow order, with the tracker names each may go by. */
const BUG_STATUS_COLUMNS: Array<{ bugStatus: string; label: string; aliases: string[] }> = [
  { bugStatus: "Open", label: "Open", aliases: ["new", "open", "to do", "todo", "confirmed"] },
  { bugStatus: "InProgress", label: "In Progress", aliases: ["in progress", "in development", "developing", "in dev"] },
  { bugStatus: "ReadyForRetest", label: "Ready for Retest", aliases: ["in testing", "ready for testing", "to be tested", "in review", "testing"] },
  { bugStatus: "Resolved", label: "Resolved", aliases: ["resolved", "fixed", "developed"] },
  { bugStatus: "Closed", label: "Closed", aliases: ["closed", "done"] },
  { bugStatus: "Rejected", label: "Rejected", aliases: ["rejected", "invalid", "won't fix", "wont fix", "wontfix", "duplicate"] },
]

export interface BugBoardColumnPlan {
  bugStatus: string
  /** Column heading on the board. */
  name: string
  /** Tracker status backing the column, or null when nothing matched. */
  statusId: string | null
  statusName: string | null
}

/**
 * Match each bug status to one of the tracker's statuses by name. Exact match
 * first, then a contains match, and never the same tracker status twice — two
 * columns filtered on one status would show identical cards.
 */
export function planBugBoardColumns(
  trackerStatuses: Array<{ id: string; name: string }>
): BugBoardColumnPlan[] {
  const taken = new Set<string>()

  return BUG_STATUS_COLUMNS.map(({ bugStatus, label, aliases }) => {
    const available = trackerStatuses.filter((s) => !taken.has(s.id))
    const match =
      available.find((s) => aliases.includes(s.name.trim().toLowerCase())) ||
      available.find((s) => aliases.some((a) => s.name.trim().toLowerCase().includes(a)))

    if (match) taken.add(match.id)
    return {
      bugStatus,
      name: label,
      statusId: match ? match.id : null,
      statusName: match ? match.name : null,
    }
  })
}

export interface CreateBugBoardResult {
  boardId: number
  url: string
  columns: Array<{ name: string; statusName: string | null; queryId: string }>
  /** Bug statuses with no matching tracker status — no column was made for them. */
  unmatched: string[]
  setAsDefault: boolean
  /** The OpenProject type every column is filtered to. */
  bugTypeName: string
}

export async function createBugWorkflowBoard(
  projectId: string,
  opts: { name?: string; setAsDefault?: boolean } = {}
): Promise<CreateBugBoardResult> {
  const resolved = await resolveOpenProject(projectId)
  if (!resolved.ok) throw new Error(resolved.error)
  const { client } = resolved

  const statuses = await client.getStatuses()
  if (statuses.length === 0) {
    throw new Error("OpenProject returned no statuses for this project")
  }

  // Every column is filtered to this type as well as its status. A board meant
  // for bugs that shows tasks and features is not a bug board, so a type we
  // cannot resolve is a hard stop rather than a board that looks wrong.
  const bugType = await resolveBugType(projectId, client)
  if (!bugType) {
    throw new Error(
      "Could not work out which OpenProject type means \"Bug\". Set the bug type in the " +
        "project's integration settings, then create the board again."
    )
  }

  const plan = planBugBoardColumns(statuses.map((s) => ({ id: String(s.id), name: s.name })))
  const usable = plan.filter((c) => c.statusId)
  if (usable.length === 0) {
    throw new Error(
      `None of this app's bug statuses match a status in OpenProject (it has: ${statuses
        .map((s) => s.name)
        .join(", ")}). Rename or add statuses there, then try again.`
    )
  }

  // Queries first: a board is only a container for them.
  const columns: Array<{
    name: string
    statusName: string | null
    queryId: string
    statusId: string | null
  }> = []
  for (const col of usable) {
    const queryId = await client.createBoardColumnQuery(col.name, col.statusId, bugType.id)
    columns.push({ name: col.name, statusName: col.statusName, queryId, statusId: col.statusId })
  }

  const boardName = opts.name?.trim() || "Bug Workflow"
  let boardId: number
  try {
    boardId = await client.createBoard(
      boardName,
      columns.map((c) => ({
        name: c.name,
        queryId: c.queryId,
        statusId: c.statusId,
        typeId: bugType.id,
      }))
    )
  } catch (err) {
    // The queries exist by now. Without this, every failed attempt leaves a set
    // of orphaned hidden queries behind in the OpenProject project.
    await Promise.all(columns.map((c) => client.deleteQuery(c.queryId)))
    throw err
  }

  // Read the board back rather than trusting the create. If OpenProject stored
  // something other than what we asked for, the caller needs to know now — not
  // the first time a bug syncs onto it.
  const created = await client.getBoardColumns(boardId)
  if (created.length !== columns.length) {
    throw new Error(
      `Board ${boardId} was created but came back with ${created.length} column(s) instead of ` +
        `${columns.length}. Open it in OpenProject and check before syncing bugs onto it.`
    )
  }

  const setAsDefault = opts.setAsDefault !== false
  if (setAsDefault) await persistBoardId(projectId, boardId)

  return {
    boardId,
    url: client.boardUrl(boardId),
    columns,
    unmatched: plan.filter((c) => !c.statusId).map((c) => c.name),
    setAsDefault,
    bugTypeName: bugType.name,
  }
}

/**
 * Which OpenProject type counts as a bug: the project's configured mapping
 * first, then the tracker's own type named Bug (or Defect).
 */
export async function resolveBugType(
  projectId: string,
  client: { getTypes(): Promise<Array<{ id: string | number; name: string }>> }
): Promise<{ id: string; name: string } | null> {
  const types = await client.getTypes().catch(() => [])
  const loaded = await loadIntegration(projectId)
  const mapped = loaded?.typeMapping?.bug
    ? types.find((t) => String(t.id) === String(loaded.typeMapping.bug))
    : null
  const detected = types.find((t) => /^(bug|defect)$/i.test(t.name))
  const chosen = mapped || detected
  return chosen ? { id: String(chosen.id), name: chosen.name } : null
}

/** Point the project's integration at the new board, on whichever row owns it. */
async function persistBoardId(projectId: string, boardId: number): Promise<void> {
  const loaded = await loadIntegration(projectId)
  if (!loaded) return

  if (loaded.source === "unified") {
    await prisma.projectIntegration.update({
      where: { projectId },
      data: {
        boardConfig: { ...loaded.boardConfig, boardId: String(boardId), strategy: "StatusBased" },
      },
    })
  } else {
    await prisma.openProjectIntegration.update({
      where: { projectId },
      data: { targetBoardId: String(boardId), boardStrategy: "StatusBased" },
    })
  }
}
