/**
 * BRD requirements → Scrum board.
 *
 * Epic requirements become ScrumEpics; every other picked requirement becomes a
 * STORY in the backlog (no sprint), under its epic. A story with no epic in the
 * document goes under one epic named after the BRD. Each requirement remembers
 * what it made (taskId / epicId), so sending again never duplicates, and test
 * cases linked to the requirement are linked to its story too.
 */
import { prisma } from "@/lib/db"
import { withNextTaskNumber } from "@/lib/scrum/task-number"
import { logActivity } from "@/lib/scrum/server"
import { brdAudit } from "@/lib/brd/server"

type Actor = { id: string; name?: string | null; email?: string }

export const isEpicType = (type: string | null | undefined) => /^(epic|ملحمة)$/i.test((type ?? "").trim())
/** Picked by default when sending: real stories, not loose rules or fields. */
export const isStoryType = (type: string | null | undefined) =>
  /^(user story|functional|قصة مستخدم|وظيفي)$/i.test((type ?? "").trim()) || !type

const PRIORITY: Record<string, "HIGHEST" | "HIGH" | "MEDIUM" | "LOW"> = {
  critical: "HIGHEST",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
}
export const toTaskPriority = (p: string | null | undefined) => PRIORITY[(p ?? "").toLowerCase()] ?? "MEDIUM"

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const criteriaOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [])

/** Story description (HTML, as the board's editor writes it), in the document's language. */
export function storyDescription(
  req: { key: string; description: string; acceptanceCriteria: unknown; sourceQuote: string | null; section: string | null; language: string | null },
  brdName: string
): string {
  const ar = req.language === "ar"
  const parts: string[] = []
  if (req.description?.trim()) parts.push(`<p dir="auto">${esc(req.description.trim()).replace(/\n/g, "<br>")}</p>`)
  const criteria = criteriaOf(req.acceptanceCriteria)
  if (criteria.length) {
    parts.push(`<h3 dir="auto">${ar ? "معايير القبول" : "Acceptance criteria"}</h3>`)
    parts.push(`<ul dir="auto">${criteria.map((c) => `<li dir="auto">${esc(c)}</li>`).join("")}</ul>`)
  }
  if (req.sourceQuote?.trim()) {
    parts.push(`<blockquote dir="auto">${esc(req.sourceQuote.trim())}</blockquote>`)
  }
  const where = [brdName, req.section].filter(Boolean).join(" › ")
  parts.push(`<p dir="auto"><em>${ar ? "المصدر" : "Source"}: ${esc(where)} (${esc(req.key)})</em></p>`)
  return parts.join("\n")
}

export interface SendResult {
  epicsCreated: number
  storiesCreated: number
  alreadyOnBoard: number
  testCasesLinked: number
  stories: { requirementId: string; taskId: string; key: string }[]
}

/**
 * Send `requirementIds` (or every story-type requirement when omitted) to the
 * board. Removed requirements are skipped.
 */
