import { mkdir, writeFile, rm } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/db"
import { notify } from "@/lib/notifications"
import { extractRequirements } from "@/lib/ai/document-extractor"
import { brdAbsDir, brdRelPath, brdAudit } from "@/lib/brd/server"
import { ensureVersionText, extractTextFromBuffer, normalize } from "@/lib/brd/content"

/**
 * BRD lifecycle: new versions, requirement change detection, trash.
 *
 * Every path that creates a version (upload, re-upload, editor save, restore)
 * ends in `afterNewVersion`, so search text, requirement status and test-case
 * review flags can't drift depending on how the version was made.
 */

type Actor = { id: string; name?: string | null; email?: string }

export const TRASH_DAYS = 30

/** Every project member except the actor. */
export async function projectRecipients(projectId: string, exceptUserId?: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, projectMembers: { select: { userId: true } } },
  })
  if (!project) return []
  return Array.from(new Set([project.userId, ...project.projectMembers.map((m) => m.userId)])).filter(
    (id) => id !== exceptUserId
  )
}

// ── Requirements ─────────────────────────────────────────────────────────────

/** Requirement text is "still there" if its normalised description (or title) appears in the version. */
function stillPresent(req: { title: string; description: string }, normText: string) {
  const d = normalize(req.description)
  if (d.length >= 12 && normText.includes(d)) return true
  const t = normalize(req.title)
  return d.length < 12 && t.length >= 8 && normText.includes(t)
}

/**
 * Re-checks every requirement against a new version's text. A requirement
 * whose text is gone becomes "changed", and each test case linked to it is
 * flagged needsReview — that is the "what do I re-test?" answer for testers.
 * A changed requirement whose text reappears (e.g. after a restore) goes back
 * to active.
 */
export async function resyncRequirements(brdId: string, versionNumber: number, text: string) {
  const normText = normalize(text)
  const reqs = await prisma.brdRequirement.findMany({
    where: { brdId, status: { not: "removed" } },
    include: { testCases: { select: { testCaseId: true } } },
  })

  let changed = 0
  let flagged = 0
  for (const r of reqs) {
    const present = stillPresent(r, normText)
    if (!present && r.status === "active") {
      changed++
      await prisma.brdRequirement.update({
        where: { id: r.id },
        data: { status: "changed", changedInVersion: versionNumber, previousText: r.description },
      })
      if (r.testCases.length) {
        const res = await prisma.brdRequirementTestCase.updateMany({
          where: { requirementId: r.id },
          data: { needsReview: true, reviewReason: `${r.key} changed in BRD v${versionNumber}` },
        })
        flagged += res.count
      }
    } else if (present && r.status === "changed") {
      await prisma.brdRequirement.update({ where: { id: r.id }, data: { status: "active", changedInVersion: null } })
    }
  }
  return { changed, flagged }
}

/**
 * Finds requirements in the current version and adds the ones not already
 * tracked (by normalised text). Keys reuse the document's own ids (FR-12)
 * when it has them, otherwise continue REQ-n.
 */
export async function extractBrdRequirements(brdId: string) {
  const brd = await prisma.brdDocument.findUnique({
    where: { id: brdId },
    select: { currentVersionId: true, versions: { select: { id: true, versionNumber: true } } },
  })
  if (!brd?.currentVersionId) return { added: 0, total: 0 }
  const text = await ensureVersionText(brd.currentVersionId)
  const versionNumber = brd.versions.find((v) => v.id === brd.currentVersionId)?.versionNumber ?? null
  const { requirements } = extractRequirements(text)

  const existing = await prisma.brdRequirement.findMany({ where: { brdId }, select: { key: true, description: true } })
  const seen = new Set(existing.map((e) => normalize(e.description)))
  const usedKeys = new Set(existing.map((e) => e.key.toUpperCase()))
  let next = existing.length + 1
  const nextKey = () => {
    while (usedKeys.has(`REQ-${next}`)) next++
    return `REQ-${next++}`
  }

  const toAdd = []
  for (const r of requirements) {
    const n = normalize(r.description || r.title)
    if (!n || seen.has(n)) continue
    seen.add(n)
    const own = r.title.match(/^\s*((?:REQ|FR|NFR|SR|BR|UC)-?\d+)/i)?.[1]?.toUpperCase()
    const key = own && !usedKeys.has(own) ? own : nextKey()
    usedKeys.add(key)
    toAdd.push({
      brdId,
      key,
      title: r.title.slice(0, 300),
      description: r.description || r.title,
      type: r.type,
      priority: r.priority,
      orderIndex: existing.length + toAdd.length,
      sourceVersionNumber: versionNumber,
    })
  }
  if (toAdd.length) await prisma.brdRequirement.createMany({ data: toAdd })
  return { added: toAdd.length, total: existing.length + toAdd.length }
}

