/**
 * Resolving the issues a BRD analysis found.
 *
 * 1. Draft: the AI proposes a user story and acceptance criteria for each issue
 *    (in the document's language). Values the document doesn't give are left as
 *    "[to confirm]" placeholders, never invented.
 * 2. Resolve: a person accepts the draft as it is, or edits it. The criteria
 *    become a user-story requirement (and a story on the Scrum board), and the
 *    matching open question is marked answered.
 * 3. Write to the BRD: every resolved issue not yet in the document is written
 *    into the Word file, next to the text it is about, as one new version.
 */
import { readFile } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/db"
import { STORAGE_ROOT, brdAudit } from "@/lib/brd/server"
import { normalize, detectLanguage } from "@/lib/brd/text-utils"
import { parseModelJson } from "@/lib/brd/analyze"
import { insertCriteriaIntoDocx } from "@/lib/brd/docx-insert"
import { createVersionFromFile } from "@/lib/brd/lifecycle"
import { sendRequirementsToBoard, storyDescription } from "@/lib/brd/to-board"
import { chatWithConfiguredProvider } from "@/lib/ai/provider-chat"
import { KIND_LABEL, type AnalysisIssue, type IssueDraft, type IssueResolution } from "@/lib/brd/analysis-types"

type Actor = { id: string; name?: string | null; email?: string }

/** Change summary of a version written by "Update the BRD" — not a real document change. */
export const CRITERIA_VERSION_PREFIX = "Acceptance criteria added for"

const DRAFT_BATCH = 6
const MAX_CRITERIA = 8

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
export const cleanCriteria = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((c) => clean(c, 600).replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_CRITERIA)

async function loadIssues(analysisId: string) {
  const a = await prisma.brdAnalysis.findUnique({ where: { id: analysisId } })
  if (!a) throw new Error("Analysis not found")
  return { analysis: a, issues: ((a.issues as unknown) as AnalysisIssue[]) || [] }
}

/** Re-reads the issues and applies `change` to the latest copy, so parallel saves don't undo each other. */
async function updateIssues(analysisId: string, change: (issues: AnalysisIssue[]) => void) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BrdAnalysis" WHERE id = ${analysisId} FOR UPDATE`
    const a = await tx.brdAnalysis.findUniqueOrThrow({ where: { id: analysisId }, select: { issues: true } })
    const issues = ((a.issues as unknown) as AnalysisIssue[]) || []
    change(issues)
    await tx.brdAnalysis.update({ where: { id: analysisId }, data: { issues: issues as any } })
  })
}

// ── 1. Draft ─────────────────────────────────────────────────────────────────

export function draftSystemPrompt(language: string | null): string {
  const lang =
    language === "ar"
      ? "Write in Arabic, like the document."
      : language === "en"
        ? "Write in English, like the document."
        : "Write in the language of each issue's quote."
  return [
    "You are a senior business analyst and QA lead. Each item is an issue a reviewer found in a Business Requirements Document (BRD): vague, missing or untestable wording.",
    "For each issue, propose ONE user story and its acceptance criteria that would make that part of the BRD clear and testable. A person will confirm or edit them before they are used.",
    `- ${lang}`,
    "- title: the user story in one line (As a <role>, I want <goal> / بصفتي <الدور>، أرغب في <الهدف>). Use the roles and terms the quote uses.",
    "- criteria: 2 to 5 lines, each one observable and testable (what the user sees or the system does), no 'should be clear/appropriate/fast'.",
    "- Base them on the quote and the issue. Never invent numbers, limits, durations, roles or system names the text doesn't give: write the placeholder [to confirm] (Arabic: [يُحدَّد]) where such a value is needed.",
    "Return ONLY JSON: {\"items\":[{\"id\":\"1\",\"title\":\"...\",\"criteria\":[\"...\"]}]}",
  ].join("\n")
}

