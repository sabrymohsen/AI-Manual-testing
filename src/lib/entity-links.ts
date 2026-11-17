/**
 * Generic cross-entity linking.
 *
 * One registry describes every linkable entity type — how to find it, how to
 * label it, and where it lives in the UI. The links API, the linkables search
 * and the chat `#` mention picker all read from here, so adding a new linkable
 * type is a single entry rather than three parallel switch statements that
 * drift apart.
 */
import { prisma } from "@/lib/db"
import type { LinkableEntityType } from "@prisma/client"

export const LINKABLE_TYPES = [
  "TASK",
  "BUG_REPORT",
  "TEST_CASE",
  "TEST_RUN",
  "BRD_DOCUMENT",
  "REQUIREMENT",
  "SPRINT",
  "EPIC",
  "MANUAL_TEST_SESSION",
] as const satisfies readonly LinkableEntityType[]

export function isLinkableType(v: unknown): v is LinkableEntityType {
  return typeof v === "string" && (LINKABLE_TYPES as readonly string[]).includes(v)
}

/** Relationship labels offered in the UI. Null/absent is treated as the default. */
export const RELATION_LABELS = [
  "relates to",
  "blocks",
  "is blocked by",
  "verifies",
  "is verified by",
  "documents",
] as const
export const DEFAULT_RELATION = "relates to"

/** The inverse of each relation, used when rendering a link from the far end. */
const INVERSE_RELATION: Record<string, string> = {
  "relates to": "relates to",
  blocks: "is blocked by",
  "is blocked by": "blocks",
  verifies: "is verified by",
  "is verified by": "verifies",
  documents: "is documented by",
  "is documented by": "documents",
}

export function inverseRelation(label: string | null | undefined): string {
  const l = label || DEFAULT_RELATION
  return INVERSE_RELATION[l] ?? l
}

/** A linkable entity, flattened for the client. */
export type ResolvedEntity = {
  id: string
  type: LinkableEntityType
  /** Short identifier shown as a chip, e.g. "SHOP-12", "BUG-0004", "TC". */
  key: string
  /** Human-readable title. */
  label: string
  /** In-app link to the entity. */
  url: string
  /** Optional secondary detail (status, etc.). */
  meta?: string | null
}

type EntityConfig = {
  label: string
  /** Prisma delegate name on the client. */
  model: keyof typeof prisma
  /** Fields needed to build key/label/meta. Values may nest (relation selects). */
  select: Record<string, unknown>
  /** Fields searched by the autocomplete, in priority order. */
  searchFields: string[]
  /** Sort field for the picker. Not every model has `createdAt`. */
  orderField?: string
  /**
   * How this model is scoped to a project. Most have their own `projectId`;
   * Subtask only reaches it through its parent Task.
   */
  projectScope?: (projectId: string) => Record<string, unknown>
  toEntity: (row: any, ctx: { projectId: string; boardKey: string | null }) => ResolvedEntity
}

const shortId = (id: string) => id.slice(0, 8)

