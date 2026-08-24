/**
 * Board mirror — describes the connected tracker's board in the app's terms, so
 * the Bug Reports board can render the same columns, in the same order, as the
 * board the team actually works on.
 *
 * Why a mirror rather than a translation: the app has eight bug statuses and a
 * tracker workflow routinely has a dozen. Rendering the app's eight and labelling
 * them with tracker names loses "Specified", "To be scheduled" and "Developed"
 * entirely — the columns a bug spends most of its life in. So the columns come
 * from the tracker, and each bug is placed by the tracker's own status (stored on
 * ExternalSyncMapping.externalStatusId by inbound sync), falling back to the
 * app's status through the project's saved mapping when the tracker has not been
 * read yet.
 *
 * Nothing here decides what a status means. Which tracker status a column shows
 * is the tracker's business; which app status it corresponds to is the user's
 * saved mapping. This module only joins the two.
 */
import { prisma } from "@/lib/db"
import { loadIntegration, type LoadedIntegration } from "./load-integration"
import {
  appStatusForTrackerStatus,
  readBugStatusMapping,
  trackerStatusIdFor,
  type BugStatusMapping,
} from "./bug-status-mapping"
import type { BoardColumn, WorkItemStatus } from "./types"

export interface MirroredColumn {
  /** Tracker status id — the placement key and what a drop writes. */
  statusId: string
  name: string
  /** The app bug status this column corresponds to, when the user mapped it. */
  appStatus: string | null
  isClosed: boolean
  /** True when this column came from the tracker's board rather than the workflow. */
  fromBoard: boolean
}

export interface BoardMirror {
  /** Null when the project has no integration, or the tracker could not be read. */
  available: boolean
  provider: string | null
  trackerName: string | null
  /** The board the columns were read from, when one is configured. */
  boardId: string | null
  boardName: string | null
  boardUrl: string | null
  columns: MirroredColumn[]
  /** bug id -> tracker status id, for placement. */
  placement: Record<string, string>
  /** bug id -> external work package id/url, so cards can link out. */
  links: Record<string, { externalId: string; url: string | null; statusName: string | null }>
  /** Bug ids the tracker knows nothing about yet (never synced). */
  unsyncedBugIds: string[]
  /** Set when the tracker could not be read; the caller falls back to app statuses. */
  error: string | null
}

const EMPTY: BoardMirror = {
  available: false,
  provider: null,
  trackerName: null,
  boardId: null,
  boardName: null,
  boardUrl: null,
  columns: [],
  placement: {},
  links: {},
  unsyncedBugIds: [],
  error: null,
}

/**
 * Turn the tracker's board columns into mirrored columns.
 *
 * Only status-typed columns can hold a bug by status, and only those are
 * returned: a version- or assignee-filtered column on the same board is not a
 * workflow state, and putting bugs in it by status would be a fiction. Boards
 * made of such columns therefore fall back to the workflow's status list.
 */
function columnsFromBoard(
  boardColumns: BoardColumn[],
  statuses: WorkItemStatus[],
  mapping: BugStatusMapping
): MirroredColumn[] {
  const byId = new Map(statuses.map((s) => [String(s.id), s]))
  const out: MirroredColumn[] = []
  const seen = new Set<string>()

  for (const col of boardColumns) {
    if (col.columnType !== "status" || !col.attributeId) continue
    const statusId = String(col.attributeId)
    if (seen.has(statusId)) continue
    seen.add(statusId)
    const status = byId.get(statusId)
    out.push({
      statusId,
      // Prefer the board's own column heading — that is the word on screen in
      // the tracker, and it can differ from the raw status name.
      name: col.name || status?.name || statusId,
      appStatus: appStatusForTrackerStatus(mapping, statusId),
      isClosed: status?.isClosed ?? false,
      fromBoard: true,
    })
  }
  return out
}

function columnsFromStatuses(
  statuses: WorkItemStatus[],
  mapping: BugStatusMapping
): MirroredColumn[] {
  return statuses.map((s) => ({
    statusId: String(s.id),
    name: s.name,
    appStatus: appStatusForTrackerStatus(mapping, String(s.id)),
    isClosed: s.isClosed,
    fromBoard: false,
  }))
}

/** The board this project's bugs are synced to, from the saved board config. */
function configuredBoardId(loaded: LoadedIntegration): string | null {
  const cfg = loaded.boardConfig || {}
  const id = (cfg as { bugBoardId?: string | null; boardId?: string | null }).bugBoardId ?? cfg.boardId
  return id ? String(id) : null
}

