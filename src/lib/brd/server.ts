import path from "path"
import { prisma } from "@/lib/db"
import { getSession } from "@/lib/auth"
import { resolveProjectRole } from "@/lib/api-guards"

/**
 * Load a BRD and resolve the caller's role on its project. Pass `manage: true`
 * to require edit rights (canManageBrds); otherwise any project member may view.
 */
export async function requireBrdAccess(brdId: string, opts: { manage?: boolean } = {}) {
  const session = await getSession()
  if (!session) return { error: "Not authenticated", status: 401 as const, brd: null, resolved: null, session: null }

  const brd = await prisma.brdDocument.findUnique({ where: { id: brdId } })
  if (!brd || brd.isDeleted) {
    return { error: "BRD not found", status: 404 as const, brd: null, resolved: null, session: null }
  }
  const resolved = await resolveProjectRole(brd.projectId, session.user.id)
  if (!resolved || resolved.role === null) {
    return { error: "Access denied", status: 404 as const, brd: null, resolved: null, session: null }
  }
  if (opts.manage && !resolved.permissions.canManageBrds) {
    return { error: "Missing permission: canManageBrds", status: 403 as const, brd: null, resolved: null, session: null }
  }
  return { error: null, status: 200 as const, brd, resolved, session }
}

export const STORAGE_ROOT = process.env.STORAGE_ROOT || "./storage"

export const BRD_STATUSES = ["Draft", "Reviewed", "Final", "Archived"] as const
export type BrdStatus = (typeof BRD_STATUSES)[number]

export const ALLOWED_UPLOAD_TYPES: Record<string, "pdf" | "docx"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}
export const MAX_BRD_SIZE = 25 * 1024 * 1024 // 25MB

/** Relative-to-STORAGE_ROOT path for a stored version file. */
export function brdRelPath(projectId: string, brdId: string, storedName: string) {
  return path.posix.join("brds", projectId, brdId, storedName)
}
export function brdAbsDir(projectId: string, brdId: string) {
  return path.join(STORAGE_ROOT, "brds", projectId, brdId)
}
/** URL the browser uses to fetch a stored file via the authenticated streamer. */
export function brdFileUrl(relPath: string) {
  return `/api/files/${relPath.split("/").map(encodeURIComponent).join("/")}`
}

/** Append an immutable audit entry. Never throws. */
export async function brdAudit(
  brdId: string,
  action: string,
  detail: string | null,
  actor: { id: string; name?: string | null; email?: string } | null
) {
  try {
    await prisma.brdAuditLog.create({
      data: {
        brdId,
        action,
        detail: detail ?? null,
        actorId: actor?.id ?? null,
        actorName: actor ? actor.name || actor.email || null : null,
      },
    })
  } catch (err) {
    console.error("brdAudit failed:", err)
  }
}

const linkInclude = {
  epic: { select: { id: true, title: true, color: true } },
  task: { select: { id: true, taskNumber: true, title: true, status: true, type: true } },
} as const

export const brdDetailInclude = {
  versions: { orderBy: { versionNumber: "desc" } },
  links: { include: linkInclude, orderBy: { createdAt: "asc" } },
  auditLogs: { orderBy: { createdAt: "desc" }, take: 200 },
  _count: { select: { links: true, versions: true, annotations: true } },
} as const

/** Shape a BRD (optionally with relations) for the client. */
export function serializeBrd(brd: any, boardKey?: string | null) {
  const current = brd.versions?.find((v: any) => v.id === brd.currentVersionId) ?? brd.versions?.[0]
  return {
    id: brd.id,
    name: brd.name,
    filename: brd.filename,
    fileType: brd.fileType,
    status: brd.status,
    projectId: brd.projectId,
    uploaderId: brd.uploaderId,
    uploaderName: brd.uploaderName,
    currentVersionId: brd.currentVersionId,
    versionCount: brd._count?.versions ?? brd.versions?.length ?? 0,
    linkCount: brd._count?.links ?? brd.links?.length ?? 0,
    annotationCount: brd._count?.annotations ?? 0,
    currentFileUrl: current ? brdFileUrl(current.storagePath) : null,
    currentFileSize: current?.fileSize ?? 0,
    isDeleted: brd.isDeleted,
    createdAt: brd.createdAt,
    updatedAt: brd.updatedAt,
    versions: brd.versions?.map((v: any) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      fileType: v.fileType,
      fileSize: v.fileSize,
      changeSummary: v.changeSummary,
      editorId: v.editorId,
      editorName: v.editorName,
      previousVersionId: v.previousVersionId,
      fileUrl: brdFileUrl(v.storagePath),
      hasHtml: !!v.contentHtml,
      createdAt: v.createdAt,
    })),
    links: brd.links?.map((l: any) => ({
      id: l.id,
      linkType: l.linkType,
      label: l.label,
      epicId: l.epicId,
      taskId: l.taskId,
      // Null relation + non-null id snapshot ⇒ the linked item was deleted.
      deleted: (l.linkType === "epic" && !l.epic) || (l.linkType === "story" && !l.task),
      epic: l.epic,
      task: l.task
        ? { ...l.task, key: boardKey ? `${boardKey}-${l.task.taskNumber}` : `#${l.task.taskNumber}` }
        : null,
      createdAt: l.createdAt,
    })),
    auditLogs: brd.auditLogs?.map((a: any) => ({
      id: a.id,
      action: a.action,
      detail: a.detail,
      actorName: a.actorName,
      createdAt: a.createdAt,
    })),
  }
}