export const ENTITY_CONFIG: Record<LinkableEntityType, EntityConfig> = {
  TASK: {
    label: "Task",
    model: "task",
    select: { id: true, taskNumber: true, title: true, status: true, type: true },
    searchFields: ["title"],
    toEntity: (r, { projectId, boardKey }) => ({
      id: r.id,
      type: "TASK",
      key: boardKey ? `${boardKey}-${r.taskNumber}` : `#${r.taskNumber}`,
      label: r.title,
      url: `/projects/${projectId}/scrum?task=${r.id}`,
      meta: r.status ?? null,
    }),
  },
  SUBTASK: {
    label: "Subtask",
    model: "subtask",
    // No projectId of its own — scoped through the parent task.
    projectScope: (projectId) => ({ task: { projectId } }),
    select: {
      id: true,
      title: true,
      completed: true,
      taskId: true,
      task: { select: { taskNumber: true } },
    },
    searchFields: ["title"],
    toEntity: (r, { projectId, boardKey }) => ({
      id: r.id,
      type: "SUBTASK",
      // Subtasks have no key of their own; hang them off the parent story.
      key: boardKey && r.task ? `${boardKey}-${r.task.taskNumber}` : "SUBTASK",
      label: r.title,
      // They have no page of their own either — open the parent task's drawer.
      url: `/projects/${projectId}/scrum?task=${r.taskId}`,
      meta: r.completed ? "Done" : "Open",
    }),
  },
  BUG_REPORT: {
    label: "Bug",
    model: "bugReport",
    select: { id: true, bugKey: true, title: true, status: true, severity: true },
    searchFields: ["title", "bugKey"],
    toEntity: (r, { projectId }) => ({
      id: r.id,
      type: "BUG_REPORT",
      key: r.bugKey || `BUG-${shortId(r.id)}`,
      label: r.title,
      url: `/projects/${projectId}/bug-reports?bugId=${r.id}`,
      meta: r.status ?? null,
    }),
  },
  TEST_CASE: {
    label: "Test case",
    model: "testCase",
    // TestCase has no `status`; its execution outcome lives on `lastStatus`.
    select: { id: true, title: true, lastStatus: true },
    searchFields: ["title"],
    toEntity: (r, { projectId }) => ({
      id: r.id,
      type: "TEST_CASE",
      key: `TC-${shortId(r.id)}`,
      label: r.title,
      url: `/projects/${projectId}/test-cases?case=${r.id}`,
      meta: r.lastStatus ?? null,
    }),
  },
  TEST_RUN: {
    label: "Test run",
    model: "testRun",
    select: { id: true, status: true, createdAt: true },
    // Runs have no title; the autocomplete matches on id prefix instead.
    searchFields: ["id"],
    toEntity: (r, { projectId }) => ({
      id: r.id,
      type: "TEST_RUN",
      key: `RUN-${shortId(r.id)}`,
      label: `Test run ${shortId(r.id)}`,
      url: `/projects/${projectId}/test-runs/${r.id}`,
      meta: r.status ?? null,
    }),
  },
  BRD_DOCUMENT: {
    label: "BRD",
    model: "brdDocument",
    select: { id: true, name: true, status: true, isDeleted: true },
    searchFields: ["name"],
    toEntity: (r, { projectId }) => ({
      id: r.id,
      type: "BRD_DOCUMENT",
      key: "BRD",
      label: r.name,
      url: `/projects/${projectId}/brds/${r.id}`,
      meta: r.status ?? null,
    }),
  },
  REQUIREMENT: {
    label: "Requirement",
    model: "requirement",
    select: { id: true, requirementKey: true, title: true, status: true },
    searchFields: ["title", "requirementKey"],
    toEntity: (r, { projectId }) => ({
      id: r.id,
      type: "REQUIREMENT",
      key: r.requirementKey || `REQ-${shortId(r.id)}`,
      label: r.title,
      url: `/projects/${projectId}/requirements/${r.id}`,
      meta: r.status ?? null,
    }),
  },
  SPRINT: {
    label: "Sprint",
    // The Scrum Board's sprints (the old Requirement board is gone).
    model: "scrumSprint",
    select: { id: true, name: true, status: true },
    searchFields: ["name"],
    toEntity: (r, { projectId }) => ({
      id: r.id,
      type: "SPRINT",
      key: "SPRINT",
      label: r.name,
      url: `/projects/${projectId}/scrum?view=backlog`,
      meta: r.status ?? null,
    }),
  },
  EPIC: {
    label: "Epic",
    model: "scrumEpic",
    select: { id: true, title: true },
    searchFields: ["title"],
    toEntity: (r, { projectId }) => ({
      id: r.id,
      type: "EPIC",
      key: "EPIC",
      label: r.title,
      url: `/projects/${projectId}/scrum?view=backlog&epic=${r.id}`,
      meta: null,
    }),
  },
  MANUAL_TEST_SESSION: {
    label: "Manual session",
    model: "manualTestSession",
    select: { id: true, name: true, status: true },
    searchFields: ["name"],
    // No createdAt on this model.
    orderField: "startedAt",
    toEntity: (r, { projectId }) => ({
      id: r.id,
      type: "MANUAL_TEST_SESSION",
      key: "SESSION",
      label: r.name,
      url: `/projects/${projectId}/manual-sessions/${r.id}`,
      meta: r.status ?? null,
    }),
  },
}

function delegate(type: LinkableEntityType) {
  return (prisma as any)[ENTITY_CONFIG[type].model]
}

/** Project scoping — per type, since not every model carries a projectId. */
function projectWhere(type: LinkableEntityType, projectId: string) {
  const scope = ENTITY_CONFIG[type].projectScope
  return scope ? scope(projectId) : { projectId }
}

/** Extra constraints so deleted/hidden rows are never linkable. */
function visibilityWhere(type: LinkableEntityType) {
  return type === "BRD_DOCUMENT" ? { isDeleted: false } : {}
}

/**
 * Confirm an entity exists and belongs to the project. Used before creating a
 * link so we never persist a dangling reference.
 */
export async function entityExists(
  projectId: string,
  type: LinkableEntityType,
  id: string
): Promise<boolean> {
  const row = await delegate(type).findFirst({
    where: { id, ...projectWhere(type, projectId), ...visibilityWhere(type) },
    select: { id: true },
  })
  return !!row
}

/**
 * Hydrate a set of entity ids of one type into display shape. Ids that no
 * longer exist are simply absent from the result — callers surface those as
 * deleted rather than failing the whole request.
 */
