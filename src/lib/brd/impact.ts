/**
 * Impact analysis for BRD requirements: "if this requirement changes, what
 * else can break?". Every link comes from the document itself (a reference to
 * another requirement's key, the epic it sits under, or the terms two
 * requirements share), so nothing is invented. It runs in code, needs no AI,
 * and is safe in the browser and on the server.
 *
 * Scoring follows the QA pipeline method (AI_Skills_project, stage 1):
 *   Likelihood 3 = changes it directly / names it, 2 = shares data or flow, 1 = indirect
 *   Severity   3 = core flow (login, payment, data loss, security), 2 = feature wrong, 1 = cosmetic/low
 *   Score = L x S → 9 Critical, 6 High, 3-4 Medium, 1-2 Low
 * Critical and High impacts must get regression test cases.
 */
import { normalize } from "@/lib/brd/text-utils"

export interface ImpactRequirement {
  id: string
  key: string
  title: string
  description: string
  acceptanceCriteria?: string[] | null
  section?: string | null
  parentKey?: string | null
  priority?: string | null
  status?: string | null
}

export type ImpactRelation = "depends-on" | "downstream" | "parent-epic" | "child-story" | "same-epic" | "shared-data"
export type ImpactLevel = "Critical" | "High" | "Medium" | "Low"

export interface Impact {
  id: string
  key: string
  title: string
  relation: ImpactRelation
  likelihood: 1 | 2 | 3
  severity: 1 | 2 | 3
  score: number
  level: ImpactLevel
  /** Exact text that proves the link, or the shared terms. */
  evidence: string
  /** What a regression test should check. */
  testFocus: string
}

export const RELATION_LABEL: Record<ImpactRelation, string> = {
  "depends-on": "Depends on it",
  downstream: "Depends on this",
  "parent-epic": "Its epic",
  "child-story": "Story in this epic",
  "same-epic": "Same epic",
  "shared-data": "Shares data/fields",
}

export function levelFor(score: number): ImpactLevel {
  if (score >= 9) return "Critical"
  if (score >= 6) return "High"
  if (score >= 3) return "Medium"
  return "Low"
}

// Core flows: a break here blocks users, loses data or money, or is a security hole.
const CORE = [
  "login", "log in", "sign in", "signin", "logout", "password", "authentication", "otp", "payment", "pay", "checkout",
  "order", "invoice", "refund", "security", "permission", "role", "access", "delete", "account", "register", "registration",
  "تسجيل الدخول", "كلمه المرور", "الدفع", "دفع", "صلاحي", "حذف", "حساب", "تسجيل", "فاتوره", "طلب",
].map((w) => normalize(w))

const STOP = new Set(
  [
    // English
    "the", "and", "for", "with", "that", "this", "from", "into", "when", "then", "than", "shall", "must", "should",
    "will", "would", "can", "could", "may", "able", "allow", "allows", "user", "users", "system", "page", "screen",
    "field", "fields", "data", "information", "details", "able", "each", "every", "all", "any", "only", "also",
    "have", "has", "been", "being", "are", "was", "were", "not", "new", "valid", "invalid", "show", "shows",
    "display", "displayed", "click", "button", "option", "options", "using", "used", "use", "after", "before",
    "where", "which", "what", "who", "there", "their", "they", "them", "your", "you", "our", "its", "requirement",
    "requirements", "story", "epic", "feature", "message", "able", "via", "per", "such", "other", "same",
    // Arabic (already normalised: ة→ه, أ→ا, ى→ي)
    "النظام", "نظام", "المستخدم", "مستخدم", "يجب", "ان", "من", "في", "علي", "الي", "عند", "او", "هذا", "هذه",
    "التي", "الذي", "يتم", "خلال", "ذلك", "كل", "مع", "عن", "بعد", "قبل", "حيث", "لا", "ما", "هو", "هي", "كما",
    "الخاصه", "الخاص", "يمكن", "امكانيه", "بيانات", "البيانات", "شاشه", "الشاشه", "صفحه", "الصفحه", "زر",
    "قصه", "ملحمه", "متطلب", "المتطلبات", "متطلبات",
  ].map((w) => normalize(w))
)

function textOf(r: ImpactRequirement): string {
  return [r.title, r.description, ...(r.acceptanceCriteria ?? [])].filter(Boolean).join("\n")
}

/** Content words of a text, lightly stemmed so "orders"/"order" and "الطلب"/"طلب" meet. */
export function terms(text: string): Set<string> {
  const out = new Set<string>()
  for (let w of normalize(text).split(" ")) {
    if (!w || /^\d+$/.test(w)) continue
    if (/[؀-ۿ]/.test(w)) {
      for (const p of ["وال", "بال", "لل", "ال"]) if (w.startsWith(p) && w.length - p.length >= 3) { w = w.slice(p.length); break }
      if (w.length < 3) continue
    } else {
      if (w.length < 4) continue
      if (w.endsWith("ies") && w.length > 5) w = w.slice(0, -3) + "y"
      else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 4) w = w.slice(0, -1)
    }
    if (STOP.has(w)) continue
    out.add(w)
  }
  return out
}

function isCore(r: ImpactRequirement): boolean {
  const t = ` ${normalize(textOf(r))} `
  return CORE.some((w) => t.includes(` ${w} `) || (w.length >= 5 && t.includes(w)))
}