/**
 * Build the mirror for one project's bug board.
 *
 * `bugs` is the list already loaded by the caller (post-filter), so placement is
 * computed only for what is on screen and no second read of the bug table happens.
 */
export async function getBoardMirror(
  projectId: string,
  bugs: Array<{ id: string; status: string }>
): Promise<BoardMirror> {
  const loaded = await loadIntegration(projectId)
  if (!loaded) return EMPTY

  const mapping = readBugStatusMapping(loaded.statusMapping)
  const provider = loaded.getClient()

  let columns: MirroredColumn[] = []
  let boardId = configuredBoardId(loaded)
  let boardName: string | null = null
  let boardUrl: string | null = null
  let error: string | null = null

  try {
    const statuses = await provider.getStatuses()

    if (boardId) {
      try {
        const boardCols = await provider.getBoardColumns(boardId)
        columns = columnsFromBoard(boardCols, statuses, mapping)
        const board = (await provider.getBoards().catch(() => [])).find(
          (b) => String(b.id) === String(boardId)
        )
        boardName = board?.name || null
        boardUrl = buildBoardUrl(loaded, boardId)
      } catch (err: any) {
        // The saved board was deleted or is not visible to this token. Say so,
        // but still render something usable rather than an empty screen.
        error = `Could not read the tracker board (${err?.message || "unknown error"}); showing the workflow's statuses instead.`
        boardId = null
      }
    }

    // No board configured, or its columns aren't status-based: mirror the
    // workflow itself, which is still the tracker's vocabulary and order.
    if (columns.length === 0) {
      columns = columnsFromStatuses(statuses, mapping)
      if (boardId && !error) {
        error = "That tracker board has no status columns; showing the workflow's statuses instead."
        boardId = null
      }
    }
  } catch (err: any) {
    return { ...EMPTY, provider: loaded.provider, trackerName: loaded.provider, error: err?.message || "Could not reach the tracker" }
  }

  // ── Placement ───────────────────────────────────────────────────────────────
  const bugIds = bugs.map((b) => b.id)
  const mappings = bugIds.length
    ? await prisma.externalSyncMapping.findMany({
        where: {
          projectId,
          provider: loaded.provider as any,
          localEntityType: "BugReport",
          localEntityId: { in: bugIds },
        },
        select: {
          localEntityId: true,
          externalId: true,
          externalUrl: true,
          externalStatusId: true,
          externalStatusName: true,
        },
      })
    : []

  const byBug = new Map(mappings.map((m) => [m.localEntityId, m]))
  const columnIds = new Set(columns.map((c) => c.statusId))

  const placement: BoardMirror["placement"] = {}
  const links: BoardMirror["links"] = {}
  const unsyncedBugIds: string[] = []

  for (const bug of bugs) {
    const m = byBug.get(bug.id)
    if (!m) {
      unsyncedBugIds.push(bug.id)
    } else {
      links[bug.id] = {
        externalId: m.externalId,
        url: m.externalUrl,
        statusName: m.externalStatusName,
      }
    }

    // The tracker's own reading wins — it is the thing being mirrored.
    if (m?.externalStatusId && columnIds.has(m.externalStatusId)) {
      placement[bug.id] = m.externalStatusId
      continue
    }
    // Not read from the tracker yet (or in a status with no column): fall back
    // to what the app's status maps to, so a freshly filed bug still lands
    // somewhere sensible instead of disappearing.
    const viaMapping = trackerStatusIdFor(mapping, bug.status)
    if (viaMapping && columnIds.has(viaMapping)) placement[bug.id] = viaMapping
  }

  return {
    available: columns.length > 0,
    provider: loaded.provider,
    trackerName: loaded.provider,
    boardId,
    boardName,
    boardUrl,
    columns,
    placement,
    links,
    unsyncedBugIds,
    error,
  }
}

/** Deep link to the board in the tracker, for the "open in <tracker>" affordance. */
function buildBoardUrl(loaded: LoadedIntegration, boardId: string): string | null {
  const base = (loaded.row.baseUrl || "").replace(/\/+$/, "")
  if (!base) return null
  if (loaded.provider === "OpenProject") {
    return `${base}/projects/${loaded.row.externalProjectKey}/boards/${boardId}`
  }
  return null
}
