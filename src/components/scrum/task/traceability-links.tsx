"use client"

import { useMemo, useState } from "react"
import type { LinkedTestCase, LinkedBug } from "@/types/scrum"
import { useScrumLinkables, useTraceabilityMutations } from "@/hooks/scrum/use-scrum"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { CreateBugModal } from "@/components/bug-reports/create-bug-modal"
import { Plus, X, FlaskConical, Bug, Search, Link2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function TraceabilityLinks({
  projectId,
  taskId,
  testCases,
  bugs,
}: {
  projectId: string
  taskId: string
  testCases: LinkedTestCase[]
  bugs: LinkedBug[]
}) {
  const { data: linkables } = useScrumLinkables(projectId)
  const { setTestCases, setBugs } = useTraceabilityMutations(projectId, taskId)

  const linkedTcIds = new Set(testCases.map((t) => t.id))
  const linkedBugIds = bugs.map((b) => b.id)

  const [bugDialogOpen, setBugDialogOpen] = useState(false)
  const [createBugOpen, setCreateBugOpen] = useState(false)

  const linkBug = (id: string) => setBugs.mutate([...linkedBugIds, id])

  return (
    <div className="space-y-5">
      {/* Test cases */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5" /> Test Cases {testCases.length > 0 && <span className="text-foreground">({testCases.length})</span>}
          </h4>
          <Picker
            label="Link test cases"
            items={(linkables?.testCases ?? []).map((tc) => ({ id: tc.id, primary: tc.title, secondary: tc.priority }))}
            selected={linkedTcIds}
            onToggle={(id) => {
              const next = linkedTcIds.has(id)
                ? testCases.filter((t) => t.id !== id).map((t) => t.id)
                : [...testCases.map((t) => t.id), id]
              setTestCases.mutate(next)
            }}
            emptyText="No test cases in this project yet."
          />
        </div>
        {testCases.length === 0 ? (
          <p className="text-xs text-muted-foreground">No test cases linked.</p>
        ) : (
          <ul className="space-y-1">
            {testCases.map((tc) => (
              <li key={tc.id} className="group flex items-center gap-2 rounded border border-border px-2 py-1.5 text-sm">
                <FlaskConical className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span className="flex-1 truncate">{tc.title}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{tc.priority}</span>
                <button
                  onClick={() => setTestCases.mutate(testCases.filter((t) => t.id !== tc.id).map((t) => t.id))}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bugs */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Bug className="h-3.5 w-3.5" /> Bugs {bugs.length > 0 && <span className="text-foreground">({bugs.length})</span>}
          </h4>
          <button
            onClick={() => setBugDialogOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-3 w-3" /> Link bug
          </button>
        </div>
        {bugs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No bugs linked.</p>
        ) : (
          <ul className="space-y-1">
            {bugs.map((b) => (
              <li key={b.id} className="group flex items-center gap-2 rounded border border-border px-2 py-1.5 text-sm">
                <Bug className="h-3.5 w-3.5 shrink-0 text-red-600" />
                {b.bugKey && <span className="font-mono text-[10px] font-bold text-red-600">{b.bugKey}</span>}
                <span className="flex-1 truncate">{b.title}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{b.status}</span>
                <button
                  onClick={() => setBugs.mutate(bugs.filter((x) => x.id !== b.id).map((x) => x.id))}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Link-bug dialog: pick an existing bug or create a new one */}
      <LinkBugDialog
        open={bugDialogOpen}
        onOpenChange={setBugDialogOpen}
        bugs={(linkables?.bugs ?? []).filter((b) => !linkedBugIds.includes(b.id))}
        onPick={(id) => {
          linkBug(id)
          setBugDialogOpen(false)
        }}
        onCreateNew={() => {
          setBugDialogOpen(false)
          setCreateBugOpen(true)
        }}
      />

      {/* Full bug-report form; on create, auto-link the new bug to this task */}
      <CreateBugModal
        projectId={projectId}
        open={createBugOpen}
        onClose={() => setCreateBugOpen(false)}
        onCreated={(bug) => {
          if (bug?.id) setBugs.mutate([...linkedBugIds, bug.id])
        }}
      />
    </div>
  )
}

function LinkBugDialog({
  open,
  onOpenChange,
  bugs,
  onPick,
  onCreateNew,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  bugs: LinkedBug[]
  onPick: (id: string) => void
  onCreateNew: () => void
}) {
  const [query, setQuery] = useState("")
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q
      ? bugs.filter((b) => b.title.toLowerCase().includes(q) || (b.bugKey || "").toLowerCase().includes(q))
      : bugs
  }, [bugs, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bug className="h-4 w-4 text-red-600" /> Link a bug
          </DialogTitle>
          <DialogDescription>Choose an existing bug, or create a new one and link it to this issue.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <button
            onClick={onCreateNew}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/60 py-2.5 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
          >
            <Plus className="h-4 w-4" /> Create new bug
          </button>

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">or link existing</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-input px-3 focus-within:ring-1 focus-within:ring-ring">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bugs by key or title…"
              className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
            {results.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-2 py-8 text-center">
                <Link2 className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  {bugs.length === 0 ? "No unlinked bugs — create a new one above." : "No matching bugs."}
                </p>
              </div>
            ) : (
              results.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onPick(b.id)}
                  className="flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-red-200 hover:bg-muted"
                >
                  <Bug className="h-4 w-4 shrink-0 text-red-600" />
                  {b.bugKey && <span className="font-mono text-xs font-bold text-red-600">{b.bugKey}</span>}
                  <span className="flex-1 truncate text-foreground">{b.title}</span>
                  <span className={cn("shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground")}>{b.severity}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Picker({
  label,
  items,
  selected,
  onToggle,
  emptyText,
}: {
  label: string
  items: { id: string; primary: string; secondary?: string }[]
  selected: Set<string>
  onToggle: (id: string) => void
  emptyText: string
}) {
  const [q, setQ] = useState("")
  const filtered = q ? items.filter((i) => i.primary.toLowerCase().includes(q.toLowerCase())) : items
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted">
          <Plus className="h-3 w-3" /> Link
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={label}
          className="mb-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        />
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {filtered.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyText}</p>}
          {filtered.map((i) => (
            <button
              key={i.id}
              onClick={() => onToggle(i.id)}
              className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <input type="checkbox" checked={selected.has(i.id)} readOnly className="mt-0.5 h-3.5 w-3.5 accent-primary" />
              <span className="flex-1">
                <span className="block truncate font-medium">{i.primary}</span>
                {i.secondary && <span className="block truncate text-[10px] text-muted-foreground">{i.secondary}</span>}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
