"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSuites, useSuiteMutations, useMoveCases, type SuiteNode } from "../_hooks/use-test-library"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Folder,
  FolderOpen,
  Inbox,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "@/components/ui/icons"
import { cn } from "@/lib/utils"

/**
 * Left rail: the suite tree.
 *
 * Suites are ownership — a case lives in exactly one, so these counts sum to
 * the project total. That is the whole point of the rewrite: the old tree was
 * projected from Requirement (many-to-many), so a case linked to stories under
 * two epics appeared under both, counts never reconciled, and there was nowhere
 * to file anything.
 *
 * Drag a selection from the table onto a suite to file it.
 */
export function SuiteTree({
  projectId,
  selectedSuite,
  onSelectSuite,
  draggingCaseIds,
}: {
  projectId: string
  selectedSuite: string | undefined
  onSelectSuite: (suiteId: string | undefined) => void
  draggingCaseIds: string[]
}) {
  const router = useRouter()
  const { data, isLoading } = useSuites(projectId)
  const { create, update, remove } = useSuiteMutations(projectId)
  const moveCases = useMoveCases(projectId)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [addingUnder, setAddingUnder] = useState<string | null | undefined>(undefined)
  const [newName, setNewName] = useState("")
  const [pendingDelete, setPendingDelete] = useState<SuiteNode | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, SuiteNode[]>()
    for (const s of data?.suites ?? []) {
      const list = map.get(s.parentId) ?? []
      list.push(s)
      map.set(s.parentId, list)
    }
    return map
  }, [data])

  /**
   * A suite's own count plus every descendant's, so a parent doesn't read "0"
   * while its children hold cases.
   */
  const rollupCount = useMemo(() => {
    const memo = new Map<string, number>()
    const walk = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!
      const self = (data?.suites ?? []).find((s) => s.id === id)?.caseCount ?? 0
      const total = self + (childrenOf.get(id) ?? []).reduce((sum, c) => sum + walk(c.id), 0)
      memo.set(id, total)
      return total
    }
    for (const s of data?.suites ?? []) walk(s.id)
    return memo
  }, [data, childrenOf])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  function handleDrop(suiteId: string | null) {
    setDropTarget(null)
    if (draggingCaseIds.length === 0) return
    moveCases.mutate({ testCaseIds: draggingCaseIds, suiteId })
  }

  function renderNode(suite: SuiteNode, depth: number) {
    const kids = childrenOf.get(suite.id) ?? []
    const isOpen = expanded.has(suite.id)
    const isSelected = selectedSuite === suite.id
    const isDropTarget = dropTarget === suite.id && draggingCaseIds.length > 0

    return (
      <div key={suite.id}>
        <div
          onClick={() => onSelectSuite(suite.id)}
          onDragOver={(e) => {
            if (draggingCaseIds.length === 0) return
            e.preventDefault()
            setDropTarget(suite.id)
          }}
          onDragLeave={() => setDropTarget((t) => (t === suite.id ? null : t))}
          onDrop={(e) => {
            e.preventDefault()
            handleDrop(suite.id)
          }}
          style={{ paddingLeft: 8 + depth * 14 }}
          className={cn(
            "group flex cursor-pointer items-center gap-2 rounded-md py-2 pr-2 text-sm transition-colors",
            isSelected
              ? "bg-primary/10 font-medium text-primary"
              : "text-foreground hover:bg-accent/60",
            isDropTarget && "ring-2 ring-primary ring-offset-1 ring-offset-background"
          )}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggle(suite.id)
            }}
            className={cn("rounded p-0.5 text-muted-foreground", kids.length === 0 && "invisible")}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {isOpen && kids.length > 0 ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary/70" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-primary/70" />
          )}

          {renaming === suite.id ? (
            <Input
              autoFocus
              value={draftName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => setRenaming(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draftName.trim()) {
                  update.mutate({ suiteId: suite.id, name: draftName.trim() })
                  setRenaming(null)
                }
                if (e.key === "Escape") setRenaming(null)
              }}
              className="h-6 flex-1 px-2 py-0 text-xs"
            />
          ) : (
            <span className="flex-1 truncate text-xs" title={suite.name}>
              {suite.name}
            </span>
          )}

          <span
            className={cn(
              "shrink-0 rounded-md px-2 text-xs font-semibold tabular-nums",
              (rollupCount.get(suite.id) ?? 0) === 0
                ? "text-muted-foreground/50"
                : "bg-muted text-muted-foreground"
            )}
          >
            {rollupCount.get(suite.id) ?? 0}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
              aria-label={`${suite.name} options`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                className="gap-2 text-xs font-medium"
                onClick={() => router.push(`/projects/${projectId}/test-cases/new?suite=${suite.id}`)}
              >
                <FlaskConical className="h-3.5 w-3.5 text-primary" /> Add test case in suite
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-xs"
                onClick={() => {
                  setAddingUnder(suite.id)
                  setNewName("")
                  setExpanded((p) => new Set(p).add(suite.id))
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add child suite
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-xs"
                onClick={() => {
                  setRenaming(suite.id)
                  setDraftName(suite.name)
                }}
              >
                <Pencil className="h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-xs text-destructive focus:text-destructive"
                onClick={() => setPendingDelete(suite)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {addingUnder === suite.id && (
          <div style={{ paddingLeft: 8 + (depth + 1) * 14 }} className="py-1 pr-2">
            <Input
              autoFocus
              value={newName}
              placeholder="Suite name"
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => setAddingUnder(undefined)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  create.mutate({ name: newName.trim(), parentId: suite.id })
                  setAddingUnder(undefined)
                }
                if (e.key === "Escape") setAddingUnder(undefined)
              }}
              className="h-7 text-xs"
            />
          </div>
        )}

        {isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    )
  }

  const roots = childrenOf.get(null) ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          Suites
        </span>
        <button
          onClick={() => {
            setAddingUnder(null)
            setNewName("")
          }}
          className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="New top-level suite"
          aria-label="New top-level suite"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {/* All */}
        <div
          onClick={() => onSelectSuite(undefined)}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
            selectedSuite === undefined
              ? "bg-primary/10 font-medium text-primary"
              : "hover:bg-accent/60"
          )}
        >
          <Layers className="h-4 w-4 shrink-0 text-primary/70" />
          <span className="flex-1">All test cases</span>
        </div>

        {/* Unfiled — the bucket the old tree had no way to represent. */}
        <div
          onClick={() => onSelectSuite("unfiled")}
          onDragOver={(e) => {
            if (draggingCaseIds.length === 0) return
            e.preventDefault()
            setDropTarget("unfiled")
          }}
          onDragLeave={() => setDropTarget((t) => (t === "unfiled" ? null : t))}
          onDrop={(e) => {
            e.preventDefault()
            handleDrop(null)
          }}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
            selectedSuite === "unfiled"
              ? "bg-primary/10 font-medium text-primary"
              : "hover:bg-accent/60",
            dropTarget === "unfiled" &&
              draggingCaseIds.length > 0 &&
              "ring-2 ring-primary ring-offset-1 ring-offset-background"
          )}
        >
          <Inbox className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">Unfiled</span>
          <span
            className={cn(
              "rounded-md px-2 text-xs font-semibold tabular-nums",
              (data?.unfiledCount ?? 0) === 0
                ? "text-muted-foreground/50"
                : "bg-muted text-muted-foreground"
            )}
          >
            {data?.unfiledCount ?? 0}
          </span>
        </div>

        <div className="my-2 border-t" />

        {isLoading && (
          <div className="space-y-2 p-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-muted" />
            ))}
          </div>
        )}

        {!isLoading && roots.length === 0 && addingUnder !== null && (
          <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
            No suites yet. Suites are folders for test cases — press + above to create one,
            e.g. &ldquo;Checkout&rdquo; or &ldquo;Login&rdquo;.
          </p>
        )}

        {addingUnder === null && (
          <div className="px-1 py-1">
            <Input
              autoFocus
              value={newName}
              placeholder="Suite name"
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => setAddingUnder(undefined)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  create.mutate({ name: newName.trim(), parentId: null })
                  setAddingUnder(undefined)
                }
                if (e.key === "Escape") setAddingUnder(undefined)
              }}
              className="h-7 text-xs"
            />
          </div>
        )}

        {roots.map((r) => renderNode(r, 0))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="danger"
        title={`Delete "${pendingDelete?.name}"?`}
        description="Any child suites are removed too. Test cases are never deleted — they move to Unfiled."
        confirmLabel="Delete suite"
        isLoading={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return
          await remove.mutateAsync(pendingDelete.id)
          if (selectedSuite === pendingDelete.id) onSelectSuite(undefined)
          setPendingDelete(null)
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
