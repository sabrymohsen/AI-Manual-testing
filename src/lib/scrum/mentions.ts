/**
 * @mentions in Scrum Board comments.
 *
 * A mention is stored in the comment text as `@[Display Name](userId)`, so
 * the server knows exactly who to notify (no guessing from names, which can
 * repeat), and the UI can render it as a highlighted name. Text without
 * tokens, such as older comments, is unaffected.
 */
export const MENTION_TOKEN = /@\[([^\]\n]{1,80})\]\(([A-Za-z0-9_-]{1,64})\)/g

/** Unique user ids mentioned in a comment. */
export function mentionedUserIds(content: string): string[] {
  return [...new Set([...content.matchAll(MENTION_TOKEN)].map((m) => m[2]))]
}

/** Split text into plain parts and mentions, for rendering. */
export function splitMentions(content: string): ({ text: string } | { mention: string; userId: string })[] {
  const out: ({ text: string } | { mention: string; userId: string })[] = []
  let last = 0
  for (const m of content.matchAll(MENTION_TOKEN)) {
    if (m.index! > last) out.push({ text: content.slice(last, m.index) })
    out.push({ mention: m[1], userId: m[2] })
    last = m.index! + m[0].length
  }
  if (last < content.length) out.push({ text: content.slice(last) })
  return out
}

/** Tokens → "@Name", for editing a comment as plain text. */
export function mentionsToPlain(content: string): { text: string; mentions: { name: string; id: string }[] } {
  const mentions: { name: string; id: string }[] = []
  const text = content.replace(MENTION_TOKEN, (_all, name: string, id: string) => {
    if (!mentions.some((x) => x.id === id)) mentions.push({ name, id })
    return `@${name}`
  })
  return { text, mentions }
}

/** "@Name" for each picked person → token. Names no longer in the text are dropped. */
export function plainToMentions(text: string, mentions: { name: string; id: string }[]): string {
  // Longest names first, so "@Ann Lee" wins over "@Ann".
  const sorted = [...mentions].sort((a, b) => b.name.length - a.name.length)
  let out = text
  for (const m of sorted) {
    const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    out = out.replace(new RegExp(`@${escaped}(?![\\w])`, "g"), `@[${m.name.replace(/[\]\n]/g, "")}](${m.id})`)
  }
  return out
}
