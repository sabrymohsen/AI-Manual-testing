"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Bug,
  CheckSquare,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Layers,
  Link2,
  Loader2,
  PlayCircle,
  Plus,
  Search,
  Target,
  Timer,
  X,
} from "@/components/ui/icons"

/** Keep in sync with LinkableEntityType in prisma/schema.prisma. */
export type LinkableEntityType =
  | "TASK"
  | "SUBTASK"
  | "BUG_REPORT"
  | "TEST_CASE"
  | "TEST_RUN"
  | "BRD_DOCUMENT"
  | "REQUIREMENT"
  | "SPRINT"
  | "EPIC"
  | "MANUAL_TEST_SESSION"

const RELATION_LABELS = [
  "relates to",
  "blocks",
  "is blocked by",
  "verifies",
  "is verified by",
  "documents",
] as const

export const ENTITY_META: Record<
  LinkableEntityType,
  { label: string; plural: string; icon: any; chip: string }
> = {
  TASK: { label: "Task", plural: "Tasks", icon: CheckSquare, chip: "bg-blue-50 text-blue-700 border-blue-200" },
  SUBTASK: { label: "Subtask", plural: "Subtasks", icon: CheckSquare, chip: "bg-sky-50 text-sky-700 border-sky-200" },
  BUG_REPORT: { label: "Bug", plural: "Bugs", icon: Bug, chip: "bg-red-50 text-red-700 border-red-200" },
  TEST_CASE: { label: "Test case", plural: "Test cases", icon: FileText, chip: "bg-violet-50 text-violet-700 border-violet-200" },
  TEST_RUN: { label: "Test run", plural: "Test runs", icon: PlayCircle, chip: "bg-amber-50 text-amber-700 border-amber-200" },
  BRD_DOCUMENT: { label: "BRD", plural: "BRDs", icon: FileSpreadsheet, chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REQUIREMENT: { label: "Requirement", plural: "Requirements", icon: Target, chip: "bg-primary/10 text-primary border-primary/25" },
  SPRINT: { label: "Sprint", plural: "Sprints", icon: Timer, chip: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  EPIC: { label: "Epic", plural: "Epics", icon: Layers, chip: "bg-purple-50 text-purple-700 border-purple-200" },
  MANUAL_TEST_SESSION: { label: "Manual session", plural: "Manual sessions", icon: PlayCircle, chip: "bg-muted text-foreground border-border" },
}

type ResolvedEntity = {
  id: string
  type: LinkableEntityType
  key: string
  label: string
  url: string
  meta?: string | null
}

type LinkRow = {
  linkId: string
  relation: string
  createdAt: string
  deleted: boolean
  entity: ResolvedEntity
}

/**
 * "Linked items" section, shared by the task drawer, bug detail, test case
 * detail and BRD viewer.
 *
 * Links are stored once and read from both ends, so anything linked here shows
 * up on the other entity automatically.
 */
export function LinkedEntities({
  projectId,
  entityId,
  entityType,
  /** Types offered in the picker. Defaults to everything except this entity's own type. */
  linkableTypes,
  readOnly = false,
  className = "",
}: {
  projectId: string
  entityId: string
  entityType: LinkableEntityType
  linkableTypes?: LinkableEntityType[]
  readOnly?: boolean
  className?: string
}) {
  const [groups, setGroups] = useState<Record<string, LinkRow[]>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<ResolvedEntity[]>([])
  const [searching, setSearching] = useState(false)
  const [relation, setRelation] = useState<string>("relates to")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const types = useMemo(
    () => linkableTypes ?? (Object.keys(ENTITY_META) as LinkableEntityType[]),
    [linkableTypes]
  )

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/entity-links?entityId=${encodeURIComponent(entityId)}&entityType=${entityType}`
      )
      if (res.ok) {
        const d = await res.json()
        setGroups(d.groups || {})
        setTotal(d.total || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, entityId, entityType])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Debounced search while the picker is open.
  useEffect(() => {
    if (!adding) return
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/linkables?q=${encodeURIComponent(q)}&types=${types.join(",")}`
        )
        if (res.ok && !cancelled) {
          const d = await res.json()
          // Never offer the entity we're already looking at.
          setResults(
            (d.results || []).filter(
              (r: ResolvedEntity) => !(r.id === entityId && r.type === entityType)
            )
          )
        }
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [adding, q, projectId, types, entityId, entityType])

  // Close the picker on outside click.
  useEffect(() => {
    if (!adding) return
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAdding(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [adding])

  async function createLink(target: ResolvedEntity) {
    setPendingId(target.id)
    try {
      const res = await fetch(`/api/projects/${projectId}/entity-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: entityId,
          sourceType: entityType,
          targetId: target.id,
          targetType: target.type,
          relationLabel: relation,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Linked ${target.key}`)
        setQ("")
        setAdding(false)
        load()
      } else {
        toast.error(d?.error || "Could not create the link")
      }
    } catch {
      toast.error("Could not create the link")
    } finally {
      setPendingId(null)
    }
  }

  async function removeLink(linkId: string) {
    // Optimistic: drop it locally, restore by refetching if the server refuses.
    const snapshot = groups
    setGroups((g) => {
      const next: Record<string, LinkRow[]> = {}
      for (const [k, rows] of Object.entries(g)) {
        const kept = rows.filter((r) => r.linkId !== linkId)
        if (kept.length) next[k] = kept
      }
      return next
    })
    setTotal((t) => Math.max(0, t - 1))
    const res = await fetch(`/api/entity-links/${linkId}`, { method: "DELETE" })
    if (!res.ok) {
      setGroups(snapshot)
      toast.error("Could not remove the link")
      load()
    }
  }

  const orderedGroups = useMemo(
    () =>
      (Object.keys(ENTITY_META) as LinkableEntityType[])
        .filter((t) => groups[t]?.length)
        .map((t) => [t, groups[t]] as const),
    [groups]
  )

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          Linked items
          {total > 0 && (
            <span className="rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
              {total}
            </span>
          )}
        </h4>
        {!readOnly && (
          <button
            onClick={() => setAdding((a) => !a)}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Add link
          </button>
        )}
      </div>

      {adding && (
        <div ref={boxRef} className="rounded-lg border bg-card p-2 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              className="h-8 shrink-0 rounded-md border bg-background px-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
              aria-label="Relationship"
            >
              {RELATION_LABELS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search tasks, bugs, test cases, BRDs…"
                className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {searching && (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <BusyDot /> Searching…
              </div>
            )}
            {!searching && results.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">No matching items.</p>
            )}
            {!searching &&
              results.map((r) => {
                const Meta = ENTITY_META[r.type]
                const Icon = Meta?.icon ?? Link2
                return (
                  <button
                    key={`${r.type}:${r.id}`}
                    onClick={() => createLink(r)}
                    disabled={pendingId === r.id}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent/50 disabled:opacity-50"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span
                      className={`shrink-0 rounded border px-1 py-0.5 text-xs font-semibold ${Meta?.chip ?? ""}`}
                    >
                      {r.key}
                    </span>
                    <span className="truncate">{r.label}</span>
                    {pendingId === r.id && <BusyDot />}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading links…</p>
      ) : total === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          Nothing linked yet.
        </p>
      ) : (
        <div className="space-y-3">
          {orderedGroups.map(([type, rows]) => {
            const Meta = ENTITY_META[type]
            const Icon = Meta?.icon ?? Link2
            return (
              <div key={type}>
                <p className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground/70">
                  <Icon className="h-3 w-3" />
                  {Meta?.plural ?? type} ({rows.length})
                </p>
                <ul className="space-y-1">
                  {rows.map((row) => (
                    <li
                      key={row.linkId}
                      className="group flex items-center gap-2 rounded-md border bg-card px-2 py-2 text-xs"
                    >
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {row.relation}
                      </span>
                      <span
                        className={`shrink-0 rounded border px-1 py-0.5 text-xs font-semibold ${Meta?.chip ?? ""}`}
                      >
                        {row.entity.key}
                      </span>
                      {row.deleted ? (
                        <span className="truncate text-muted-foreground">Deleted item</span>
                      ) : (
                        <Link
                          href={row.entity.url}
                          className="truncate font-medium hover:text-primary hover:underline"
                        >
                          {row.entity.label}
                        </Link>
                      )}
                      {row.entity.meta && (
                        <span className="ml-auto shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {row.entity.meta}
                        </span>
                      )}
                      {!row.deleted && (
                        <Link
                          href={row.entity.url}
                          className={`shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100 ${
                            row.entity.meta ? "" : "ml-auto"
                          }`}
                          aria-label="Open"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                      {!readOnly && (
                        <button
                          onClick={() => removeLink(row.linkId)}
                          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label="Remove link"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
