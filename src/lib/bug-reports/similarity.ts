/**
 * Local duplicate detection for bug reports.
 *
 * Deliberately has no AI dependency. The equivalent test-case detector calls an
 * OpenAI-compatible provider and throws when no key is configured, which means
 * it silently does nothing on most installs. Duplicate detection is only useful
 * if it runs every time someone files a bug, so this is pure string similarity
 * and always available. An AI pass can be layered on top later.
 */

/** Words too common in bug titles to carry signal. */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "when", "that", "this", "from", "not", "but",
  "are", "was", "were", "have", "has", "had", "does", "did", "doesn", "isn",
  "cannot", "can", "will", "would", "should", "after", "before", "into", "out",
  "bug", "issue", "error", "problem", "fail", "fails", "failed", "failing",
])

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
  )
}

/**
 * Jaccard similarity as a 0–100 percentage.
 *
 * Intersection over union, so it isn't fooled by length: a two-word title that
 * happens to appear inside a twenty-word one scores low, which is right —
 * "login fails" and "login fails intermittently on Safari after a token
 * refresh" are probably not the same defect.
 */
export function similarity(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return 0

  let shared = 0
  for (const t of Array.from(ta)) if (tb.has(t)) shared++

  const union = ta.size + tb.size - shared
  return union === 0 ? 0 : Math.round((shared / union) * 100)
}

export interface SimilarityCandidate {
  id: string
  bugKey: string | null
  title: string
  status: string
  severity: string
  createdAt: Date | string
  stepsToReproduce?: string | null
}

export interface ScoredMatch extends SimilarityCandidate {
  score: number
}

/**
 * Ranks candidates against a title, keeping only plausible matches.
 *
 * Steps-to-reproduce are weighted lightly (30%) — two bugs can share a lot of
 * boilerplate reproduction text ("open the app, log in…") without being the
 * same defect, so the title has to carry most of the signal.
 */
export function findSimilar(
  title: string,
  steps: string | null | undefined,
  candidates: SimilarityCandidate[],
  { threshold = 45, limit = 5 }: { threshold?: number; limit?: number } = {}
): ScoredMatch[] {
  if (tokenize(title).size === 0) return []

  return candidates
    .map((c) => {
      const titleScore = similarity(title, c.title)
      const stepScore =
        steps && c.stepsToReproduce ? similarity(steps, c.stepsToReproduce) : 0
      return { ...c, score: Math.round(titleScore * 0.7 + stepScore * 0.3) }
    })
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
