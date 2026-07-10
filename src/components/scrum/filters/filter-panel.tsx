"use client"

import type { TaskFilters, TaskStatus, TaskPriority } from "@/types/scrum"
import { useScrumMembers, useScrumSprints, useScrumEpics } from "@/hooks/scrum/use-scrum"
import { STATUS_META, PRIORITY_META } from "@/components/scrum/shared"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SlidersHorizontal } from "lucide-react"

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "TESTING", "DEPLOYED", "DONE"]
const PRIORITIES: TaskPriority[] = ["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"]

export function activeFilterCount(f: TaskFilters): number {
  return (
    (f.status?.length ?? 0) +
    (f.priority?.length ?? 0) +
    (f.assignee?.length ?? 0) +
    (f.sprint ? 1 : 0) +
    (f.epic ? 1 : 0)
  )
}

export function FilterPanel({
  projectId,
  filters,
  onChange,
}: {
  projectId: string
  filters: TaskFilters
  onChange: (next: TaskFilters) => void
}) {
  const { data: members } = useScrumMembers(projectId)
  const { data: sprints } = useScrumSprints(projectId)
  const { data: epics } = useScrumEpics(projectId)
  const count = activeFilterCount(filters)

  const toggle = <K extends "status" | "priority" | "assignee">(key: K, value: string) => {
    const current = (filters[key] as string[] | undefined) ?? []
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    onChange({ ...filters, [key]: next.length ? next : undefined })
  }

  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        on ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-semibold hover:bg-muted">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          Filter
          {count > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <Section title="Status">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Chip key={s} on={filters.status?.includes(s) ?? false} onClick={() => toggle("status", s)}>
                {STATUS_META[s].label}
              </Chip>
            ))}
          </div>
        </Section>
        <Section title="Priority">
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <Chip key={p} on={filters.priority?.includes(p) ?? false} onClick={() => toggle("priority", p)}>
                {PRIORITY_META[p].label}
              </Chip>
            ))}
          </div>
        </Section>
        <Section title="Assignee">
          <div className="flex flex-wrap gap-1.5">
            {members?.map((m) => (
              <Chip key={m.id} on={filters.assignee?.includes(m.id) ?? false} onClick={() => toggle("assignee", m.id)}>
                {m.name || m.email}
              </Chip>
            ))}
          </div>
        </Section>
        <div className="grid grid-cols-2 gap-2">
          <Section title="Sprint">
            <select
              value={filters.sprint ?? ""}
              onChange={(e) => onChange({ ...filters, sprint: e.target.value || undefined })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            >
              <option value="">All</option>
              {sprints?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Section>
          <Section title="Epic">
            <select
              value={filters.epic ?? ""}
              onChange={(e) => onChange({ ...filters, epic: e.target.value || undefined })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            >
              <option value="">All</option>
              {epics?.map((ep) => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
            </select>
          </Section>
        </div>
        {count > 0 && (
          <button
            onClick={() => onChange({ search: filters.search })}
            className="w-full rounded-md border border-input py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
          >
            Clear all filters
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}
