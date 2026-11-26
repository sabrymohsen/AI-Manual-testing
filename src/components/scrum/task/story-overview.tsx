"use client"

import { useEffect, useState } from "react"
import { differenceInCalendarDays, format } from "date-fns"
import type { ScrumTask, TaskStatus } from "@/types/scrum"
import { STATUS_COLORS, STATUS_ORDER } from "./task-detail-config"
import { Bug, CalendarDays, Check, CheckSquare, FlaskConical, Zap } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

/**
 * The top of a work item: where it is in the workflow, and how it's doing.
 * Every number comes from the item itself (subtasks, linked test cases and
 * bugs, points, due date). Nothing is estimated.
 */

const OPEN_BUG = new Set(["Open", "InProgress", "ReadyForRetest", "Reopened"])

/** Coloured strip for the item's type, so each kind of item has its own character. */
export const TYPE_ACCENT: Record<string, string> = {
  STORY: "bg-emerald-500",
  BUG: "bg-rose-500",
  TASK: "bg-blue-500",
  SUBTASK: "bg-sky-500",
  EPIC: "bg-violet-500",
  TEST_CASE: "bg-teal-500",
}

/** The workflow as a path you can click along. */
export function WorkflowPath({ status, onChange }: { status: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const current = STATUS_ORDER.indexOf(status)
  return (
    <nav aria-label="Workflow" className="w-full">
      <ol className="flex items-center">
        {STATUS_ORDER.map((s, i) => {
          const done = i < current
          const here = i === current
          const meta = STATUS_COLORS[s]
          return (
            <li key={s} className={cn("flex items-center", i < STATUS_ORDER.length - 1 && "flex-1")}>
              <button
                type="button"
                onClick={() => s !== status && onChange(s)}
                aria-current={here ? "step" : undefined}
                title={here ? `Now: ${meta.label}` : `Move to ${meta.label}`}
                className="group flex shrink-0 flex-col items-center gap-1.5 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-500",
                    done && "border-transparent bg-primary text-primary-foreground",
                    here && cn("border-transparent text-white shadow-[0_0_0_4px] shadow-primary/15", meta.dot),
                    !done && !here && "border-border bg-card text-muted-foreground group-hover:border-primary/50"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-xs",
                    here ? "font-semibold text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/70 group-hover:text-foreground"
                  )}
                >
                  {meta.label}
                </span>
              </button>
              {i < STATUS_ORDER.length - 1 && (
                <span className="mx-1 mb-5 h-0.5 flex-1 overflow-hidden rounded-full bg-border" aria-hidden>
                  <span
                    className="block h-full bg-primary transition-[width] duration-700 ease-out-soft"
                    style={{ width: i < current ? "100%" : "0%" }}
                  />
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function Ring({ value, total, className }: { value: number; total: number; className: string }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(total ? value / total : 0))
    return () => cancelAnimationFrame(t)
  }, [value, total])
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3" className="stroke-muted" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - shown)}
        className={cn("transition-[stroke-dashoffset] duration-700 ease-out-soft", className)}
      />
    </svg>
  )
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  tone: string
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3" title={typeof hint === "string" ? `${label}: ${hint}` : label}>
      <div className="flex items-center justify-between gap-2">
        <p className="whitespace-nowrap text-xs text-muted-foreground">{label}</p>
        {children ?? (
          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", tone)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums leading-tight text-foreground">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Points, subtasks, tests, bugs and due date for the item, at a glance. */
export function StoryGlance({ task }: { task: ScrumTask }) {
  const subtasks = task.subtasks ?? []
  const doneSubs = subtasks.filter((s) => s.completed).length
  const tests = task.testCases ?? []
  const passed = tests.filter((t) => t.lastStatus === "Passed").length
  const failed = tests.filter((t) => t.lastStatus === "Failed" || t.lastStatus === "Blocked").length
  const notRun = tests.length - passed - failed
  const openBugs = (task.bugs ?? []).filter((b) => OPEN_BUG.has(b.status)).length

  let due: { value: string; hint: string; tone: string } | null = null
  if (task.dueDate) {
    const days = differenceInCalendarDays(new Date(task.dueDate), new Date())
    const finished = task.status === "DONE"
    due = {
      value: format(new Date(task.dueDate), "MMM d"),
      hint: finished ? "Finished" : days < 0 ? `${-days} ${days === -1 ? "day" : "days"} late` : days === 0 ? "Due today" : `${days} ${days === 1 ? "day" : "days"} left`,
      tone: finished ? "bg-emerald-500/10 text-emerald-600" : days < 0 ? "bg-rose-500/10 text-rose-600" : days <= 2 ? "bg-amber-500/10 text-amber-600" : "bg-sky-500/10 text-sky-600",
    }
  }

  return (
    <div className="stagger grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-2">
      <Stat icon={Zap} tone="bg-violet-500/10 text-violet-600" label="Points" value={task.storyPoints ?? "None"} hint={task.storyPoints == null ? "Not estimated" : undefined} />
      <Stat
        icon={CheckSquare}
        tone=""
        label="Subtasks"
        value={subtasks.length ? `${doneSubs} / ${subtasks.length}` : "None"}
        hint={subtasks.length ? (doneSubs === subtasks.length ? "All done" : `${subtasks.length - doneSubs} to go`) : undefined}
      >
        {subtasks.length > 0 ? (
          <Ring value={doneSubs} total={subtasks.length} className={doneSubs === subtasks.length ? "stroke-emerald-500" : "stroke-primary"} />
        ) : undefined}
      </Stat>
      <Stat
        icon={FlaskConical}
        tone={failed ? "bg-rose-500/10 text-rose-600" : tests.length && passed === tests.length ? "bg-emerald-500/10 text-emerald-600" : "bg-teal-500/10 text-teal-600"}
        label="Tests"
        value={tests.length || "None"}
        hint={
          tests.length ? (
            <span>
              {passed > 0 && <span className="text-emerald-600">{passed} passed </span>}
              {failed > 0 && <span className="text-rose-600">{failed} failing </span>}
              {notRun > 0 && <span>{notRun} not run</span>}
            </span>
          ) : (
            "Not linked yet"
          )
        }
      />
      <Stat
        icon={Bug}
        tone={openBugs ? "bg-rose-500/10 text-rose-600" : "bg-muted text-muted-foreground"}
        label="Open bugs"
        value={openBugs}
        hint={task.bugs?.length ? `${task.bugs.length} linked` : "None linked"}
      />
      {due ? (
        <Stat icon={CalendarDays} tone={due.tone} label="Due" value={due.value} hint={due.hint} />
      ) : (
        <Stat icon={CalendarDays} tone="bg-muted text-muted-foreground" label="Due" value="None" hint="No due date" />
      )}
    </div>
  )
}

/** Small coloured tile for section headings across the item view. */
export function SectionIcon({ icon: Icon, tone }: { icon: React.ComponentType<{ className?: string }>; tone: string }) {
  return (
    <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", tone)}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}
