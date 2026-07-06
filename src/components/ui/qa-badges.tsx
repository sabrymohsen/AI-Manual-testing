/**
 * Shared badge/pill helpers for the QA planning surfaces (Requirements,
 * Backlog, pickers). One source of truth for priority / requirement-status /
 * coverage color coding — previously duplicated with drift across pages.
 */

export const PRIORITY_STYLES: Record<string, string> = {
  Critical: "bg-red-50 text-red-700 border-red-100",
  High: "bg-orange-50 text-orange-700 border-orange-100",
  Medium: "bg-amber-50 text-amber-700 border-amber-100",
  Low: "bg-slate-50 text-slate-500 border-slate-100",
}

export function getPriorityBadge(priority: string) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${PRIORITY_STYLES[priority] || PRIORITY_STYLES.Low}`}>
      {priority}
    </span>
  )
}

export const REQUIREMENT_STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  Draft: { label: "Draft", cls: "bg-slate-50 text-slate-500 border-slate-200" },
  ReadyForTesting: { label: "Ready", cls: "bg-blue-50 text-blue-700 border-blue-100" },
  InTesting: { label: "In Testing", cls: "bg-amber-50 text-amber-700 border-amber-100" },
  Covered: { label: "Covered", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  PartiallyCovered: { label: "Partial", cls: "bg-yellow-50 text-yellow-700 border-yellow-100" },
  Failed: { label: "Failed", cls: "bg-red-50 text-red-700 border-red-100" },
  Blocked: { label: "Blocked", cls: "bg-orange-50 text-orange-700 border-orange-100" },
  Deprecated: { label: "Deprecated", cls: "bg-slate-100 text-slate-400 border-slate-200" },
}

export function getStatusBadge(status: string) {
  const style = REQUIREMENT_STATUS_STYLES[status] || { label: status, cls: "bg-slate-50 text-slate-500 border-slate-200" }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${style.cls}`}>
      {style.label}
    </span>
  )
}

const COVERAGE_STYLES: Record<string, { label: string; cls: string }> = {
  Covered: { label: "Covered", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  PartiallyCovered: { label: "Partial", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" },
  Uncovered: { label: "Uncovered", cls: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400" },
  Failed: { label: "Failed", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  Blocked: { label: "Blocked", cls: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
  NotExecuted: { label: "Not Executed", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
}

export function getCoverageBadge(coverage: string) {
  const style = COVERAGE_STYLES[coverage] || { label: coverage, cls: "bg-slate-100 text-slate-500" }
  return (
    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase whitespace-nowrap ${style.cls}`}>
      {style.label}
    </span>
  )
}
