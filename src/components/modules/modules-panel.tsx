"use client"

import { BusyDot } from "@/components/ui/skeleton"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Layers,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Bug,
  FileText,
  Loader2,
  Link2,
  ExternalLink,
  DownloadCloud,
  RefreshCw,
} from "@/components/ui/icons"

/**
 * Manage the project's modules.
 *
 * A "module" here is a TestSuite — the same object the test library files cases
 * under, the bug list filters by, and the QA report groups its sections around.
 * Deliberately ONE concept: this tab used to render a separate Module → Feature
 * → Component tree from an endpoint that never existed, so it always read "No
 * modules defined" while the modules that actually drive the app were only
 * editable from the test library.
 *
 * Everything here is a thin client over the existing suite routes, so a module
 * renamed on this page is renamed everywhere at once — there is no second copy
 * to fall out of step.
 */

export interface ModuleRow {
  id: string
  parentId: string | null
  name: string
  description: string | null
  orderIndex: number
  caseCount: number
  passedCount: number
  failedCount: number
  bugCount: number
  openBugCount: number
  // Set when this module was imported from the tracker's Epic/Feature.
  externalProvider: string | null
  externalId: string | null
  externalType: string | null
  externalUrl: string | null
}

interface ImportableModule {
  externalId: string
  title: string
  type: string | null
  url: string
  parentExternalId: string | null
  linkedSuiteId: string | null
  linkedSuiteName: string | null
}

interface DeleteImpact {
  id: string
  name: string
  suitesRemoved: number
  casesUnfiled: number
  bugsUnfiled: number
  visualTestsUnfiled?: number
}

interface Props {
  projectId: string
  /** May add, rename, move and re-nest modules (canCreateStories). Default true. */
  canEdit?: boolean
  /** May delete modules (canDeleteStories). Default true. */
  canDelete?: boolean
}

/** Depth-first order with a depth for indentation, matching the library tree. */
function flatten(rows: ModuleRow[]): Array<ModuleRow & { depth: number }> {
  const byParent = new Map<string | null, ModuleRow[]>()
  for (const row of rows) {
    const key = row.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(row)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name))
  }

  const out: Array<ModuleRow & { depth: number }> = []
  const seen = new Set<string>()
  const walk = (parentId: string | null, depth: number) => {
    for (const row of byParent.get(parentId) || []) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      out.push({ ...row, depth })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 0)
  // A row whose parent was deleted mid-flight still belongs on screen.
  for (const row of rows) if (!seen.has(row.id)) out.push({ ...row, depth: 0 })
  return out
}

