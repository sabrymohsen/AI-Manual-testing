import { prisma } from "@/lib/db"
import { notify, type NotificationInput } from "@/lib/notifications"

/**
 * Notifications for bug reports and test cases.
 *
 * Assignees on bugs and test cases are not user ids: they come from the
 * project's assignee pool (ProjectTeamMember), so the stored value can be the
 * pool row id, the tracker's user id, or an email. Only a person who has an
 * account AND belongs to the project can be notified; anyone else is skipped
 * silently, which is correct for assignees who only exist in Jira/OpenProject.
 */

/** The app user behind a stored assignee value, if they belong to the project. */
export async function resolveAssigneeUserId(projectId: string, value: string | null | undefined): Promise<string | null> {
  if (!value) return null
  const v = value.trim()
  if (!v) return null

  const member = await prisma.projectTeamMember.findFirst({
    where: { projectId, OR: [{ id: v }, { externalId: v }, { email: { equals: v, mode: "insensitive" } }] },
    select: { email: true },
  })
  const email = member?.email ?? (v.includes("@") ? v : null)

  const user = await prisma.user.findFirst({
    where: email ? { email: { equals: email, mode: "insensitive" } } : { id: v },
    select: { id: true },
  })
  if (!user) return null
  return (await isProjectMember(projectId, user.id)) ? user.id : null
}

async function isProjectMember(projectId: string, userId: string) {
  const p = await prisma.project.findFirst({
    where: { id: projectId, OR: [{ userId }, { projectMembers: { some: { userId } } }] },
    select: { id: true },
  })
  return !!p
}

const bugUrl = (projectId: string, bugId: string) => `/projects/${projectId}/bug-reports?bugId=${bugId}`
const caseUrl = (projectId: string, caseId: string) => `/projects/${projectId}/test-cases?case=${caseId}`
const label = (key: string | null | undefined, title: string) => (key ? `${key} ${title}` : title)

/** Tell the new assignee a bug is theirs. Never notifies the person who assigned it. */
export async function notifyBugAssigned(opts: {
  projectId: string
  bug: { id: string; title: string; key?: string | null; severity?: string | null }
  assignedTo: string | null | undefined
  actorId: string
  actorName: string
}) {
  try {
    const userId = await resolveAssigneeUserId(opts.projectId, opts.assignedTo)
    if (!userId || userId === opts.actorId) return
    await notify({
      userId,
      type: "BUG_ASSIGNED",
      title: `${opts.actorName} assigned you a bug`,
      body: label(opts.bug.key, opts.bug.title) + (opts.bug.severity ? ` (${opts.bug.severity})` : ""),
      projectId: opts.projectId,
      actionUrl: bugUrl(opts.projectId, opts.bug.id),
      data: { bugId: opts.bug.id },
    })
  } catch (err) {
    console.error("[notify] bug assigned failed:", err)
  }
}

/** Statuses worth telling people about: the bug moved toward done, or came back. */
const STATUS_NEWS: Record<string, string> = {
  ReadyForRetest: "is ready for retest",
  Resolved: "was resolved",
  Closed: "was closed",
  Reopened: "was reopened",
  Rejected: "was rejected",
  Duplicate: "was marked as a duplicate",
}

/** Tell the reporter and the assignee when a bug changes to a status that needs them. */
export async function notifyBugStatus(opts: {
  projectId: string
  bug: { id: string; title: string; key?: string | null; reporterId?: string | null; assignedTo?: string | null }
  to: string
  actorId: string
  actorName: string
}) {
  const news = STATUS_NEWS[opts.to]
  if (!news) return
  try {
    const recipients = new Set<string>()
    if (opts.bug.reporterId) recipients.add(opts.bug.reporterId)
    const assignee = await resolveAssigneeUserId(opts.projectId, opts.bug.assignedTo)
    if (assignee) recipients.add(assignee)
    recipients.delete(opts.actorId)

    const payloads: NotificationInput[] = []
    for (const userId of recipients) {
      if (!(await isProjectMember(opts.projectId, userId))) continue
      payloads.push({
        userId,
        type: "BUG_STATUS",
        title: `A bug ${news}`,
        body: `${label(opts.bug.key, opts.bug.title)}, changed by ${opts.actorName}`,
        projectId: opts.projectId,
        actionUrl: bugUrl(opts.projectId, opts.bug.id),
        data: { bugId: opts.bug.id, status: opts.to },
      })
    }
    if (payloads.length) await notify(payloads)
  } catch (err) {
    console.error("[notify] bug status failed:", err)
  }
}

