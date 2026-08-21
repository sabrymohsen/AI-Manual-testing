/**
 * Create a bug board in whichever tracker the project is connected to: one
 * column per tracker status the user picked.
 *
 * The columns come from the TRACKER, not from this app. An earlier version made
 * exactly six columns from a list written into the code and matched them to
 * tracker statuses by English keyword. Any status that didn't match got no
 * column — and a bug that later reached such a status had nowhere to render, so
 * it silently vanished from the board while the work item was perfectly fine.
 * Defaulting to every status means a bug always has a column to be in.
 *
 * Column NAMES are the tracker's own status names, so a tracker in any language
 * produces a board that reads correctly.
 *
 * Why status columns rather than a free/basic board: a free board has no rule
 * for which column a card belongs to, so the app has to pin cards by id into
 * each column's widget filter — a second source of truth fighting the tracker's
 * own, which is how one work item ends up rendering in two columns. A card sits
 * in a status column because the work item holds that status, and it can only
 * hold one, so it can only appear once.
 */
import { prisma } from "@/lib/db"
import { loadIntegration } from "./load-integration"
import type { WorkItemStatus } from "./types"

export interface BugBoardColumnPlan {
  /** Tracker status backing the column. */
  statusId: string
  /** Column heading — the tracker's own status name. */
  name: string
  /** Whether this status will get a column. */
  selected: boolean
}

/**
 * One column per tracker status, in the tracker's own order.
 *
 * `selectedStatusIds` narrows it when the user only wants some statuses on the
 * board; omitting it selects everything, which is the safe default because no
 * status is then left without somewhere to show.
 */
export function planBugBoardColumns(
  trackerStatuses: Array<Pick<WorkItemStatus, "id" | "name">>,
  opts: { selectedStatusIds?: string[] } = {}
): BugBoardColumnPlan[] {
  const selection = opts.selectedStatusIds
    ? new Set(opts.selectedStatusIds.map(String))
    : null

  return trackerStatuses.map((s) => ({
    statusId: String(s.id),
    name: s.name,
    selected: selection ? selection.has(String(s.id)) : true,
  }))
}

export interface CreateBugBoardResult {
  boardId: string
  url: string
  columns: Array<{ name: string; statusId: string; queryId: string }>
  setAsDefault: boolean
  /** The work-item type every column is filtered to, when one was resolved. */
  bugTypeName: string | null
  /** Statuses the user chose to leave off the board. */
  excluded: string[]
}

export async function createBugWorkflowBoard(
  projectId: string,
  opts: { name?: string; setAsDefault?: boolean; statusIds?: string[] } = {}
): Promise<CreateBugBoardResult> {
  const loaded = await loadIntegration(projectId)
  if (!loaded) throw new Error("No project-management integration is configured for this project")

  const provider = loaded.getClient()
  if (!provider.createStatusBoard) {
    throw new Error(`${loaded.provider} cannot create boards through its API`)
  }

  const statuses = await provider.getStatuses()
  if (statuses.length === 0) {
    throw new Error(`${loaded.provider} returned no statuses for this project`)
  }

  const plan = planBugBoardColumns(statuses, { selectedStatusIds: opts.statusIds })
  const chosen = plan.filter((c) => c.selected)
  if (chosen.length === 0) {
    throw new Error("Pick at least one status to make a column from")
  }

  // Restricting every column to the bug type keeps tasks and features off a
  // board meant for bugs. Optional: a tracker with no such type still gets a
  // usable board, just one that isn't type-filtered.
  const bugType = await resolveBugType(projectId, provider)

  const created = await provider.createStatusBoard(
    opts.name?.trim() || "Bug Workflow",
    chosen.map((c) => ({ name: c.name, statusId: c.statusId })),
    { typeId: bugType?.id ?? null }
  )

  // Read the board back rather than trusting the create. If the tracker stored
  // something other than what we asked for, the caller needs to know now — not
  // the first time a bug syncs onto it.
  const readBack = await provider.getBoardColumns(created.boardId)
  if (readBack.length !== chosen.length) {
    throw new Error(
      `Board ${created.boardId} was created but came back with ${readBack.length} column(s) instead ` +
        `of ${chosen.length}. Open it in ${loaded.provider} and check before syncing bugs onto it.`
    )
  }

  const setAsDefault = opts.setAsDefault !== false
  if (setAsDefault) await persistBoardId(projectId, created.boardId)

  return {
    boardId: created.boardId,
    url: created.url,
    columns: created.columns,
    setAsDefault,
    bugTypeName: bugType?.name ?? null,
    excluded: plan.filter((c) => !c.selected).map((c) => c.name),
  }
}

/**
 * Which tracker type counts as a bug: the project's configured mapping first,
 * then a type the tracker itself names Bug or Defect. Null when neither exists,
 * which is not an error — the board is simply not type-filtered.
 */
export async function resolveBugType(
  projectId: string,
  provider: { getTypes(): Promise<Array<{ id: string; name: string }>> }
): Promise<{ id: string; name: string } | null> {
  const types = await provider.getTypes().catch(() => [])
  const loaded = await loadIntegration(projectId)
  const mapped = loaded?.typeMapping?.bug
    ? types.find((t) => String(t.id) === String(loaded.typeMapping.bug))
    : null
  const detected = types.find((t) => /^(bug|defect)$/i.test(t.name))
  const chosen = mapped || detected
  return chosen ? { id: String(chosen.id), name: chosen.name } : null
}

/** Point the project's integration at the new board, on whichever row owns it. */
async function persistBoardId(projectId: string, boardId: string): Promise<void> {
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
