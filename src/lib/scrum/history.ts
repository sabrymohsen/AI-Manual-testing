/**
 * Status history for Scrum Board tasks, rebuilt from the activity log.
 *
 * Every status change writes an Activity row ("moved", details "TODO → DONE"),
 * so a task's status on any past day can be read back instead of guessed from
 * updatedAt (which moves on every edit, so "done on the day it was last
 * touched" was wrong as soon as someone fixed a typo afterwards).
 *
 * Pure functions: the callers load tasks and activities and pass them in.
 */

export const DONE_TASK_STATUSES = ["DONE", "DEPLOYED"]
export const IN_FLIGHT_TASK_STATUSES = ["IN_PROGRESS", "REVIEW", "TESTING"]

export interface MoveEvent {
  at: number
  from: string | null
  to: string
}

export interface TaskHistoryInput {
  status: string
  createdAt: Date
  updatedAt: Date
  activities: { action: string; details: string | null; createdAt: Date }[]
}

const MOVE = /^\s*([A-Z_]+)\s*(?:→|->)\s*([A-Z_]+)\s*$/

/** Status moves, oldest first. */
export function statusMoves(task: TaskHistoryInput): MoveEvent[] {
  return task.activities
    .filter((a) => a.action === "moved" && a.details && MOVE.test(a.details))
    .map((a) => {
      const [, from, to] = a.details!.match(MOVE)!
      return { at: a.createdAt.getTime(), from, to }
    })
    .sort((a, b) => a.at - b.at)
}

/** The status a task had at the end of `atMs`; null before it existed. */
export function statusAt(task: TaskHistoryInput, atMs: number, moves = statusMoves(task)): string | null {
  if (task.createdAt.getTime() > atMs) return null
  let current = moves.length ? moves[0].from ?? task.status : task.status
  for (const m of moves) {
    if (m.at > atMs) break
    current = m.to
  }
  return current
}

/**
 * When the task last became done, or null if it isn't done now. A task done
 * before any history was recorded falls back to updatedAt.
 */
export function doneAt(task: TaskHistoryInput, moves = statusMoves(task)): number | null {
  if (!DONE_TASK_STATUSES.includes(task.status)) return null
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]
    if (DONE_TASK_STATUSES.includes(m.to) && !DONE_TASK_STATUSES.includes(m.from ?? "")) return m.at
  }
  return task.updatedAt.getTime()
}

/** When work started (first move out of TODO), for cycle time. */
export function startedAt(task: TaskHistoryInput, moves = statusMoves(task)): number {
  const first = moves.find((m) => m.from === "TODO" && m.to !== "TODO")
  return first ? first.at : task.createdAt.getTime()
}
