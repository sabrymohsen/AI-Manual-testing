"use client"

import { useCallback, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { SuiteTree } from "./_components/suite-tree"
import { FacetBar } from "./_components/facet-bar"
import { CaseTable } from "./_components/case-table"
import { DetailPanel } from "./_components/detail-panel"
import { useMoveCases, type LibraryFilters, type SortKey } from "./_hooks/use-test-library"
import { ImportModal } from "@/components/test-cases/import-modal"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { FileSpreadsheet, FlaskConical, FolderInput, Plus, Search, Video, X } from "lucide-react"

/**
 * Test library.
 *
 * This file owns layout and URL state only — roughly 200 lines against the
 * 2,121-line single component it replaces. Data lives in _hooks, presentation
 * in _components, and every filter is applied by the database rather than by
 * downloading the project and filtering in render.
 *
 * Filters live in the URL so a filtered view is shareable and the back button
 * behaves, matching the scrum board.
 */
export default function TestLibraryPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const router = useRouter()
  const search = useSearchParams()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [draggingIds, setDraggingIds] = useState<string[]>([])
  const [importOpen, setImportOpen] = useState(false)

  const qc = useQueryClient()
  const moveCases = useMoveCases(projectId)

  const filters: LibraryFilters = useMemo(
    () => ({
      q: search.get("q") || undefined,
      suite: search.get("suite") || undefined,
      status: (search.get("status")?.split(",").filter(Boolean) as LibraryFilters["status"]) || undefined,
      priority:
        (search.get("priority")?.split(",").filter(Boolean) as LibraryFilters["priority"]) || undefined,
      executionType: (search.get("type") as LibraryFilters["executionType"]) || undefined,
      trace: (search.get("trace") as LibraryFilters["trace"]) || undefined,
      sort: (search.get("sort") as SortKey) || "updatedAt",
      dir: search.get("dir") === "asc" ? "asc" : "desc",
    }),
    [search]
  )

  const activeId = search.get("case")

  const push = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(search.toString())
      mutate(p)
      router.replace(`?${p.toString()}`, { scroll: false })
    },
    [router, search]
  )

  const setFilters = (next: LibraryFilters) =>
    push((p) => {
      const set = (k: string, v?: string) => (v ? p.set(k, v) : p.delete(k))
      set("q", next.q)
      set("suite", next.suite)
      set("status", next.status?.join(","))
      set("priority", next.priority?.join(","))
      set("type", next.executionType)
      set("trace", next.trace)
      set("sort", next.sort)
      set("dir", next.dir)
    })

  const openCase = (id: string) => push((p) => p.set("case", id))
  const closeCase = () => push((p) => p.delete("case"))
  const selectSuite = (suiteId: string | undefined) =>
    push((p) => (suiteId ? p.set("suite", suiteId) : p.delete("suite")))

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const toggleAll = (ids: string[]) =>
    setSelectedIds((prev) => (ids.every((id) => prev.includes(id)) ? [] : ids))

  async function runCase(tc: { id: string; title: string; executionType: string }) {
    try {
      if (tc.executionType === "Manual") {
        const res = await fetch(`/api/projects/${projectId}/manual-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Manual run: ${tc.title}`,
            environment: "Staging",
            browserType: "Chromium",
            viewport: "Desktop",
            keepBrowserSession: true,
            stopOnFailure: false,
            testCaseIds: [tc.id],
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't start the session")
        const session = await res.json()
        // Tell the session where to send us back to. Without this, completing a
        // run dropped you on the project overview instead of the library.
        const returnTo = encodeURIComponent(`/projects/${projectId}/test-cases${window.location.search}`)
        router.push(`/projects/${projectId}/manual-sessions/${session.id}?returnTo=${returnTo}`)
        return
      }

      const res = await fetch(`/api/projects/${projectId}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: tc.id }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't start the run")
      const data = await res.json()
      router.push(`/projects/${projectId}/test-runs/${data.testRun.id}/report`)
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't start the run")
    }
  }

  const hasFilters =
    !!filters.q || !!filters.status?.length || !!filters.trace || !!filters.priority?.length

  return (
    <div className="flex h-full flex-col overflow-hidden bg-muted/20">
      {/* Header */}
      <header className="shrink-0 space-y-3 border-b bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FlaskConical className="h-4 w-4" />
              </span>
              Test library
            </h1>
            <p className="text-xs text-muted-foreground">
              Author, organise and execute this project&apos;s manual and automated tests.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-9 gap-1.5 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/projects/${projectId}/recorder-studio`)}
              className="h-9 gap-1.5 text-xs"
            >
              <Video className="h-3.5 w-3.5 text-rose-500" /> Record
            </Button>
            <Button
              size="sm"
              onClick={() => router.push(`/projects/${projectId}/test-cases/new`)}
              className="h-9 gap-1.5 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" /> New test case
            </Button>
          </div>
        </div>

        <FacetBar projectId={projectId} filters={filters} onChange={setFilters} />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left rail */}
        <aside className="w-64 shrink-0 border-r bg-card">
          <SuiteTree
            projectId={projectId}
            selectedSuite={filters.suite}
            onSelectSuite={selectSuite}
            draggingCaseIds={draggingIds}
          />
        </aside>

        {/* Centre */}
        <main className="flex min-w-0 flex-1 flex-col bg-card">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.q ?? ""}
                onChange={(e) => setFilters({ ...filters, q: e.target.value || undefined })}
                placeholder="Search title or preconditions…"
                className="h-9 w-64 pl-8 text-xs"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent">
                {filters.executionType ?? "All types"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem onClick={() => setFilters({ ...filters, executionType: undefined })}>
                  All types
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilters({ ...filters, executionType: "Manual" })}>
                  Manual
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilters({ ...filters, executionType: "Automated" })}>
                  Automated
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasFilters && (
              <button
                onClick={() =>
                  setFilters({ suite: filters.suite, sort: filters.sort, dir: filters.dir })
                }
                className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}

            {selectedIds.length > 0 && (
              <div className="ml-auto flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1">
                <span className="text-xs font-semibold text-primary">{selectedIds.length} selected</span>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-[11px] font-semibold">
                    <FolderInput className="h-3 w-3" /> Move to
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        moveCases.mutate({ testCaseIds: selectedIds, suiteId: null })
                        setSelectedIds([])
                      }}
                    >
                      Unfiled
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  onClick={() => setSelectedIds([])}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Clear selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1">
            <CaseTable
              projectId={projectId}
              filters={filters}
              onChangeFilters={setFilters}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              activeId={activeId}
              onOpen={openCase}
              onDragSelection={setDraggingIds}
            />
          </div>
        </main>

        {/* Right — only occupies width when something is selected. It used to
            hold 360px permanently to show "No test case selected", squeezing
            the table for no benefit. */}
        {activeId && (
          <aside className="w-[380px] shrink-0 border-l bg-card">
            <DetailPanel
              projectId={projectId}
              testCaseId={activeId}
              onClose={closeCase}
              onRun={runCase}
            />
          </aside>
        )}
      </div>

      <ImportModal
        projectId={projectId}
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImportSuccess={() => {
          setImportOpen(false)
          // Imported rows change counts, suite tallies and the list together.
          qc.invalidateQueries({ queryKey: ["test-library", projectId] })
        }}
      />
    </div>
  )
}
