"use client"

import { Bug, CheckCircle, ShieldCheck, Sparkles, Timer, AlertTriangle } from "@/components/ui/icons"
import type { BurndownResult, DefectTrendPoint, ExecutionFunnelResult } from "@/lib/reports/analytics"
import type { ProjectReport } from "@/lib/reports/types"
import { cn } from "@/lib/utils"

type Tone = "good" | "warn" | "bad" | "info"
interface Insight {
  key: string
  tone: Tone
  icon: React.ComponentType<{ className?: string }>
  title: string
  text: string
  targetId?: string
}

const TONE: Record<Tone, { tile: string; ring: string; label: string }> = {
  good: { tile: "bg-emerald-500/10 text-emerald-600", ring: "hover:border-emerald-300", label: "Good" },
  warn: { tile: "bg-amber-500/10 text-amber-600", ring: "hover:border-amber-300", label: "Watch" },
  bad: { tile: "bg-rose-500/10 text-rose-600", ring: "hover:border-rose-300", label: "Needs attention" },
  info: { tile: "bg-indigo-500/10 text-indigo-600", ring: "hover:border-indigo-300", label: "Note" },
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`

/**
 * Plain-language summary of what stands out in the selected period. Every
 * sentence is computed from the same data the charts below draw; nothing is
 * estimated or invented.
 */
export function buildInsights({
  report,
  defect,
  burndown,
  funnel,
}: {
  report?: ProjectReport
  defect?: DefectTrendPoint[]
  burndown?: BurndownResult
  funnel?: ExecutionFunnelResult
}): Insight[] {
  const out: Insight[] = []

  // Bugs: opened vs resolved in the period.
  if (defect) {
    const created = defect.reduce((s, d) => s + d.created, 0)
    const resolved = defect.reduce((s, d) => s + d.resolved, 0)
    const open = report?.summary.openDefects ?? defect[defect.length - 1]?.cumulativeOpen ?? 0
    out.push({
      key: "bugs",
      icon: Bug,
      tone: created > resolved ? "bad" : created > 0 ? "good" : open > 0 ? "warn" : "good",
      title: created > resolved ? "More bugs opened than fixed" : created > 0 ? "Bugs are being fixed" : "No new bugs",
      text:
        `${plural(created, "bug")} opened and ${resolved} resolved in this period. ` +
        (open > 0 ? `${open} still open.` : "None are open."),
      targetId: "chart-defect-trend",
    })
  }

  // Sprint: on track, behind, or ended with work left.
  if (burndown?.sprint) {
    const unit = burndown.unit === "issues" ? "issues" : "points"
    const last = [...burndown.points].reverse().find((p) => p.actual != null)
    const remaining = last?.actual ?? burndown.totalPoints
    const end = burndown.sprint.endDate ? new Date(burndown.sprint.endDate) : null
    const daysPast = end ? Math.floor((Date.now() - end.getTime()) / 86_400_000) : -1
    const today = new Date().toISOString().slice(0, 10)
    const idealToday = burndown.points.find((p) => p.date === today)?.ideal
    let tone: Tone = "good"
    let title = `${burndown.sprint.name} is on track`
    let text = `${remaining} of ${burndown.totalPoints} ${unit} left.`
    if (daysPast > 0 && remaining > 0) {
      tone = "bad"
      title = `${burndown.sprint.name} ended with work left`
      text = `It ended ${plural(daysPast, "day")} ago with ${remaining} of ${burndown.totalPoints} ${unit} unfinished. Complete the sprint to move the rest on.`
    } else if (idealToday !== undefined && remaining > idealToday) {
      tone = "warn"
      title = `${burndown.sprint.name} is behind plan`
      text = `${remaining} ${unit} left; the plan for today is ${idealToday}.`
    } else if (remaining === 0) {
      title = `${burndown.sprint.name} is done`
      text = `All ${burndown.totalPoints} ${unit} are finished.`
    }
    out.push({ key: "sprint", icon: Timer, tone, title, text, targetId: "chart-burndown" })
  }

  // Testing: did anything run, and how did it go.
  if (funnel) {
    if (funnel.total === 0) {
      out.push({ key: "tests", icon: CheckCircle, tone: "info", title: "No test cases yet", text: "Write or generate test cases to start measuring quality." })
    } else if (funnel.executed === 0) {
      out.push({
        key: "tests",
        icon: AlertTriangle,
        tone: "warn",
        title: "Nothing was tested",
        text: `None of the ${plural(funnel.total, "test case")} ran in this period.`,
      })
    } else {
      const rate = Math.round((funnel.passed / funnel.executed) * 100)
      out.push({
        key: "tests",
        icon: CheckCircle,
        tone: funnel.failed > 0 ? (rate < 80 ? "bad" : "warn") : "good",
        title: funnel.failed > 0 ? `${plural(funnel.failed, "test")} failing` : "All executed tests passed",
        text: `${funnel.executed} of ${funnel.total} test cases ran: ${funnel.passed} passed, ${funnel.failed} failed${funnel.blocked ? `, ${funnel.blocked} blocked` : ""} (${rate}% pass rate).`,
      })
    }
  }

  // Coverage: are requirements linked to tests.
  if (report) {
    const total = report.coverage.requirementsTotal
    const covered = report.coverage.requirementsCovered
    if (total === 0) {
      out.push({ key: "coverage", icon: ShieldCheck, tone: "info", title: "No requirements tracked", text: "Link test cases to user stories or BRD requirements to measure coverage." })
    } else {
      const pct = Math.round((covered / total) * 100)
      out.push({
        key: "coverage",
        icon: ShieldCheck,
        tone: pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad",
        title: `${pct}% of requirements covered`,
        text: `${covered} of ${plural(total, "requirement")} have at least one test case.`,
      })
    }
  }

  return out
}

export function Insights({ items }: { items: Insight[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="insights-title" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 id="insights-title" className="title-3 mb-4 flex items-center gap-2 text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white shadow-glow">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        What stands out
      </h2>
      <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => {
          const t = TONE[it.tone]
          const Icon = it.icon
          const Tag = it.targetId ? "button" : "div"
          return (
            <Tag
              key={it.key}
              {...(it.targetId
                ? {
                    type: "button" as const,
                    onClick: () => document.getElementById(it.targetId!)?.scrollIntoView({ behavior: "smooth", block: "center" }),
                  }
                : {})}
              className={cn(
                "hover-lift flex gap-3 rounded-xl border border-border bg-background p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                t.ring
              )}
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", t.tile)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 space-y-1">
                <span className="caption-3 block text-muted-foreground">{t.label}</span>
                <span className="title-4 block text-foreground">{it.title}</span>
                <span className="body-6 block text-muted-foreground">{it.text}</span>
              </span>
            </Tag>
          )
        })}
      </div>
    </section>
  )
}
