// Pure @mention extraction shared by the Next.js API routes and the
// standalone socket server (imported relatively — keep this file free of
// prisma / path-alias imports).

export interface MentionCandidate {
  id: string
  name: string | null
  email: string
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Find which candidates are @mentioned in a message. Supports:
 *   @Full Name   (case-insensitive)
 *   @firstname   (word-bounded, case-insensitive)
 *   @email
 */
export function extractMentionedUserIds(content: string, candidates: MentionCandidate[]): string[] {
  if (!content.includes("@")) return []
  const lower = content.toLowerCase()

  const hits = new Set<string>()
  for (const c of candidates) {
    const name = c.name?.trim().toLowerCase()
    if (name && lower.includes(`@${name}`)) {
      hits.add(c.id)
      continue
    }
    if (lower.includes(`@${c.email.toLowerCase()}`)) {
      hits.add(c.id)
      continue
    }
    const first = name?.split(/\s+/)[0]
    if (first && new RegExp(`@${escapeRegex(first)}(?![a-z0-9._-])`, "i").test(content)) {
      hits.add(c.id)
    }
  }
  return [...hits]
}

/** Truncate a message for a notification body. */
export function messagePreview(content: string, max = 200): string {
  return content.length > max ? `${content.slice(0, max)}…` : content
}