export function ModulesPanel({ projectId, canEdit = true, canDelete = true }: Props) {
  const router = useRouter()

  const [rows, setRows] = useState<ModuleRow[]>([])
  const [unfiledCount, setUnfiledCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [newName, setNewName] = useState("")
  const [newParentId, setNewParentId] = useState("")
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const [deleteTarget, setDeleteTarget] = useState<DeleteImpact | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Import from the project's tracker ──────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false)
  const [importable, setImportable] = useState<ImportableModule[]>([])
  const [provider, setProvider] = useState<string | null>(null)
  const [importUnavailable, setImportUnavailable] = useState<string | null>(null)
  const [loadingImportable, setLoadingImportable] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-suites`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not load modules")
      setRows(data.suites || [])
      setUnfiledCount(data.unfiledCount || 0)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  /**
   * Bring linked modules back in step with the tracker, then re-read the list.
   *
   * Runs once when the panel opens and on demand. Deliberately silent when
   * there is no integration or nothing linked: a project that never imported a
   * module should see no trace of this.
   */
  const refreshLinked = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/test-suites/external`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh" }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Refresh failed")
        if (data.updated > 0) await load()
        if (!opts.silent) {
          setImportNote(
            data.skipped
              ? "Nothing linked to the tracker yet."
              : `Checked ${data.checked} linked module(s): ${data.updated} updated` +
                (data.missing ? `, ${data.missing} no longer in the tracker` : "") + "."
          )
        }
      } catch (err: any) {
        if (!opts.silent) setImportNote(err.message)
      }
    },
    [projectId, load]
  )

  useEffect(() => {
    refreshLinked({ silent: true })
    // Once per project: a linked module's name is not worth a poll of its own,
    // and the import picker re-reads the tracker whenever it opens.
  }, [refreshLinked])

  const openImport = useCallback(async () => {
    setImportOpen(true)
    setImportNote(null)
    setPicked(new Set())
    setLoadingImportable(true)
    setImportUnavailable(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-suites/external`)
      const data = await res.json().catch(() => ({}))
      setProvider(data.provider ?? null)
      if (!res.ok) throw new Error(data.error || "Could not reach the tracker")
      if (data.unavailable === "no-integration") {
        setImportUnavailable("This project is not connected to a management tool yet.")
      } else if (data.unavailable === "provider-unsupported") {
        setImportUnavailable(`${data.provider} does not expose Epics or Features.`)
      } else if ((data.items || []).length === 0) {
        setImportUnavailable("No Epics or Features found in the tracker.")
      }
      setImportable(data.items || [])
    } catch (err: any) {
      setImportUnavailable(err.message)
      setImportable([])
    } finally {
      setLoadingImportable(false)
    }
  }, [projectId])

  async function runImport() {
    if (picked.size === 0) return
    setImporting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-suites/external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", externalIds: Array.from(picked) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) throw new Error(data.error || "Import failed")
      await load()
      setImportOpen(false)
      setImportNote(
        `Imported ${data.created} new module(s)` +
          (data.linked ? `, linked ${data.linked} existing` : "") +
          (data.skipped ? `, ${data.skipped} already linked` : "") + "."
      )
    } catch (err: any) {
      setImportUnavailable(err.message)
    } finally {
      setImporting(false)
    }
  }

  /** Epics already imported are shown, but cannot be picked again. */
  const importableCount = useMemo(
    () => importable.filter(i => !i.linkedSuiteId).length,
    [importable]
  )

  const ordered = useMemo(() => flatten(rows), [rows])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          cases: acc.cases + r.caseCount,
          bugs: acc.bugs + r.bugCount,
          openBugs: acc.openBugs + r.openBugCount,
        }),
        { cases: 0, bugs: 0, openBugs: 0 }
      ),
    [rows]
  )

  async function patchModule(id: string, body: Record<string, unknown>) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-suites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Update failed")
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function createModule() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-suites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parentId: newParentId || null,
          // Appended, not inserted: a new module should not renumber the others.
          orderIndex: rows.filter(r => (r.parentId ?? "") === newParentId).length,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not create the module")
      setNewName("")
      setNewParentId("")
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  /**
   * Move this module one place up or down among its own siblings.
   *
   * Renumbers the whole sibling list 0..n-1 rather than swapping two values.
   * orderIndex has no unique constraint and defaults to 0, so suites created by
   * the backfill or by other code paths routinely share the same index — a
   * two-row swap between two zeroes writes nothing and the arrows look broken.
   * Renumbering also repairs those duplicates the first time anyone touches the
   * list. Only rows whose index actually changes are written.
   */
  async function move(row: ModuleRow, direction: -1 | 1) {
    const siblings = rows
      .filter(r => (r.parentId ?? null) === (row.parentId ?? null))
      .sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name))

    const index = siblings.findIndex(r => r.id === row.id)
    const target = index + direction
    if (index === -1 || target < 0 || target >= siblings.length) return

    const reordered = [...siblings]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)

    setBusyId(row.id)
    try {
      const writes = reordered
        .map((sibling, position) => ({ sibling, position }))
        .filter(({ sibling, position }) => sibling.orderIndex !== position)
        .map(({ sibling, position }) =>
          fetch(`/api/projects/${projectId}/test-suites/${sibling.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderIndex: position }),
          })
        )
      const results = await Promise.all(writes)
      if (results.some(r => !r.ok)) throw new Error("Some modules could not be reordered")
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Modules this row may be moved inside: everything except itself and its own
   * descendants. The server refuses a cycle anyway, but offering a choice that
   * can only fail is a worse way to learn the rule.
   */
  function reparentOptions(rowId: string) {
    const descendants = new Set<string>([rowId])
    let grew = true
    while (grew) {
      grew = false
      for (const r of rows) {
        if (r.parentId && descendants.has(r.parentId) && !descendants.has(r.id)) {
          descendants.add(r.id)
          grew = true
        }
      }
    }
    return ordered.filter(m => !descendants.has(m.id))
  }

  /** Read the true blast radius from the server before offering to delete. */
  async function askDelete(row: ModuleRow) {
    setBusyId(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-suites/${row.id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not read the module")
      setDeleteTarget(data as DeleteImpact)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/test-suites/${deleteTarget.id}`, {
        method: "DELETE",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Delete failed")
      setDeleteTarget(null)
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const passRate = (row: ModuleRow) =>
    row.caseCount > 0 ? Math.round((row.passedCount / row.caseCount) * 100) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" /> Modules
          </h2>
          <p className="text-xs text-muted-foreground font-medium max-w-xl leading-relaxed">
            The modules test cases are filed under and defects are reported against. Renaming one
            here renames it in the test library, the bug list and the QA report — there is only one
            of each.
          </p>
        </div>
        <div className="flex items-center gap-3 text-center">
          {canEdit && <div className="flex flex-col gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={openImport}>
              <DownloadCloud className="h-3.5 w-3.5 mr-2" />
              Import from tracker
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => refreshLinked()}
              title="Re-read the names and nesting of modules linked to the tracker"
            >
              <RefreshCw className="h-3 w-3 mr-2" />
              Refresh linked
            </Button>
          </div>}
          {[
            { label: "Modules", value: rows.length },
            // Only cases filed under a module; unfiled ones are counted in the note below.
            { label: "Filed cases", value: totals.cases },
            { label: "Open bugs", value: totals.openBugs },
          ].map(c => (
            <div key={c.label} className="px-3 py-2 rounded-xl border border-border bg-muted/60 min-w-[76px]">
              <div className="text-xs font-medium text-muted-foreground/60">
                {c.label}
              </div>
              <div className="text-base font-semibold text-foreground">{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {importNote && (
        <div className="flex items-start justify-between gap-2 p-3 rounded-xl bg-primary/10 border border-primary/25 text-xs text-primary font-semibold">
          <span className="flex items-start gap-2">
            <Link2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {importNote}
          </span>
          <button onClick={() => setImportNote(null)} className="text-indigo-400 hover:text-primary">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Add */}
      {canEdit ? (
      <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border border-border bg-muted/40">
        <div className="space-y-1 flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground/60">
            New module
          </label>
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") createModule()
            }}
            placeholder="e.g. Temporary Housing"
            className="h-9 text-xs bg-background"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground/60">
            Inside
          </label>
          <select
            value={newParentId}
            onChange={e => setNewParentId(e.target.value)}
            className="h-9 px-3 rounded-lg border text-xs bg-background outline-none min-w-[160px] max-w-[240px]"
          >
            <option value="">— Top level —</option>
            {ordered.map(m => (
              <option key={m.id} value={m.id}>
                {" ".repeat(m.depth * 2)}
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={createModule}
          disabled={creating || !newName.trim()}
          size="sm"
          className="h-9 text-xs font-semibold"
        >
          <Plus className="h-3.5 w-3.5 mr-2" /> Add module
        </Button>
      </div>
      ) : (
        <p className="text-xs text-muted-foreground">You can view modules. Ask a project admin to add or change them.</p>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground font-semibold">
          <BusyDot /> Loading modules…
        </div>
      ) : ordered.length === 0 ? (
        <div className="p-10 border border-dashed rounded-xl text-center space-y-1">
          <p className="text-xs font-semibold text-foreground">No modules yet</p>
          <p className="text-xs text-muted-foreground font-medium">
            Add one above, and it becomes available when filing test cases and bugs.
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                {["Module", "Test cases", "Pass %", "Bugs", "Open", "Order", ""].map(h => (
                  <th
                    key={h}
                    className="px-3 py-2 font-medium text-xs text-muted-foreground/70 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map(row => {
                const rate = passRate(row)
                const isBusy = busyId === row.id
                return (
                  <tr key={row.id} className="border-t hover:bg-muted/50">
                    <td className="px-3 py-2 min-w-[220px]">
                      {editingId === row.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter" && editName.trim()) {
                                patchModule(row.id, { name: editName.trim() })
                                setEditingId(null)
                              }
                              if (e.key === "Escape") setEditingId(null)
                            }}
                            autoFocus
                            className="h-7 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-emerald-600"
                            disabled={!editName.trim()}
                            onClick={() => {
                              patchModule(row.id, { name: editName.trim() })
                              setEditingId(null)
                            }}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-2 font-semibold text-foreground"
                          style={{ paddingInlineStart: row.depth * 16 }}
                        >
                          {row.depth > 0 && <span className="text-slate-300">└</span>}
                          <span dir="auto" className="truncate">{row.name}</span>
                          {row.externalId && (
                            <a
                              href={row.externalUrl || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => { if (!row.externalUrl) e.preventDefault() }}
                              title={`${row.externalType || "Linked"} ${row.externalId} in ${row.externalProvider} — name and nesting follow the tracker`}
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/25 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/15"
                            >
                              <Link2 className="h-2.5 w-2.5" />
                              {row.externalType || "Linked"}
                              <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                            </a>
                          )}
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              title="Rename"
                              onClick={() => {
                                setEditingId(row.id)
                                setEditName(row.name)
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {row.caseCount > 0 ? (
                        <button
                          onClick={() => router.push(`/projects/${projectId}/test-cases?suite=${row.id}`)}
                          className="flex items-center gap-1 font-semibold text-primary hover:underline"
                          title="Open these test cases"
                        >
                          <FileText className="h-3 w-3" /> {row.caseCount}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {rate === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={`font-semibold ${
                            rate >= 90 ? "text-emerald-600" : rate >= 60 ? "text-amber-600" : "text-rose-600"
                          }`}
                        >
                          {rate}%
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {row.bugCount > 0 ? (
                        <button
                          onClick={() => router.push(`/projects/${projectId}/bug-reports?suite=${row.id}`)}
                          className="flex items-center gap-1 font-semibold text-primary hover:underline"
                          title="Open these bugs"
                        >
                          <Bug className="h-3 w-3" /> {row.bugCount}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <span className={row.openBugCount > 0 ? "font-semibold text-rose-600" : "text-muted-foreground"}>
                        {row.openBugCount}
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      {canEdit && <div className="flex items-center gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => move(row, -1)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          title="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => move(row, 1)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          title="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>}
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        {canEdit && <select
                          value={row.parentId || ""}
                          disabled={isBusy}
                          onChange={e => patchModule(row.id, { parentId: e.target.value || null })}
                          className="h-7 px-2 rounded-md border text-xs bg-background outline-none max-w-[150px]"
                          title="Move this module inside another"
                        >
                          <option value="">Top level</option>
                          {reparentOptions(row.id).map(m => (
                            <option key={m.id} value={m.id}>
                              {" ".repeat(m.depth * 2)}
                              {m.name}
                            </option>
                          ))}
                        </select>}
                        {canDelete && <Button
                          size="sm"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => askDelete(row)}
                          className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                          title="Delete this module"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {unfiledCount > 0 && (
        <p className="text-xs text-muted-foreground font-medium">
          {unfiledCount} test case{unfiledCount === 1 ? "" : "s"} in this project {unfiledCount === 1 ? "is" : "are"}{" "}
          not filed under any module. They show as “Unfiled” in the test library and the QA report.
        </p>
      )}

      {/* Import picker — Epics and Features only, never Stories or Tasks. */}
      {importOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-2xl rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <DownloadCloud className="h-4 w-4 text-primary" />
                Import modules{provider ? ` from ${provider}` : ""}
              </h3>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Only <strong>Epics</strong> and <strong>Features</strong> are offered — a module is
                a part of the system under test, so Stories and Tasks are the wrong grain. An
                imported module keeps its name and nesting in step with the tracker; its test cases
                and bugs stay yours.
              </p>
            </div>

            {loadingImportable ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                <BusyDot /> Reading the tracker…
              </div>
            ) : importUnavailable ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 font-medium">
                {importUnavailable}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>
                    {importableCount} available · {importable.length - importableCount} already
                    imported
                  </span>
                  <button
                    className="text-primary hover:underline font-semibold"
                    onClick={() =>
                      setPicked(
                        picked.size === importableCount
                          ? new Set()
                          : new Set(importable.filter(i => !i.linkedSuiteId).map(i => i.externalId))
                      )
                    }
                  >
                    {picked.size === importableCount && importableCount > 0
                      ? "Clear all"
                      : "Select all available"}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto rounded-xl border border-border divide-y">
                  {importable.map(item => {
                    const already = !!item.linkedSuiteId
                    const checked = picked.has(item.externalId)
                    return (
                      <label
                        key={item.externalId}
                        className={`flex items-start gap-3 p-3 text-xs ${
                          already ? "opacity-60" : "hover:bg-muted/70 cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          disabled={already}
                          checked={checked}
                          onChange={() => {
                            const next = new Set(picked)
                            if (next.has(item.externalId)) next.delete(item.externalId)
                            else next.add(item.externalId)
                            setPicked(next)
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground truncate" dir="auto">
                              {item.title}
                            </span>
                            {item.type && (
                              <span className="shrink-0 px-2 py-0.5 rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                                {item.type}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-medium">
                            {item.externalId}
                            {item.parentExternalId && ` · under ${item.parentExternalId}`}
                            {already && ` · already imported as “${item.linkedSuiteName}”`}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImportOpen(false)}
                disabled={importing}
                className="h-8 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={runImport}
                disabled={importing || picked.size === 0}
                className="h-8 text-xs font-semibold"
              >
                {importing ? "Importing…" : `Import ${picked.size || ""}`.trim()}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation — real numbers, read from the server. */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Delete “{deleteTarget.name}”?
                </h3>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                  Nothing is deleted except the module itself. Its test cases and bugs survive and
                  become <strong>Unfiled</strong> — you can file them again afterwards.
                </p>
              </div>
            </div>

            <div className={`grid ${deleteTarget.visualTestsUnfiled ? "grid-cols-4" : "grid-cols-3"} gap-2 text-center`}>
              {[
                { label: "Modules removed", value: deleteTarget.suitesRemoved },
                { label: "Cases unfiled", value: deleteTarget.casesUnfiled },
                { label: "Bugs unfiled", value: deleteTarget.bugsUnfiled },
                ...(deleteTarget.visualTestsUnfiled ? [{ label: "Visual tests unfiled", value: deleteTarget.visualTestsUnfiled }] : []),
              ].map(c => (
                <div key={c.label} className="p-3 rounded-xl border border-border bg-muted/60">
                  <div className="text-xs font-medium text-muted-foreground/60">
                    {c.label}
                  </div>
                  <div className="text-lg font-semibold text-foreground">{c.value}</div>
                </div>
              ))}
            </div>

            {deleteTarget.suitesRemoved > 1 && (
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                This includes {deleteTarget.suitesRemoved - 1} sub-module
                {deleteTarget.suitesRemoved - 1 === 1 ? "" : "s"} nested inside it.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="h-8 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={confirmDelete}
                disabled={deleting}
                className="h-8 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deleting ? "Deleting…" : "Delete module"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
