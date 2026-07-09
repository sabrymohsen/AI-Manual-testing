"use client"

export type SwimlaneMode = "none" | "assignee" | "epic" | "parent"
export type CardColorMode = "priority" | "epic" | "none"
export type CardSize = "compact" | "normal"

export interface BoardConfig {
  swimlaneMode: SwimlaneMode
  cardColorMode: CardColorMode
  cardSize: CardSize
  wipLimits: Record<string, number>
  collapsedColumns: string[]
  quickFilters: {
    assignees: string[]
    priorities: string[]
    labels: string[]
    types: string[]
  }
}

export const DEFAULT_CONFIG: BoardConfig = {
  swimlaneMode: "none",
  cardColorMode: "priority",
  cardSize: "normal",
  wipLimits: { todo: 0, inprogress: 0, blocked: 0, done: 0 },
  collapsedColumns: [],
  quickFilters: { assignees: [], priorities: [], labels: [], types: [] },
}

export function loadBoardConfig(projectId: string): BoardConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(`board-config-${projectId}`)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveBoardConfig(projectId: string, config: BoardConfig) {
  if (typeof window === "undefined") return
  localStorage.setItem(`board-config-${projectId}`, JSON.stringify(config))
}

export const EPIC_COLORS = [
  "border-l-violet-500",
  "border-l-pink-500",
  "border-l-cyan-500",
  "border-l-amber-500",
  "border-l-emerald-500",
  "border-l-orange-500",
  "border-l-sky-500",
  "border-l-rose-500",
]

export function epicColorClass(epicId: string): string {
  let hash = 0
  for (let i = 0; i < epicId.length; i++) {
    hash = (hash << 5) - hash + epicId.charCodeAt(i)
    hash |= 0
  }
  return EPIC_COLORS[Math.abs(hash) % EPIC_COLORS.length]
}

export const PRIORITY_BORDER_COLORS: Record<string, string> = {
  Critical: "border-l-red-500",
  High: "border-l-orange-400",
  Medium: "border-l-amber-400",
  Low: "border-l-slate-300",
}
