import type { TaskStatus, TaskPriority, TaskType, TaskLinkType } from "@/types/scrum"
import {
  BookMarked,
  Bug,
  CheckSquare,
  GitBranch,
  Layers,
  Ban,
  CircleSlash,
  Link2,
  Copy,
  GitFork,
  FlaskConical,
  type LucideIcon,
} from "@/components/ui/icons"

/** Jira-style status pill tokens (bg / text / border / dot). */
export const STATUS_COLORS: Record<
  TaskStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  TODO: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300", dot: "bg-gray-400", label: "To Do" },
  IN_PROGRESS: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500", label: "In Progress" },
  REVIEW: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500", label: "In Review" },
  TESTING: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500", label: "Testing" },
  DEPLOYED: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", dot: "bg-cyan-500", label: "Deployed" },
  DONE: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500", label: "Done" },
}

export const STATUS_ORDER: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "TESTING", "DEPLOYED", "DONE"]
export const PRIORITY_ORDER: TaskPriority[] = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"]

/** Type glyph + accent color. */
export const TYPE_META: Record<TaskType, { icon: LucideIcon; color: string; label: string }> = {
  STORY: { icon: BookMarked, color: "text-green-600", label: "Story" },
  BUG: { icon: Bug, color: "text-red-600", label: "Bug" },
  TASK: { icon: CheckSquare, color: "text-blue-600", label: "Task" },
  SUBTASK: { icon: GitBranch, color: "text-sky-600", label: "Subtask" },
  EPIC: { icon: Layers, color: "text-purple-600", label: "Epic" },
  TEST_CASE: { icon: FlaskConical, color: "text-teal-600", label: "Test case" },
}

export const TASK_TYPES: TaskType[] = ["STORY", "BUG", "TASK", "SUBTASK", "EPIC", "TEST_CASE"]

/** Issue-link phrasing → icon + color. */
export const LINK_TYPE_META: Record<string, { icon: LucideIcon; color: string }> = {
  blocks: { icon: Ban, color: "text-red-600" },
  "is blocked by": { icon: CircleSlash, color: "text-orange-500" },
  "relates to": { icon: Link2, color: "text-gray-500" },
  duplicates: { icon: Copy, color: "text-purple-600" },
  "is duplicated by": { icon: Copy, color: "text-purple-500" },
  clones: { icon: GitFork, color: "text-blue-600" },
  "is cloned by": { icon: GitFork, color: "text-blue-500" },
}

export const LINK_TYPES: TaskLinkType[] = ["blocks", "is blocked by", "relates to", "duplicates", "clones"]

/** Common story-point values Jira offers. */
export const STORY_POINT_OPTIONS = [0.5, 1, 2, 3, 5, 8, 13, 21]

/** Parse "1h 30m", "90m", "1.5h", "2h" → total minutes. Returns null if unparseable. */
export function parseTimeToMinutes(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null

  // Pure number → treat as minutes.
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s))

  let total = 0
  let matched = false
  const units: [RegExp, number][] = [
    [/(\d+(?:\.\d+)?)\s*w/, 5 * 8 * 60],
    [/(\d+(?:\.\d+)?)\s*d/, 8 * 60],
    [/(\d+(?:\.\d+)?)\s*h/, 60],
    [/(\d+(?:\.\d+)?)\s*m/, 1],
  ]
  for (const [re, mult] of units) {
    const m = s.match(re)
    if (m) {
      total += parseFloat(m[1]) * mult
      matched = true
    }
  }
  return matched ? Math.round(total) : null
}

/** Format minutes as "1h 30m" (or "0m"). */
export function formatMinutes(min: number | null | undefined): string {
  if (!min || min <= 0) return "0m"
  const w = Math.floor(min / (5 * 8 * 60))
  let rest = min % (5 * 8 * 60)
  const d = Math.floor(rest / (8 * 60))
  rest %= 8 * 60
  const h = Math.floor(rest / 60)
  const m = rest % 60
  return [w && `${w}w`, d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") || "0m"
}

/** Human file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