export async function sendRequirementsToBoard(brdId: string, requirementIds: string[] | null, actor: Actor): Promise<SendResult> {
  const brd = await prisma.brdDocument.findUniqueOrThrow({ where: { id: brdId }, select: { id: true, name: true, projectId: true } })
  const project = await prisma.project.findUnique({ where: { id: brd.projectId }, select: { boardKey: true } })
  const all = await prisma.brdRequirement.findMany({
    where: { brdId, status: { not: "removed" } },
    orderBy: { orderIndex: "asc" },
    include: {
      task: { select: { id: true, taskNumber: true } },
      epic: { select: { id: true } },
      testCases: { select: { testCaseId: true } },
    },
  })
  const picked = requirementIds
    ? all.filter((r) => requirementIds.includes(r.id))
    : all.filter((r) => isEpicType(r.type) || isStoryType(r.type))

  const result: SendResult = { epicsCreated: 0, storiesCreated: 0, alreadyOnBoard: 0, testCasesLinked: 0, stories: [] }
  const byKey = new Map(all.map((r) => [r.key.toUpperCase(), r]))
  const epicIdFor = new Map<string, string>() // requirement id → ScrumEpic id

  async function ensureEpic(req: (typeof all)[number]): Promise<string> {
    const known = epicIdFor.get(req.id) ?? req.epic?.id
    if (known) {
      epicIdFor.set(req.id, known)
      return known
    }
    const epic = await prisma.scrumEpic.create({
      data: { projectId: brd.projectId, title: req.title.slice(0, 300), description: req.description || null },
    })
    await prisma.brdRequirement.update({ where: { id: req.id }, data: { epicId: epic.id } })
    await prisma.brdLink.create({ data: { brdId, linkType: "epic", epicId: epic.id, label: epic.title, createdById: actor.id } })
    epicIdFor.set(req.id, epic.id)
    result.epicsCreated++
    return epic.id
  }

  // For stories the document doesn't place under an epic: one epic named after the BRD.
  let brdEpicId: string | null = null
  async function ensureBrdEpic(): Promise<string> {
    if (brdEpicId) return brdEpicId
    const link = await prisma.brdLink.findFirst({
      where: { brdId, linkType: "epic", epic: { title: brd.name, projectId: brd.projectId } },
      select: { epicId: true },
    })
    if (link?.epicId) return (brdEpicId = link.epicId)
    const epic = await prisma.scrumEpic.create({
      data: { projectId: brd.projectId, title: brd.name.slice(0, 300), description: `BRD: ${brd.name}` },
    })
    await prisma.brdLink.create({ data: { brdId, linkType: "epic", epicId: epic.id, label: epic.title, createdById: actor.id } })
    result.epicsCreated++
    return (brdEpicId = epic.id)
  }

  for (const req of picked.filter((r) => isEpicType(r.type))) await ensureEpic(req)

  const last = await prisma.task.aggregate({ where: { projectId: brd.projectId, status: "TODO" }, _max: { boardRank: true } })
  let rank = (last._max.boardRank ?? -1) + 1

  for (const req of picked.filter((r) => !isEpicType(r.type))) {
    if (req.task) {
      result.alreadyOnBoard++
      continue
    }
    const parent = req.parentKey ? byKey.get(req.parentKey.toUpperCase()) : undefined
    const epicId = parent && isEpicType(parent.type) ? await ensureEpic(parent) : await ensureBrdEpic()

    const task = await withNextTaskNumber(brd.projectId, (taskNumber) =>
      prisma.task.create({
        data: {
          taskNumber,
          projectId: brd.projectId,
          title: req.title.slice(0, 300),
          description: storyDescription(req, brd.name),
          type: "STORY",
          status: "TODO",
          priority: toTaskPriority(req.priority),
          epicId,
          sprintId: null,
          boardRank: rank++,
          reporterId: actor.id,
          labels: ["brd", req.key.toLowerCase()].map((l) => l.slice(0, 40)),
        },
        select: { id: true, taskNumber: true, title: true },
      })
    )
    const key = project?.boardKey ? `${project.boardKey}-${task.taskNumber}` : `#${task.taskNumber}`
    await prisma.brdRequirement.update({ where: { id: req.id }, data: { taskId: task.id } })
    await prisma.brdLink.create({ data: { brdId, linkType: "story", taskId: task.id, label: `${key} · ${task.title}`, createdById: actor.id } })
    await logActivity(task.id, "created", `Created from BRD "${brd.name}" (${req.key})`, actor.id)

    if (req.testCases.length) {
      result.testCasesLinked += (
        await prisma.taskTestCase.createMany({
          data: req.testCases.map((t) => ({ taskId: task.id, testCaseId: t.testCaseId })),
          skipDuplicates: true,
        })
      ).count
    }
    result.storiesCreated++
    result.stories.push({ requirementId: req.id, taskId: task.id, key })
  }

  if (result.epicsCreated || result.storiesCreated) {
    await brdAudit(
      brdId,
      "stories_created",
      `Created ${result.storiesCreated} stor${result.storiesCreated === 1 ? "y" : "ies"} and ${result.epicsCreated} epic(s) on the Scrum board`,
      actor
    )
  }
  return result
}

/** Link test cases to the story made from a requirement (no-op when it has none). */
export async function linkTestsToRequirementStory(requirementId: string, testCaseIds: string[]) {
  if (!testCaseIds.length) return 0
  const req = await prisma.brdRequirement.findUnique({ where: { id: requirementId }, select: { taskId: true } })
  if (!req?.taskId) return 0
  return (
    await prisma.taskTestCase.createMany({
      data: testCaseIds.map((testCaseId) => ({ taskId: req.taskId!, testCaseId })),
      skipDuplicates: true,
    })
  ).count
}

export async function unlinkTestsFromRequirementStory(requirementId: string, testCaseIds: string[]) {
  if (!testCaseIds.length) return 0
  const req = await prisma.brdRequirement.findUnique({ where: { id: requirementId }, select: { taskId: true } })
  if (!req?.taskId) return 0
  return (await prisma.taskTestCase.deleteMany({ where: { taskId: req.taskId, testCaseId: { in: testCaseIds } } })).count
}