// ── Versions ─────────────────────────────────────────────────────────────────

/**
 * Bookkeeping for any new current version: cache its text, re-check
 * requirements, retire pending reviews of older versions, notify.
 */
export async function afterNewVersion(
  brdId: string,
  version: { id: string; versionNumber: number },
  actor: Actor,
  opts: { notifyTitle?: string } = {}
) {
  const text = await ensureVersionText(version.id)
  const { changed, flagged } = await resyncRequirements(brdId, version.versionNumber, text)

  // Reviews belong to a version; a new version needs a fresh review.
  await prisma.brdReview.updateMany({
    where: { brdId, decision: "Pending", NOT: { versionId: version.id } },
    data: { decision: "Superseded", decidedAt: new Date() },
  })

  const brd = await prisma.brdDocument.findUnique({ where: { id: brdId }, select: { name: true, projectId: true } })
  if (!brd) return { changed, flagged }
  if (changed) {
    await brdAudit(
      brdId,
      "requirements_changed",
      `v${version.versionNumber} changed ${changed} requirement${changed === 1 ? "" : "s"}; ${flagged} linked test case${flagged === 1 ? "" : "s"} flagged for review`,
      actor
    )
  }

  const recipients = await projectRecipients(brd.projectId, actor.id)
  const body =
    `BRD ${brd.name} updated to v${version.versionNumber}` +
    (flagged ? ` — ${flagged} linked test case${flagged === 1 ? "" : "s"} need review` : "")
  notify(
    recipients.map((userId) => ({
      userId,
      type: "SYSTEM" as const,
      title: opts.notifyTitle ?? "BRD updated",
      body,
      projectId: brd.projectId,
      actionUrl: `/projects/${brd.projectId}/brds/${brdId}${flagged ? "?tab=coverage" : ""}`,
    }))
  ).catch(() => {})

  return { changed, flagged }
}

/** Stores an uploaded file as the BRD's next version (re-upload). */
export async function createVersionFromFile(
  brd: { id: string; projectId: string; filename: string; currentVersionId: string | null },
  file: { buffer: Buffer; fileType: "pdf" | "docx"; name: string },
  changeSummary: string,
  actor: Actor
) {
  const last = await prisma.brdVersion.findFirst({ where: { brdId: brd.id }, orderBy: { versionNumber: "desc" } })
  const nextNumber = (last?.versionNumber ?? 0) + 1
  const storedName = `v${nextNumber}-${file.name.replace(/[^\w.\-]+/g, "_")}`
  await mkdir(brdAbsDir(brd.projectId, brd.id), { recursive: true })
  await writeFile(path.join(brdAbsDir(brd.projectId, brd.id), storedName), file.buffer)

  const text = await extractTextFromBuffer(file.buffer, file.fileType)
  const version = await prisma.brdVersion.create({
    data: {
      brdId: brd.id,
      versionNumber: nextNumber,
      storagePath: brdRelPath(brd.projectId, brd.id, storedName),
      fileType: file.fileType,
      fileSize: file.buffer.length,
      textContent: text,
      changeSummary,
      editorId: actor.id,
      editorName: actor.name || actor.email || null,
      previousVersionId: brd.currentVersionId,
    },
  })
  // A re-upload may switch PDF ↔ Word; the document follows its current version.
  await prisma.brdDocument.update({
    where: { id: brd.id },
    data: { currentVersionId: version.id, fileType: file.fileType, filename: file.name, updatedAt: new Date() },
  })
  await brdAudit(brd.id, "version_saved", `v${nextNumber} uploaded: ${changeSummary}`, actor)
  const result = await afterNewVersion(brd.id, version, actor)
  return { version, ...result }
}

// ── Trash ────────────────────────────────────────────────────────────────────

/**
 * Permanently removes BRDs deleted more than TRASH_DAYS ago, with their files.
 * Runs opportunistically when a project's hub is listed — the delete dialog
 * promises 30 days, and before this nothing was ever restored or purged.
 */
export async function purgeExpiredBrds(projectId: string) {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000)
  const expired = await prisma.brdDocument.findMany({
    where: { projectId, isDeleted: true, deletedAt: { lt: cutoff } },
    select: { id: true },
  })
  for (const b of expired) {
    await prisma.brdDocument.delete({ where: { id: b.id } }).catch(() => null)
    await rm(brdAbsDir(projectId, b.id), { recursive: true, force: true }).catch(() => null)
  }
  return expired.length
}