export function parseDraftReply(raw: string, ids: string[]): Map<string, { title: string; criteria: string[] }> {
  const out = new Map<string, { title: string; criteria: string[] }>()
  const data = parseModelJson(raw)
  const items: any[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
  items.forEach((it, idx) => {
    const id = String(it?.id ?? ids[idx] ?? "").trim()
    if (!ids.includes(id)) return
    const title = clean(it?.title, 300)
    const criteria = cleanCriteria(it?.criteria ?? it?.acceptanceCriteria)
    if (title && criteria.length) out.set(id, { title, criteria })
  })
  return out
}

/** When there's no AI: the reviewer's own suggestion is the starting point. */
export function fallbackDraft(issue: AnalysisIssue): { title: string; criteria: string[] } {
  const title = clean(issue.quote?.split("|")[0] || issue.text, 160) || clean(issue.text, 160)
  const criteria = cleanCriteria(
    (issue.suggestion || issue.text)
      .split(/\n|(?<=[.؛;])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return { title, criteria: criteria.length ? criteria : [clean(issue.text, 600)] }
}

/** Drafts criteria for the unresolved issues (or just `issueIds`). */
export async function draftIssueCriteria(analysisId: string, issueIds: string[] | null, actor: Actor) {
  const { analysis, issues } = await loadIssues(analysisId)
  const brd = await prisma.brdDocument.findUniqueOrThrow({ where: { id: analysis.brdId }, select: { projectId: true } })
  const todo = issues.filter((i) => !i.resolution && (issueIds ? issueIds.includes(i.id) : true))
  if (!todo.length) return { drafted: 0, by: null as IssueDraft["by"] | null, error: null as string | null }

  const drafts = new Map<string, IssueDraft>()
  const now = () => new Date().toISOString()
  let aiError: string | null = null
  const system = draftSystemPrompt(analysis.language)

  for (let start = 0; start < todo.length && !aiError; start += DRAFT_BATCH) {
    const batch = todo.slice(start, start + DRAFT_BATCH)
    const ids = batch.map((_, n) => String(n + 1))
    const prompt = batch
      .map((i, n) =>
        [
          `### ${n + 1}`,
          `Section: ${i.section || "-"}`,
          `Quote: ${i.quote || "-"}`,
          `Issue: ${i.text}`,
          i.suggestion ? `Reviewer's suggestion: ${i.suggestion}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n")
    try {
      const raw = await chatWithConfiguredProvider({
        system,
        prompt: `${prompt}\n\nReturn the JSON now.`,
        json: true,
        temperature: 0.2,
        maxTokens: 3000,
        timeoutMs: 240_000,
        projectId: brd.projectId,
        userId: actor.id,
        command: "analyze-brd",
        contextTokens: 8192,
      })
      const parsed = parseDraftReply(raw, ids)
      batch.forEach((issue, n) => {
        const d = parsed.get(String(n + 1))
        if (d) drafts.set(issue.id, { ...d, by: "ai", at: now() })
      })
    } catch (e) {
      aiError = (e as Error).message || "The AI couldn't draft criteria"
    }
  }
  // Anything the AI didn't cover starts from the suggestion.
  for (const i of todo) if (!drafts.has(i.id)) drafts.set(i.id, { ...fallbackDraft(i), by: "suggestion", at: now() })

  await updateIssues(analysisId, (list) => {
    for (const i of list) {
      const d = drafts.get(i.id)
      if (d && !i.resolution) i.draft = d
    }
  })
  const byAi = Array.from(drafts.values()).filter((d) => d.by === "ai").length
  return { drafted: drafts.size, by: byAi ? ("ai" as const) : ("suggestion" as const), error: aiError }
}

// ── 2. Resolve ───────────────────────────────────────────────────────────────

const SEVERITY_PRIORITY: Record<string, string> = { high: "High", medium: "Medium", low: "Low" }

async function nextStoryKey(brdId: string): Promise<string> {
  const keys = (await prisma.brdRequirement.findMany({ where: { brdId }, select: { key: true } })).map((r) => r.key.toUpperCase())
  let n = 1
  for (const k of keys) {
    const m = k.match(/^US-(\d+)$/)
    if (m) n = Math.max(n, Number(m[1]) + 1)
  }
  while (keys.includes(`US-${n}`)) n++
  return `US-${n}`
}

export async function resolveIssue(
  analysisId: string,
  issueId: string,
  input: { title: string; criteria: string[]; edited: boolean; toBoard: boolean },
  actor: Actor
): Promise<IssueResolution> {
  const { analysis, issues } = await loadIssues(analysisId)
  const issue = issues.find((i) => i.id === issueId)
  if (!issue) throw new Error("Issue not found")
  if (issue.resolution?.brdVersion) {
    throw new Error(`These criteria are already in the BRD (v${issue.resolution.brdVersion}). Edit the BRD itself to change them.`)
  }
  const title = clean(input.title, 300)
  const criteria = cleanCriteria(input.criteria)
  if (!title) throw new Error("Give the user story a title")
  if (!criteria.length) throw new Error("Add at least one acceptance criterion")

  const brd = await prisma.brdDocument.findUniqueOrThrow({ where: { id: analysis.brdId }, select: { id: true, name: true } })
  const language = analysis.language || detectLanguage(`${title} ${criteria.join(" ")}`)
  const ar = language === "ar"

  // Saving again before it's in the BRD updates the same requirement.
  let reqId = issue.resolution?.requirementId ?? null
  let req = reqId ? await prisma.brdRequirement.findUnique({ where: { id: reqId } }) : null
  // An issue about a requirement that's already tracked adds to that one.
  const related = !req && issue.relatedKeys?.length
    ? await prisma.brdRequirement.findFirst({
        where: { brdId: brd.id, key: { in: issue.relatedKeys, mode: "insensitive" }, status: { not: "removed" } },
      })
    : null

  const appended = !!issue.resolution?.appended
  if (req && !appended) {
    req = await prisma.brdRequirement.update({
      where: { id: req.id },
      data: { title, acceptanceCriteria: criteria as any, description: storyText(title, issue, ar) },
    })
  } else if (related || (req && appended)) {
    const target = (req ?? related)!
    const had = Array.isArray(target.acceptanceCriteria) ? (target.acceptanceCriteria as string[]) : []
    const seen = new Set(had.map((c) => normalize(c)))
    req = await prisma.brdRequirement.update({
      where: { id: target.id },
      data: { acceptanceCriteria: [...had, ...criteria.filter((c) => !seen.has(normalize(c)))] as any },
    })
  } else {
    const count = await prisma.brdRequirement.count({ where: { brdId: brd.id } })
    req = await prisma.brdRequirement.create({
      data: {
        brdId: brd.id,
        key: await nextStoryKey(brd.id),
        title,
        description: storyText(title, issue, ar),
        type: KIND_LABEL.user_story.en,
        priority: SEVERITY_PRIORITY[issue.severity] ?? "Medium",
        orderIndex: count,
        origin: "manual",
        acceptanceCriteria: criteria as any,
        sourceQuote: issue.quote || null,
        section: issue.section || null,
        language,
      },
    })
  }
  reqId = req.id

  // The Scrum story: create it, or refresh the one it already has.
  let storyKey: string | null = issue.resolution?.storyKey ?? null
  let taskId: string | null = req.taskId
  if (req.taskId) {
    await prisma.task.update({
      where: { id: req.taskId },
      data: { title: req.title.slice(0, 300), description: storyDescription(req, brd.name) },
    })
  } else if (input.toBoard) {
    const sent = await sendRequirementsToBoard(brd.id, [req.id], actor)
    const s = sent.stories.find((x) => x.requirementId === req!.id)
    if (s) {
      storyKey = s.key
      taskId = s.taskId
    }
  }

  // The open question this issue became (if the analysis was applied) now has an answer.
  const answer = [title, ...criteria.map((c) => `• ${c}`)].join("\n")
  const questions = await prisma.brdQuestion.findMany({ where: { brdId: brd.id, status: "Open" }, select: { id: true, question: true } })
  const q = questions.find((x) => normalize(x.question) === normalize(issue.text))
  if (q) {
    await prisma.brdQuestion.update({
      where: { id: q.id },
      data: {
        status: "Answered",
        answer,
        answerSource: "other",
        answeredById: actor.id,
        answeredByName: actor.name ?? actor.email ?? null,
        answeredAt: new Date(),
      },
    })
  }

  const resolution: IssueResolution = {
    status: input.edited ? "edited" : "accepted",
    title,
    criteria,
    requirementId: reqId,
    requirementKey: req.key,
    storyKey,
    taskId,
    byName: actor.name ?? actor.email ?? null,
    at: new Date().toISOString(),
    brdVersion: null,
    ...(appended || (related && req.id === related.id) ? { appended: true } : {}),
  }
  await updateIssues(analysisId, (list) => {
    const i = list.find((x) => x.id === issueId)
    if (i) i.resolution = resolution
  })
  await brdAudit(
    brd.id,
    "issue_resolved",
    `${input.edited ? "Edited and accepted" : "Accepted"} criteria for "${issue.text.slice(0, 120)}" → ${req.key}${storyKey ? ` (${storyKey})` : ""}`,
    actor
  )
  return resolution
}

function storyText(title: string, issue: AnalysisIssue, ar: boolean) {
  return `${title}\n\n${ar ? "أُضيفت لمعالجة ملاحظة المراجعة" : "Added to resolve the review issue"}: ${issue.text}`
}

// ── 3. Write into the BRD ────────────────────────────────────────────────────

export async function pendingResolutions(brdId: string) {
  const analyses = await prisma.brdAnalysis.findMany({ where: { brdId }, select: { id: true, issues: true }, orderBy: { createdAt: "asc" } })
  const out: { analysisId: string; issue: AnalysisIssue }[] = []
  for (const a of analyses) {
    for (const i of ((a.issues as unknown) as AnalysisIssue[]) || []) {
      if (i.resolution && i.resolution.brdVersion == null) out.push({ analysisId: a.id, issue: i })
    }
  }
  return out
}

/** Writes every resolved issue that isn't in the document yet into a new Word version. */
export async function writeResolutionsToBrd(brdId: string, actor: Actor) {
  const brd = await prisma.brdDocument.findUniqueOrThrow({
    where: { id: brdId },
    select: { id: true, projectId: true, filename: true, fileType: true, status: true, currentVersionId: true },
  })
  if (brd.fileType !== "docx") {
    throw new Error("Only Word BRDs can be updated. The criteria are saved on the user stories; upload a Word version to write them in.")
  }
  if (brd.status === "Final") throw new Error("This BRD is Final and locked. Change its status first.")
  const pending = await pendingResolutions(brdId)
  if (!pending.length) throw new Error("There are no saved criteria waiting to be written into the BRD")

  const current = await prisma.brdVersion.findUnique({ where: { id: brd.currentVersionId ?? "" } })
  if (!current) throw new Error("This BRD has no current version")
  const buf = await readFile(path.join(STORAGE_ROOT, current.storagePath))

  const { buffer, placedNearQuote } = await insertCriteriaIntoDocx(
    buf,
    pending.map(({ issue }) => ({ quote: issue.quote, title: issue.resolution!.title, criteria: issue.resolution!.criteria }))
  )
  const keys = pending.map(({ issue }) => issue.resolution!.requirementKey).filter(Boolean)
  const summary = `${CRITERIA_VERSION_PREFIX} ${pending.length} review issue${pending.length === 1 ? "" : "s"}${keys.length ? ` (${Array.from(new Set(keys)).join(", ")})` : ""}`.slice(0, 500)
  const { version } = await createVersionFromFile(brd, { buffer, fileType: "docx", name: brd.filename }, summary, actor)

  const placed = new Map(pending.map(({ issue }, n) => [issue.id, placedNearQuote[n]]))
  for (const analysisId of Array.from(new Set(pending.map((p) => p.analysisId)))) {
    await updateIssues(analysisId, (list) => {
      for (const i of list) {
        if (i.resolution && i.resolution.brdVersion == null && placed.has(i.id)) {
          i.resolution.brdVersion = version.versionNumber
          i.resolution.nearQuote = placed.get(i.id)
        }
      }
    })
  }
  return {
    versionNumber: version.versionNumber,
    written: pending.length,
    nearQuote: placedNearQuote.filter(Boolean).length,
  }
}