export async function resolveEntities(
  projectId: string,
  type: LinkableEntityType,
  ids: string[],
  boardKey: string | null
): Promise<ResolvedEntity[]> {
  if (ids.length === 0) return []
  const cfg = ENTITY_CONFIG[type]
  const rows = await delegate(type).findMany({
    where: { id: { in: ids }, ...projectWhere(type, projectId), ...visibilityWhere(type) },
    select: cfg.select,
  })
  return rows.map((r: any) => cfg.toEntity(r, { projectId, boardKey }))
}

/**
 * Autocomplete across every linkable type in a project.
 *
 * Queries each requested type in parallel and interleaves the results, so one
 * type with many matches can't crowd the others out of the limit.
 */
export async function searchLinkables(
  projectId: string,
  query: string,
  types: LinkableEntityType[],
  limit = 20
): Promise<ResolvedEntity[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { boardKey: true },
  })
  const boardKey = project?.boardKey ?? null
  const q = query.trim()

  // Per type, take enough to fill the limit on its own if it's the only match.
  const perType = Math.max(5, Math.ceil(limit / Math.max(types.length, 1)) * 2)

  const groups = await Promise.all(
    types.map(async (type) => {
      const cfg = ENTITY_CONFIG[type]
      const where: any = { ...projectWhere(type, projectId), ...visibilityWhere(type) }
      if (q) {
        where.OR = cfg.searchFields.map((f) =>
          // Ids are opaque, so a prefix match is the only sensible search.
          f === "id"
            ? { id: { startsWith: q, mode: "insensitive" } }
            : { [f]: { contains: q, mode: "insensitive" } }
        )
      }
      try {
        const rows = await delegate(type).findMany({
          where,
          select: cfg.select,
          take: perType,
          orderBy: { [cfg.orderField ?? "createdAt"]: "desc" },
        })
        return rows.map((r: any) => cfg.toEntity(r, { projectId, boardKey }))
      } catch (err) {
        // A single misbehaving type shouldn't blank the whole picker.
        console.error(`searchLinkables(${type}) failed:`, err)
        return [] as ResolvedEntity[]
      }
    })
  )

  // Round-robin so every type gets representation within the limit.
  const out: ResolvedEntity[] = []
  for (let i = 0; out.length < limit; i++) {
    let addedThisRound = false
    for (const g of groups) {
      if (g[i]) {
        out.push(g[i])
        addedThisRound = true
        if (out.length >= limit) break
      }
    }
    if (!addedThisRound) break
  }
  return out
}

/**
 * Every link touching an entity, from either end, hydrated and grouped by the
 * type at the *other* end.
 *
 * Links are stored one-directional but mean the same thing both ways, so a link
 * created on a task appears on the bug automatically. When the entity is the
 * target, the relation label is inverted so it still reads correctly.
 */
export async function getLinksForEntity(
  projectId: string,
  entityId: string,
  entityType: LinkableEntityType
) {
  const [links, project] = await Promise.all([
    prisma.entityLink.findMany({
      where: {
        projectId,
        OR: [
          { sourceId: entityId, sourceType: entityType },
          { targetId: entityId, targetType: entityType },
        ],
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { boardKey: true } }),
  ])
  const boardKey = project?.boardKey ?? null

  // Which end is "the other one" for each link.
  const far = links.map((l) => {
    const isSource = l.sourceId === entityId && l.sourceType === entityType
    return {
      linkId: l.id,
      relation: isSource
        ? l.relationLabel || DEFAULT_RELATION
        : inverseRelation(l.relationLabel),
      id: isSource ? l.targetId : l.sourceId,
      type: isSource ? l.targetType : l.sourceType,
      createdAt: l.createdAt,
    }
  })

  // Resolve one query per distinct type rather than per link.
  const byType = new Map<LinkableEntityType, string[]>()
  for (const f of far) {
    byType.set(f.type, [...(byType.get(f.type) ?? []), f.id])
  }
  const resolved = new Map<string, ResolvedEntity>()
  await Promise.all(
    Array.from(byType.entries()).map(async ([type, ids]) => {
      const entities = await resolveEntities(projectId, type, ids, boardKey)
      for (const e of entities) resolved.set(`${type}:${e.id}`, e)
    })
  )

  const groups: Record<string, any[]> = {}
  for (const f of far) {
    const entity = resolved.get(`${f.type}:${f.id}`)
    const group = (groups[f.type] ??= [])
    group.push({
      linkId: f.linkId,
      relation: f.relation,
      createdAt: f.createdAt,
      // A missing entity means it was deleted after the link was made; keep the
      // row so the stale link is visible and removable rather than vanishing.
      deleted: !entity,
      entity: entity ?? {
        id: f.id,
        type: f.type,
        key: ENTITY_CONFIG[f.type]?.label ?? f.type,
        label: "Deleted item",
        url: "",
        meta: null,
      },
    })
  }

  return { total: far.length, groups }
}