function severityOf(r: ImpactRequirement): 1 | 2 | 3 {
  if (r.priority === "Critical" || isCore(r)) return 3
  if (r.priority === "Low") return 1
  return 2
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** The sentence of `text` that names `key`, or null. Keys like "FR-1" must not match "FR-12". */
function sentenceNaming(text: string, key: string): string | null {
  if (!key || key.length < 2) return null
  const re = new RegExp(`(^|[^\\p{L}\\p{N}-])${escapeRe(key)}(?![\\p{N}])`, "iu")
  if (!re.test(text)) return null
  const parts = text.split(/(?<=[.!?؟\n])\s+/)
  const hit = parts.find((p) => re.test(p)) ?? text
  return hit.trim().slice(0, 240)
}

/**
 * The ids a requirement is known by: its key (REQ-3) and the document's own id
 * when the text starts with one ("FR-12. …"), since other requirements cite that.
 */
export function aliases(r: ImpactRequirement): string[] {
  const out = [r.key]
  for (const s of [r.title, r.description]) {
    const m = /^\s*\[?([A-Za-z]{1,8}[-_.]?\d+(?:\.\d+)*)\]?[\s.:)\-–]/.exec(s || "")
    if (m && !out.some((k) => k.toLowerCase() === m[1].toLowerCase())) out.push(m[1])
  }
  return out
}

interface Link {
  relation: ImpactRelation
  likelihood: 1 | 2 | 3
  evidence: string
}

/** The other requirements `target` can break, strongest first. */
export function impactsFor(target: ImpactRequirement, all: ImpactRequirement[], opts: { limit?: number } = {}): Impact[] {
  const limit = opts.limit ?? 8
  const tText = textOf(target)
  const tTerms = terms(tText)
  const tAliases = aliases(target)
  const out: Impact[] = []

  for (const other of all) {
    if (other.id === target.id || other.status === "removed") continue
    const oText = textOf(other)
    const links: Link[] = []

    // A requirement's own leading id ("FR-90. …") is not a reference to itself.
    const own = (r: ImpactRequirement, text: string) => {
      const lead = aliases(r).slice(1).map((a) => a.toLowerCase())
      return lead.length ? text.replace(new RegExp(`^\\s*\\[?(${lead.map(escapeRe).join("|")})\\]?`, "i"), "") : text
    }
    const tBody = [own(target, target.title), own(target, target.description), ...(target.acceptanceCriteria ?? [])].join("\n")
    const oBody = [own(other, other.title), own(other, other.description), ...(other.acceptanceCriteria ?? [])].join("\n")
    const names = aliases(other).map((a) => sentenceNaming(tBody, a)).find(Boolean)
    if (names) links.push({ relation: "depends-on", likelihood: 3, evidence: names })
    const namedBy = tAliases.map((a) => sentenceNaming(oBody, a)).find(Boolean)
    if (namedBy) links.push({ relation: "downstream", likelihood: 3, evidence: `${other.key}: ${namedBy}` })

    if (other.parentKey && other.parentKey === target.key) {
      links.push({ relation: "child-story", likelihood: 3, evidence: `${other.key} is listed under ${target.key} in the document` })
    }
    if (target.parentKey && target.parentKey === other.key) {
      links.push({ relation: "parent-epic", likelihood: 2, evidence: `${target.key} is listed under ${other.key} in the document` })
    }

    const oTerms = terms(oText)
    const shared = [...oTerms].filter((w) => tTerms.has(w))
    // Short requirements share few words, so judge overlap relative to the smaller one.
    const overlap = shared.length / Math.max(1, Math.min(tTerms.size, oTerms.size))
    const sameEpic = !!target.parentKey && target.parentKey === other.parentKey
    if (sameEpic) {
      links.push({
        relation: "same-epic",
        likelihood: shared.length >= 2 ? 2 : 1,
        evidence: `Both are under ${target.parentKey}${shared.length ? `; both mention: ${shared.slice(0, 5).join(", ")}` : ""}`,
      })
    }
    if (shared.length >= 3 || (shared.length >= 2 && overlap >= 0.2)) {
      links.push({
        relation: "shared-data",
        likelihood: shared.length >= 6 || overlap >= 0.5 ? 3 : 2,
        evidence: `Both mention: ${shared.slice(0, 6).join(", ")}`,
      })
    }

    if (!links.length) continue
    const best = links.sort((a, b) => b.likelihood - a.likelihood)[0]
    const severity = severityOf(other)
    const score = best.likelihood * severity
    out.push({
      id: other.id,
      key: other.key,
      title: other.title,
      relation: best.relation,
      likelihood: best.likelihood,
      severity,
      score,
      level: levelFor(score),
      evidence: best.evidence,
      testFocus: `${other.key} "${other.title.slice(0, 80)}" still works after ${target.key} changes`,
    })
  }

  return out.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, limit)
}

/** Impacts for every requirement, by id. */
export function impactMap(all: ImpactRequirement[], opts: { limit?: number } = {}): Record<string, Impact[]> {
  const map: Record<string, Impact[]> = {}
  for (const r of all) map[r.id] = r.status === "removed" ? [] : impactsFor(r, all, opts)
  return map
}

/** The impacts regression tests must cover. */
export function mustCover(impacts: Impact[]): Impact[] {
  return impacts.filter((i) => i.level === "Critical" || i.level === "High")
}
