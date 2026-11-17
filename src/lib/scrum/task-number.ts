/**
 * Per-project task numbers.
 *
 * Task.taskNumber was a database-wide autoincrement, so keys were shared by
 * every project: a brand-new project's first issue came out as CQS-118, and a
 * project's numbers jumped whenever another project added work. Each project
 * now counts on from its own highest number. Existing tasks keep theirs, so
 * keys already written in comments, branch names or trackers stay valid.
 */
import { prisma } from "@/lib/db"

type Db = Pick<typeof prisma, "task">

export async function nextTaskNumber(projectId: string, db: Db = prisma): Promise<number> {
  const agg = await db.task.aggregate({ where: { projectId }, _max: { taskNumber: true } })
  return (agg._max.taskNumber ?? 0) + 1
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002"

/**
 * Run `create` with the project's next number. Two issues created at the same
 * instant can pick the same number; the unique (projectId, taskNumber) index
 * rejects one, which simply takes the next number.
 */
export async function withNextTaskNumber<T>(projectId: string, create: (taskNumber: number) => Promise<T>, db: Db = prisma): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const n = await nextTaskNumber(projectId, db)
    try {
      return await create(n)
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= 8) throw err
    }
  }
}
