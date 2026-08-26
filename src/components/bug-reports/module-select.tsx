"use client"

import { useEffect, useMemo, useState } from "react"

/**
 * Picker for the module/service a bug belongs to.
 *
 * Modules are the project's test suites — the same tree the test library files
 * cases under — so a defect and the cases that cover it end up under the same
 * heading in the QA report. Nested suites are shown with their parent path
 * ("Housing › Emergency"), because two sibling trees often contain a suite
 * called "Reports" and a bare name would make them indistinguishable.
 */

export interface ProjectModule {
  id: string
  name: string
  /** Full path from the root, e.g. "Housing › Emergency". */
  path: string
  parentId: string | null
  depth: number
  caseCount: number
}

interface SuiteRow {
  id: string
  parentId: string | null
  name: string
  orderIndex: number
  caseCount: number
}

/** Flatten the suite tree depth-first so the dropdown reads like the library. */
function flatten(rows: SuiteRow[]): ProjectModule[] {
  const byParent = new Map<string | null, SuiteRow[]>()
  for (const row of rows) {
    const key = row.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(row)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name))
  }

  const out: ProjectModule[] = []
  const seen = new Set<string>()
  const walk = (parentId: string | null, depth: number, prefix: string) => {
    for (const row of byParent.get(parentId) || []) {
      // A cycle would otherwise hang the browser; a suite tree should never
      // have one, but this reads a server response, not a proof.
      if (seen.has(row.id)) continue
      seen.add(row.id)
      const path = prefix ? `${prefix} › ${row.name}` : row.name
      out.push({ id: row.id, name: row.name, path, parentId: row.parentId, depth, caseCount: row.caseCount })
      walk(row.id, depth + 1, path)
    }
  }
  walk(null, 0, "")

  // Anything orphaned (parent deleted mid-flight) still deserves to be listed.
  for (const row of rows) {
    if (!seen.has(row.id)) {
      out.push({ id: row.id, name: row.name, path: row.name, parentId: null, depth: 0, caseCount: row.caseCount })
    }
  }
  return out
}

/** Shared loader — one fetch per project, reused by every module dropdown. */
export function useProjectModules(projectId: string, enabled = true) {
  const [rows, setRows] = useState<SuiteRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !projectId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/projects/${projectId}/test-suites`)
      .then(res => (res.ok ? res.json() : { suites: [] }))
      .then(data => {
        if (cancelled) return
        setRows(
          (data.suites || []).map((s: any) => ({
            id: s.id,
            parentId: s.parentId ?? null,
            name: s.name,
            orderIndex: s.orderIndex ?? 0,
            caseCount: s.caseCount ?? 0
          }))
        )
      })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId, enabled])

  const modules = useMemo(() => flatten(rows), [rows])
  return { modules, loading }
}

interface Props {
  projectId: string
  /** "" means Unfiled. */
  value: string
  onChange: (_suiteId: string) => void
  className?: string
  /** Label for the empty option; defaults to the Unfiled wording. */
  placeholder?: string
  disabled?: boolean
  /** Skip fetching until the containing panel is actually open. */
  enabled?: boolean
}

export function ModuleSelect({
  projectId,
  value,
  onChange,
  className,
  placeholder = "— Unfiled —",
  disabled,
  enabled = true
}: Props) {
  const { modules, loading } = useProjectModules(projectId, enabled)

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={className || "h-9 w-full rounded-lg border bg-background px-3"}
    >
      <option value="">{placeholder}</option>
      {modules.map(m => (
        <option key={m.id} value={m.id}>
          {m.path}
        </option>
      ))}
      {/* A value pointing at a suite that no longer exists would otherwise make
          the select silently show "Unfiled" and save that on the next edit. */}
      {value && !loading && !modules.some(m => m.id === value) && (
        <option value={value}>Module no longer exists</option>
      )}
    </select>
  )
}
