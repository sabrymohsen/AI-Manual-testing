/**
 * Derives a Jira-style board key from a project name: initials for
 * multi-word names ("Sample Shop App" → "SSA"), a truncated uppercase
 * prefix for single words ("SDOH" → "SDOH"), max 4 characters.
 * Task keys render as `${boardKey}-${taskNumber}`.
 */
export function deriveBoardKey(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return "TASK"
  const key = words.length === 1 ? words[0].slice(0, 4) : words.map((w) => w[0]).join("").slice(0, 4)
  return key || "TASK"
}