/** Tell the new assignee a test case is theirs to run or write. */
export async function notifyTestCaseAssigned(opts: {
  projectId: string
  testCase: { id: string; title: string }
  assignee: string | null | undefined
  actorId: string
  actorName: string
}) {
  try {
    const userId = await resolveAssigneeUserId(opts.projectId, opts.assignee)
    if (!userId || userId === opts.actorId) return
    await notify({
      userId,
      type: "TEST_CASE_ASSIGNED",
      title: `${opts.actorName} assigned you a test case`,
      body: opts.testCase.title,
      projectId: opts.projectId,
      actionUrl: caseUrl(opts.projectId, opts.testCase.id),
      data: { testCaseId: opts.testCase.id },
    })
  } catch (err) {
    console.error("[notify] test case assigned failed:", err)
  }
}

/**
 * Bulk changes send one notification per person per project ("assigned you 5
 * bugs"), not one per bug, so a bulk edit can't flood someone's inbox.
 */
export async function notifyBugsBulk(opts: {
  bugIds: string[]
  kind: "assigned" | "status"
  status?: string
  actorId: string
  actorName: string
}) {
  try {
    if (opts.kind === "status" && !STATUS_NEWS[opts.status ?? ""]) return
    const bugs = await prisma.bugReport.findMany({
      where: { id: { in: opts.bugIds }, projectId: { not: null } },
      select: { id: true, title: true, bugKey: true, projectId: true, reporterId: true, assignedTo: true },
    })
    // projectId -> userId -> bugs
    const groups = new Map<string, Map<string, typeof bugs>>()
    const resolved = new Map<string, string | null>()
    for (const b of bugs) {
      const projectId = b.projectId!
      const people = new Set<string>()
      const key = `${projectId}|${b.assignedTo ?? ""}`
      if (!resolved.has(key)) resolved.set(key, await resolveAssigneeUserId(projectId, b.assignedTo))
      const assignee = resolved.get(key)
      if (assignee) people.add(assignee)
      if (opts.kind === "status" && b.reporterId) people.add(b.reporterId)
      people.delete(opts.actorId)
      for (const userId of people) {
        const byUser = groups.get(projectId) ?? new Map<string, typeof bugs>()
        byUser.set(userId, [...(byUser.get(userId) ?? []), b])
        groups.set(projectId, byUser)
      }
    }

    const payloads: NotificationInput[] = []
    for (const [projectId, byUser] of groups) {
      for (const [userId, list] of byUser) {
        if (!(await isProjectMember(projectId, userId))) continue
        const one = list.length === 1 ? list[0] : null
        const what = one ? label(one.bugKey, one.title) : `${list.length} bugs`
        payloads.push({
          userId,
          type: opts.kind === "assigned" ? "BUG_ASSIGNED" : "BUG_STATUS",
          title:
            opts.kind === "assigned"
              ? `${opts.actorName} assigned you ${one ? "a bug" : `${list.length} bugs`}`
              : `${one ? "A bug" : `${list.length} bugs`} ${STATUS_NEWS[opts.status!].replace(/^is /, one ? "is " : "are ").replace(/^was /, one ? "was " : "were ")}`,
          body: one ? `${what}, changed by ${opts.actorName}` : list.slice(0, 3).map((b) => label(b.bugKey, b.title)).join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : ""),
          projectId,
          actionUrl: one ? bugUrl(projectId, one.id) : `/projects/${projectId}/bug-reports`,
          data: { bugIds: list.map((b) => b.id) },
        })
      }
    }
    if (payloads.length) await notify(payloads)
  } catch (err) {
    console.error("[notify] bulk bug notification failed:", err)
  }
}

/** Bulk assignment of test cases: one notification for the new assignee. */
export async function notifyTestCasesAssignedBulk(opts: {
  projectId: string
  testCaseIds: string[]
  assignee: string
  actorId: string
  actorName: string
}) {
  try {
    const userId = await resolveAssigneeUserId(opts.projectId, opts.assignee)
    if (!userId || userId === opts.actorId) return
    const cases = await prisma.testCase.findMany({
      where: { id: { in: opts.testCaseIds }, projectId: opts.projectId },
      select: { id: true, title: true },
      take: 4,
    })
    if (!cases.length) return
    const n = opts.testCaseIds.length
    const one = n === 1 ? cases[0] : null
    await notify({
      userId,
      type: "TEST_CASE_ASSIGNED",
      title: `${opts.actorName} assigned you ${one ? "a test case" : `${n} test cases`}`,
      body: one ? one.title : cases.slice(0, 3).map((c) => c.title).join(", ") + (n > 3 ? ` and ${n - 3} more` : ""),
      projectId: opts.projectId,
      actionUrl: one ? caseUrl(opts.projectId, one.id) : `/projects/${opts.projectId}/test-cases?assignee=${encodeURIComponent(opts.assignee)}`,
      data: { testCaseIds: opts.testCaseIds },
    })
  } catch (err) {
    console.error("[notify] bulk test case assignment failed:", err)
  }
}
