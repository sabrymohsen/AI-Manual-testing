"use client"

import { useMemo, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useProjectTeam } from "@/hooks/use-project-team"
import { cn } from "@/lib/utils"
import { ChevronDown } from "@/components/ui/icons"
import { useFacets, type CasePriority, type LibraryFilters, type ReviewState } from "../_hooks/use-test-library"
import { PRIORITY_ORDER, REVIEW_META, REVIEW_ORDER } from "./config"

/**
 * Multi-select filter menus for the toolbar: priority, review state, tags and
 * assignee. Each reads/writes one LibraryFilters key, so every choice lands
 * in the URL like the other filters.
 */

function Trigger({ label, values }: { label: string; values: string[] }) {
  const on = values.length > 0
  return (
    <DropdownMenuTrigger
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors",
        on ? "border-primary/50 bg-primary/10 text-primary" : "bg-background hover:bg-accent"
      )}
    >
      {label}
      {on && <span className="max-w-[120px] truncate font-normal">: {values.length === 1 ? values[0] : `${values.length}`}</span>}
      <ChevronDown className="h-3 w-3 opacity-60" />
    </DropdownMenuTrigger>
  )
}

function toggle<T extends string>(list: T[] | undefined, v: T): T[] | undefined {
  const cur = list ?? []
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
  return next.length ? next : undefined
}

export function FilterMenus({
  projectId,
  filters,
  onChange,
}: {
  projectId: string
  filters: LibraryFilters
  onChange: (next: LibraryFilters) => void
}) {
  const { data: facets } = useFacets(projectId, filters)
  const { members } = useProjectTeam(projectId)
  const [tagQuery, setTagQuery] = useState("")

  const nameOf = useMemo(() => {
    const m = new Map(members.map((x) => [x.id, x.name]))
    return (id: string) => (id === "me" ? "Me" : id === "unassigned" ? "Unassigned" : m.get(id) ?? id)
  }, [members])

  const tags = (facets?.tags ?? []).filter((t) => t.tag.toLowerCase().includes(tagQuery.toLowerCase()))
  const assigneeCounts = new Map((facets?.assignees ?? []).map((a) => [a.assignee, a.count]))

  return (
    <>
      <DropdownMenu>
        <Trigger label="Priority" values={filters.priority ?? []} />
        <DropdownMenuContent align="start" className="w-44">
          {PRIORITY_ORDER.map((p) => (
            <DropdownMenuCheckboxItem
              key={p}
              checked={filters.priority?.includes(p) ?? false}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onChange({ ...filters, priority: toggle<CasePriority>(filters.priority, p) })}
              className="text-xs"
            >
              <span className="flex-1">{p}</span>
              <span className="tabular-nums text-muted-foreground">{facets?.byPriority[p] ?? 0}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Trigger label="Review" values={filters.review ?? []} />
        <DropdownMenuContent align="start" className="w-52">
          {REVIEW_ORDER.map((r) => (
            <DropdownMenuCheckboxItem
              key={r}
              checked={filters.review?.includes(r) ?? false}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onChange({ ...filters, review: toggle<ReviewState>(filters.review, r) })}
              className="text-xs"
            >
              <span className="flex-1">
                {REVIEW_META[r].label}
                <span className="block text-xs text-muted-foreground">{REVIEW_META[r].hint}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">{facets?.byReview?.[r] ?? 0}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Trigger label="Tags" values={filters.tag ?? []} />
        <DropdownMenuContent align="start" className="w-56">
          <div className="p-2">
            <Input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Find a tag…"
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {tags.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {facets?.tags?.length ? "No matching tags." : "No tags yet — add them when editing a case, or in bulk."}
              </p>
            )}
            {tags.map((t) => (
              <DropdownMenuCheckboxItem
                key={t.tag}
                checked={filters.tag?.includes(t.tag) ?? false}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onChange({ ...filters, tag: toggle(filters.tag, t.tag) })}
                className="text-xs"
              >
                <span className="flex-1 truncate">{t.tag}</span>
                <span className="tabular-nums text-muted-foreground">{t.count}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Trigger label="Assignee" values={(filters.assignee ?? []).map(nameOf)} />
        <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
          {(["me", "unassigned"] as const).map((v) => (
            <DropdownMenuCheckboxItem
              key={v}
              checked={filters.assignee?.includes(v) ?? false}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onChange({ ...filters, assignee: toggle(filters.assignee, v) })}
              className="text-xs"
            >
              {nameOf(v)}
              {v === "me" && <span className="ml-1 text-xs text-muted-foreground">(matched by email)</span>}
            </DropdownMenuCheckboxItem>
          ))}
          {members.some((m) => m.active) && <DropdownMenuSeparator />}
          {members.length > 0 && <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Team</DropdownMenuLabel>}
          {members
            .filter((m) => m.active || assigneeCounts.has(m.id))
            .map((m) => (
              <DropdownMenuCheckboxItem
                key={m.id}
                checked={filters.assignee?.includes(m.id) ?? false}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => onChange({ ...filters, assignee: toggle(filters.assignee, m.id) })}
                className="text-xs"
              >
                <span className="flex-1 truncate">{m.name}</span>
                <span className="tabular-nums text-muted-foreground">{assigneeCounts.get(m.id) ?? 0}</span>
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
