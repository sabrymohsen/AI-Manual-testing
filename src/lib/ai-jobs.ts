import { prisma } from "@/lib/db"

/**
 * Background AI jobs. The work runs in this server process after the response
 * is sent, so the user can leave the page; progress and the result live in the
 * AiJob row, which the jobs tray (components/desktop/ai-jobs-tray.tsx) polls.
 */

/** A job still "running" this long ago died with a server restart. */
export const JOB_STALE_MS = 20 * 60 * 1000

export interface StartJob {
  userId: string
  projectId?: string | null
  kind: string
  title: string
  link?: string | null
}

export async function startAiJob<T>(job: StartJob, work: () => Promise<T>) {
  const row = await prisma.aiJob.create({
    data: { userId: job.userId, projectId: job.projectId ?? null, kind: job.kind, title: job.title.slice(0, 300), link: job.link ?? null },
  })
  void (async () => {
    try {
      const result = await work()
      // The work may decide where "Open" goes (e.g. the test it created).
      const link = result && typeof (result as any).link === "string" ? (result as any).link : undefined
      await prisma.aiJob.update({
        where: { id: row.id },
        data: { status: "done", result: (result ?? null) as any, finishedAt: new Date(), ...(link ? { link } : {}) },
      })
    } catch (e: any) {
      await prisma.aiJob
        .update({
          where: { id: row.id },
          data: { status: "failed", error: String(e?.message || e).slice(0, 1000), finishedAt: new Date() },
        })
        .catch(() => {})
    }
  })()
  return row
}

/** The user's running jobs plus finished ones they haven't been told about. */
export async function listAiJobs(userId: string) {
  await prisma.aiJob.updateMany({
    where: { userId, status: "running", createdAt: { lt: new Date(Date.now() - JOB_STALE_MS) } },
    data: { status: "failed", error: "Stopped — the server restarted while it was running. Please try again.", finishedAt: new Date() },
  })
  return prisma.aiJob.findMany({
    where: { userId, OR: [{ status: "running" }, { seen: false }] },
    orderBy: { createdAt: "asc" },
    take: 20,
  })
}
