import { readFile } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import mammoth from "mammoth"
import { prisma } from "@/lib/db"
import { STORAGE_ROOT, brdAudit } from "@/lib/brd/server"
import { ensureVersionText } from "@/lib/brd/content"
import { normalize, detectLanguage, type DocLanguage } from "@/lib/brd/text-utils"
import {
  sectionsFromHtml,
  sectionsFromText,
  chunkSections,
  outline,
  sectionText,
  type BrdSection,
} from "@/lib/brd/structure"
import {
  KIND_LABEL,
  REQUIREMENT_KINDS,
  type AnalysisCandidate,
  type AnalysisIssue,
  type IssueKind,
  type Priority,
  type RequirementKind,
} from "@/lib/brd/analysis-types"
import { chatWithConfiguredProvider, resolveProvider } from "@/lib/ai/provider-chat"
import { repairTruncatedJson } from "@/lib/ai/generate-bug-report"

/**
 * AI analysis of a BRD (Arabic, English or both) into requirements a tester
 * can trust.
 *
 * 1. The document is read with its structure (headings, lists, TABLES) — see
 *    structure.ts — and split into chunks along its own sections.
 * 2. Each chunk goes to the configured AI provider, which returns requirements
 *    in the document's own language, each with a verbatim quote, plus the
 *    ambiguities, conflicts and gaps it saw.
 * 3. Every quote is checked against the document (Arabic-aware matching). A
 *    requirement whose quote isn't in the document is marked unverified
 *    instead of being trusted — that is what keeps invented requirements out.
 * 4. Results are suggestions; a person picks which ones to add.
 *
 * With no AI provider configured the same pipeline runs a rule-based pass
 * over the structure (epics, user stories, FR-n, acceptance criteria, field
 * tables, "shall/يجب" sentences).
 */

type Actor = { id: string; name?: string | null; email?: string }

const CHUNK_CHARS = Number(process.env.BRD_AI_CHUNK_CHARS) || 9000
const CHUNK_TIMEOUT_MS = Number(process.env.BRD_AI_TIMEOUT_MS) || 300_000
/** A run whose row hasn't moved for this long died with its server process. */
export const STALE_AFTER_MS = 20 * 60_000

// ── Reading the document ─────────────────────────────────────────────────────

export interface LoadedDocument {
  sections: BrdSection[]
  text: string
  language: DocLanguage
  versionNumber: number
}

/** The current version as structured sections (Word/editor HTML keeps tables). */
export async function loadBrdDocument(brdId: string): Promise<LoadedDocument | null> {
  const brd = await prisma.brdDocument.findUnique({ where: { id: brdId }, select: { currentVersionId: true } })
  if (!brd?.currentVersionId) return null
  const v = await prisma.brdVersion.findUnique({
    where: { id: brd.currentVersionId },
    select: { id: true, versionNumber: true, contentHtml: true, storagePath: true, fileType: true },
  })
  if (!v) return null

  let sections: BrdSection[] = []
  try {
    if (v.contentHtml) sections = sectionsFromHtml(v.contentHtml)
    else if (v.fileType === "docx") {
      const buffer = await readFile(path.join(STORAGE_ROOT, v.storagePath))
      // Keep empty paragraphs: Word tick boxes are empty bullets (see structure.ts).
      const { value } = await mammoth.convertToHtml({ buffer }, { ignoreEmptyParagraphs: false })
      sections = sectionsFromHtml(value)
    }
  } catch (e: any) {
    console.error("BRD structure read failed, falling back to text:", e?.message)
    sections = []
  }
  if (!sections.length) sections = sectionsFromText(await ensureVersionText(v.id))

  const text = sections.map(sectionText).join("\n\n")
  return { sections, text, language: detectLanguage(text), versionNumber: v.versionNumber }
}

// ── Grounding: is this text really in the document? ──────────────────────────

export interface DocIndex {
  norm: string
  bigrams: Set<string>
}

export function indexDocument(text: string): DocIndex {
  const norm = normalize(text)
  const words = norm.split(" ").filter(Boolean)
  const bigrams = new Set<string>()
  for (let i = 0; i + 1 < words.length; i++) bigrams.add(`${words[i]} ${words[i + 1]}`)
  return { norm, bigrams }
}

/**
 * True when `quote` appears in the document: exactly after normalisation, or
 * with at least 80% of its word pairs present (models fix a typo, drop a
 * tatweel or re-space a table row when they copy).
 */
export function isGrounded(quote: string | null | undefined, doc: DocIndex): boolean {
  if (!quote) return false
  const q = normalize(quote)
  if (q.length < 6) return false
  if (doc.norm.includes(q)) return true
  const words = q.split(" ").filter(Boolean)
  if (words.length < 3) return false
  let hit = 0
  for (let i = 0; i + 1 < words.length; i++) if (doc.bigrams.has(`${words[i]} ${words[i + 1]}`)) hit++
  return hit / (words.length - 1) >= 0.8
}

// ── Normalising what a model (or the rules) produced ─────────────────────────

const KIND_ALIASES: Array<[RegExp, RequirementKind]> = [
  [/epic|ملحم/i, "epic"],
  [/stor|قصة|قصه/i, "user_story"],
  [/non.?func|nfr|performance|security|usability|أداء|امن|أمن|غير وظيف/i, "non_functional"],
  [/business.?rule|rule|قاعد|قواعد/i, "business_rule"],
  [/data|field|حقل|بيانات/i, "data"],
  [/integrat|interface|api|تكامل|ربط/i, "integration"],
  [/report|dashboard|تقرير|لوحة/i, "report"],
  [/constraint|assumption|قيد|قيود|افتراض/i, "constraint"],
  [/func|وظيف/i, "functional"],
]

export function toKind(v: unknown): RequirementKind {
  const s = String(v ?? "").trim()
  if ((REQUIREMENT_KINDS as readonly string[]).includes(s)) return s as RequirementKind
  for (const [re, k] of KIND_ALIASES) if (re.test(s)) return k
  return "functional"
}

/** Only a priority the document states; MoSCoW and Arabic wording map onto the app's scale. */
export function toPriority(v: unknown): Priority | null {
  const s = String(v ?? "").trim().toLowerCase()
  if (!s || s === "null" || s === "none") return null
  if (/critical|blocker|حرج|حرجة/.test(s)) return "Critical"
  if (/^must|high|عال|مرتفع|ضروري|إلزامي|الزامي/.test(s)) return "High"
  if (/^should|medium|متوسط/.test(s)) return "Medium"
  if (/^could|^won|low|منخفض|اختياري/.test(s)) return "Low"
  return null
}

function toIssueKind(v: unknown): IssueKind {
  const s = String(v ?? "").toLowerCase()
  if (/conflict|contradict|تعارض|تناقض/.test(s)) return "conflict"
  if (/missing|gap|incomplete|نقص|ناقص|مفقود/.test(s)) return "missing"
  if (/testab|measur|قابل/.test(s)) return "untestable"
  if (/question|clarif|سؤال|استفسار/.test(s)) return "question"
  return "ambiguity"
}

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const strList = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n+/) : [])
    .map((x) => str(typeof x === "string" ? x : (x as any)?.text ?? JSON.stringify(x), 1000).replace(/^[-•*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 80)

/** The document's own id for a requirement, kept only if it looks like one. */
function cleanRef(v: unknown): string | null {
  const s = str(v, 40)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[()[\]]/g, "")
    .trim()
  if (!s || s.toLowerCase() === "null") return null
  if (/^[A-Za-z]{1,6}[-_ ]?\d+(?:\.\d+)*$/.test(s)) return s.toUpperCase().replace(/[_ ]/, "-")
  if (/^\d+(?:\.\d+)*\.?$/.test(s)) return s.replace(/\.$/, "")
  return null
}

/** The leading number of a heading: "1.01 قصة المستخدم: …" → "1.01". */
export function refFromHeading(title: string): string | null {
  const m = title.match(/^\s*((?:[A-Za-z]{1,6}[-_ ]?)?[\d٠-٩]+(?:\.[\d٠-٩]+)*)\.?(?=[\s:：-])/)
  return m ? cleanRef(m[1]) : null
}

// ── Merging and numbering ────────────────────────────────────────────────────

function similar(a: string, b: string): boolean {
  const A = new Set(normalize(a).split(" ").filter((w) => w.length > 1))
  const B = new Set(normalize(b).split(" ").filter((w) => w.length > 1))
  if (!A.size || !B.size) return false
  let inter = 0
  for (const w of Array.from(A)) if (B.has(w)) inter++
  return inter / Math.min(A.size, B.size) >= 0.7
}

type Draft = Omit<AnalysisCandidate, "id" | "key" | "parentKey" | "existingId" | "existingKey"> & { parentRef: string | null }

/**
 * Joins duplicates (the same story seen by two overlapping chunks) and gives
 * every requirement a key: its own document id where it has one, otherwise
 * the next number for its kind (US-3, BR-7). Numbers repeat in some BRDs —
 * two different stories both numbered 1.01 — so a key is never reused.
 */
export function mergeAndKey(drafts: Draft[], takenKeys: Iterable<string> = []): AnalysisCandidate[] {
  const merged: Draft[] = []
  for (const d of drafts) {
    const dup = merged.find(
      (m) =>
        m.kind === d.kind &&
        ((m.ref && d.ref && m.ref === d.ref && (m.section === d.section || similar(m.title, d.title))) ||
          normalize(m.title) === normalize(d.title) ||
          (m.sourceQuote && d.sourceQuote && normalize(m.sourceQuote) === normalize(d.sourceQuote)))
    )
    if (!dup) {
      merged.push({ ...d, acceptanceCriteria: [...d.acceptanceCriteria] })
      continue
    }
    const seen = new Set(dup.acceptanceCriteria.map(normalize))
    for (const c of d.acceptanceCriteria) if (!seen.has(normalize(c))) dup.acceptanceCriteria.push(c), seen.add(normalize(c))
    if (d.description.length > dup.description.length) dup.description = d.description
    dup.verified = dup.verified || d.verified
    dup.confidence = Math.max(dup.confidence, d.confidence)
    dup.priority = dup.priority ?? d.priority
    dup.ref = dup.ref ?? d.ref
    dup.parentRef = dup.parentRef ?? d.parentRef
  }

  const used = new Set(Array.from(takenKeys, (k) => k.toUpperCase()))
  const counters: Record<string, number> = {}
  const nextFor = (prefix: string) => {
    let n = counters[prefix] ?? 1
    while (used.has(`${prefix}-${n}`)) n++
    counters[prefix] = n + 1
    return `${prefix}-${n}`
  }

  const out: AnalysisCandidate[] = merged.map((d) => {
    const prefix = KIND_LABEL[d.kind].prefix
    let key: string
    if (d.ref && /^[A-Z]/.test(d.ref)) key = d.ref
    else if (d.ref) key = `${prefix}-${d.ref}`
    else key = nextFor(prefix)
    if (used.has(key.toUpperCase())) {
      let i = 2
      while (used.has(`${key}-${i}`.toUpperCase())) i++
      key = `${key}-${i}`
    }
    used.add(key.toUpperCase())
    const { parentRef: _parentRef, ...rest } = d
    return { ...rest, id: randomUUID(), key, parentKey: null }
  })

  // Parent epic: by the epic's own number, else the epic whose heading is in this section's path.
  const epics = out.filter((c) => c.kind === "epic")
  out.forEach((c, i) => {
    if (c.kind === "epic") return
    const ref = merged[i].parentRef
    const byRef = ref ? epics.find((e) => e.ref === ref) : undefined
    const bySection = epics.find((e) => e.section && c.section.startsWith(e.section))
    c.parentKey = (byRef ?? bySection)?.key ?? null
  })
  return out
}

/** Marks suggestions that match a requirement already tracked for the BRD. */
export function matchExisting(
  candidates: AnalysisCandidate[],
  existing: Array<{ id: string; key: string; title: string; description: string; sourceQuote: string | null }>
): AnalysisCandidate[] {
  return candidates.map((c) => {
    const nt = normalize(c.title)
    const nq = c.sourceQuote ? normalize(c.sourceQuote) : ""
    const hit = existing.find(
      (e) =>
        (e.key && c.ref && e.key.toUpperCase().endsWith(c.ref.toUpperCase()) && similar(e.title, c.title)) ||
        normalize(e.title) === nt ||
        (nq.length > 12 && (normalize(e.sourceQuote || "") === nq || normalize(e.description).includes(nq)))
    )
    return { ...c, existingId: hit?.id ?? null, existingKey: hit?.key ?? null }
  })
}

// ── Rule-based pass (no AI provider) ─────────────────────────────────────────

const STORY_HEADING = /(قصة المستخدم|قصه المستخدم|user story)/i
const EPIC_HEADING = /(الملحمة|ملحمة|\bepic\b)/i
const REQ_ID_HEADING = /^\s*(FR|NFR|BR|REQ|UC)[-_ ]?\d+/i
const NORMATIVE = /\b(shall|must|should|is required to|will not|must not)\b|(^|\s)(يجب|ينبغي|يلزم|يلتزم|لا يجوز|لا يسمح|يسمح|يتم)(\s|$)/i
const NOT_REQUIREMENTS = /(سجل المراجعات|سجل الاجتماعات|اعتمادات|توقيعات|الفهرس|revision history|table of contents|sign.?off|approvals)/i

/** Vague wording a tester can't verify, in both languages. */
const VAGUE_TERMS = [
  "fast", "quickly", "user-friendly", "easy", "simple", "appropriate", "as needed", "etc", "and/or", "tbd", "tba", "flexible", "efficient", "robust", "intuitive", "adequate", "where possible", "as soon as possible", "some",
  "سريع", "بسرعة", "سرعة", "سرعه", "سهل", "بسهولة", "سهولة", "مناسب", "مناسبة", "حسب الحاجة", "عند الحاجة", "الخ", "إلخ", "وغيرها", "لاحقا", "لاحقًا", "يحدد لاحقا", "سيتم تحديده", "مرن", "فعال", "بشكل جيد", "قدر الإمكان", "بعض",
]

/** A line that opens with a requirement id: "FR-01 …", "NFR 2: …", "US-3 - …". */
const REQ_ID_LINE = /^\s*((FR|NFR|BR|REQ|US|UC|DR|INT|RPT|CON)[-_ ]?[\d٠-٩]+(?:\.[\d٠-٩]+)*)\s*[:：.)\-–—]?\s+(.+)$/i
/** "As a … I want …" / "بصفتي … أرغب …" written as one line. */
const STORY_SENTENCE = /^(as an?\b.+\bi (want|need|can)\b|(بصفتي|بصفتى).+(أرغب|ارغب|أريد|اريد|أستطيع|استطيع))/i
/** Section headings whose plain bullets are themselves requirements. */
const REQ_LIST_HEADING: [RegExp, RequirementKind][] = [
  [/(non.?functional|غير الوظيفي|غير وظيفي)/i, "non_functional"],
  [/(business rules?|قواعد العمل)/i, "business_rule"],
  [/(user stories|قصص المستخدم)/i, "user_story"],
  [/(functional requirements?|requirements|المتطلبات الوظيفية|المتطلبات|متطلبات)/i, "functional"],
]

function kindFromId(id: string): RequirementKind {
  const p = id.toUpperCase().replace(/[-_ ]?[\d٠-٩.]+$/, "")
  return (
    ({ NFR: "non_functional", BR: "business_rule", US: "user_story", DR: "data", INT: "integration", RPT: "report", CON: "constraint" } as Record<string, RequirementKind>)[p] ??
    "functional"
  )
}

/**
 * Requirements written as list items or lines rather than headings
 * ("- FR-01 Customers can …", "- As a clerk I want …", plain bullets under
 * "Functional Requirements"). Returns the drafts and the lines it used.
 */
export function requirementsFromLines(
  lines: string[],
  heading: string,
  sectionPath: string,
  language: DocLanguage,
  bulletSet: Set<string>
) {
  const drafts: Draft[] = []
  const used = new Set<string>()
  const listKind = REQ_LIST_HEADING.find(([re]) => re.test(heading))?.[1] ?? null
  for (const line of lines) {
    if (line.length < 8 || line.length > 1200) continue
    const id = line.match(REQ_ID_LINE)
    let kind: RequirementKind | null = null
    let ref: string | null = null
    let title = line
    if (id) {
      ref = refFromHeading(`${id[1]} `)
      kind = kindFromId(id[1])
      title = id[3]
    } else if (STORY_SENTENCE.test(line)) {
      kind = "user_story"
    } else if (listKind && bulletSet.has(line) && !/[?؟]\s*$/.test(line)) {
      kind = listKind
    }
    if (!kind) continue
    used.add(line)
    // Keep the rule itself; "(TBD: …)" notes stay in the description.
    const clean = title.trim()
    const short = clean.replace(/\s*\((?:TBD|TBA|يحدد لاحق[اًا]?)[^)]*\)\s*$/i, "").trim() || clean
    drafts.push({
      ref,
      kind,
      title: (short.length > 160 ? short.slice(0, 157).replace(/\s+\S*$/, "") + "…" : short),
      description: clean,
      acceptanceCriteria: [],
      priority: null,
      parentRef: null,
      section: sectionPath,
      sourceQuote: line,
      verified: true,
      confidence: id ? 0.6 : 0.5,
      language,
    })
  }
  return { drafts, used }
}

function splitBody(body: string) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean)
  return {
    prose: lines.filter((l) => !l.startsWith("|") && !l.startsWith("- ")),
    bullets: lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2)),
    rows: lines.filter((l) => l.startsWith("|")),
  }
}

/** "| a | b | ✓ | rule |" → "a — b — ✓ — rule", skipping a header row. */
function tableRowsToCriteria(rows: string[]): string[] {
  const out: string[] = []
  rows.forEach((row, i) => {
    const cells = row.split("|").map((c) => c.trim()).filter((_, j, a) => j > 0 && j < a.length - 1)
    const looksHeader = i === 0 && cells.some((c) => /^(الحقل|الحقول|field|name|نوع|type|الوصف|description)$/i.test(normalize(c)))
    if (looksHeader) return
    const filled = cells.filter(Boolean)
    if (filled.length >= 2) out.push(filled.join(" — "))
  })
  return out
}

export function rulesAnalysis(sections: BrdSection[], language: DocLanguage) {
  const drafts: Draft[] = []
  const issues: Omit<AnalysisIssue, "id" | "verified">[] = []

  for (const s of sections) {
    const sectionPath = s.path.join(" › ")
    if (s.path.some((p) => NOT_REQUIREMENTS.test(normalize(p)))) continue
    const { prose, bullets, rows } = splitBody(s.body)

    const kind: RequirementKind | null = EPIC_HEADING.test(s.title)
      ? "epic"
      : STORY_HEADING.test(s.title)
        ? "user_story"
        : REQ_ID_HEADING.test(s.title)
          ? s.title.trim().toUpperCase().startsWith("NFR")
            ? "non_functional"
            : s.title.trim().toUpperCase().startsWith("BR")
              ? "business_rule"
              : "functional"
          : null

    // "As a … / I want … / so that …" is the story itself, not a criterion.
    const STORY_LINE = /^(بصفتي|بصفتى|كـ?\s*مستخدم|أرغب|ارغب|حتى|لكي|as an?\b|i want\b|so that\b)/i
    const storyLines = bullets.filter((b) => STORY_LINE.test(b))
    const restBullets = bullets.filter((b) => !STORY_LINE.test(b))

    if (kind) {
      const title = s.title.replace(/^\s*(?:[A-Za-z]{1,6}[-_ ]?)?[\d٠-٩]+(?:\.[\d٠-٩]+)*\.?\s*/, "").replace(/^[^:：]*?(قصة المستخدم|قصه المستخدم|الملحمة|user story|epic)\s*[:：-]?\s*/i, "").replace(/^[\s:：-]+/, "").trim() || s.title
      const criteria = kind === "epic" ? [] : [...restBullets.filter((b) => !/^(معايير القبول|acceptance criteria)\s*[:：]?$/i.test(b)), ...tableRowsToCriteria(rows)]
      drafts.push({
        ref: refFromHeading(s.title),
        kind,
        title: title.slice(0, 300),
        description: ([...storyLines, ...prose].join("\n") || restBullets.slice(0, 3).join("\n") || title).slice(0, 4000),
        acceptanceCriteria: criteria,
        priority: null,
        parentRef: null,
        section: sectionPath,
        sourceQuote: s.title,
        verified: true,
        confidence: 0.6,
        language,
      })
    }

    if (kind !== "user_story" && kind !== "functional" && kind !== "non_functional" && kind !== "business_rule") {
      // Requirements written as list items/lines (in an epic, or a plain section).
      const found = requirementsFromLines([...prose, ...bullets], s.title, sectionPath, language, new Set(bullets))
      drafts.push(...found.drafts)

      // Open questions for the business.
      for (const b of bullets) {
        if (found.used.has(b) || !/[?؟]\s*$/.test(b) || b.length < 10) continue
        issues.push({
          kind: "question",
          severity: "medium",
          text: b.slice(0, 300),
          quote: b.slice(0, 300),
          section: sectionPath,
          suggestion: language === "ar" ? "احصل على إجابة من صاحب المتطلب وأضفها إلى الوثيقة." : "Get an answer from the requirement owner and add it to the document.",
          relatedKeys: [],
        })
      }

      // Otherwise, normative sentences outside a story are business rules.
      for (const line of kind === "epic" ? [] : [...prose, ...bullets]) {
        if (found.used.has(line)) continue
        if (line.length < 15 || line.length > 600 || !NORMATIVE.test(line)) continue
        drafts.push({
          ref: null,
          kind: "business_rule",
          title: line.slice(0, 160),
          description: line,
          acceptanceCriteria: [],
          priority: null,
          parentRef: null,
          section: sectionPath,
          sourceQuote: line,
          verified: true,
          confidence: 0.45,
          language,
        })
      }
    }

    // Vague wording anywhere in a requirement section.
    for (const line of [...prose, ...bullets]) {
      const n = ` ${normalize(line)} `
      const term = VAGUE_TERMS.find((t) => n.includes(` ${normalize(t)} `))
      if (!term) continue
      issues.push({
        kind: "ambiguity",
        severity: "medium",
        text:
          language === "ar"
            ? `صياغة غير قابلة للقياس: "${term}"`
            : `Wording that can't be tested: "${term}"`,
        quote: line.slice(0, 300),
        section: sectionPath,
        suggestion: language === "ar" ? "حدّد قيمة أو شرطًا قابلاً للقياس." : "State a measurable value or condition.",
        relatedKeys: [],
      })
    }
  }
  return { drafts: drafts.slice(0, 400), issues: issues.slice(0, 150) }
}

// ── AI pass ──────────────────────────────────────────────────────────────────

const LANGUAGE_RULE: Record<DocLanguage, string> = {
  ar: "The document is in Arabic. Write title, description, acceptanceCriteria, issue text and suggestions in Arabic, keeping the document's own terms. Do NOT translate to English. Keep ids, numbers and field names exactly as written.",
  en: "The document is in English. Write everything in English, keeping the document's own terms.",
  mixed:
    "The document mixes Arabic and English. Write each requirement in the language its source text uses; do not translate. Keep ids, numbers and field names exactly as written.",
}

export function analysisSystemPrompt(language: DocLanguage): string {
  return [
    "You are a senior business analyst and QA lead. You extract requirements from a Business Requirements Document (BRD) so testers can write test cases from them.",
    "Rules:",
    "- Extract ONLY what the text states. Never invent requirements, fields, values, roles or rules. If something is unclear, report it as an issue instead of guessing.",
    `- ${LANGUAGE_RULE[language]}`,
    "- One requirement = one testable capability or rule. A user story (As a / I want / so that — بصفتي / أرغب في / حتى) is ONE requirement of kind user_story; its acceptance criteria (معايير القبول) become its acceptanceCriteria, one line each.",
    "- acceptanceCriteria come ONLY from the text: stated criteria, and — when the text has a field table under the requirement — one line per table row in the form <field> — <type> — <mandatory or not> — <rule>, using the table's own words. A ✓ in a table cell means yes (in a 'mandatory/إلزامي' column: mandatory). If the text states no criteria, return []. Never write criteria of your own.",
    "- Epic headings (الملحمة / Epic) are requirements of kind epic with no criteria. Give stories the parentRef of their epic.",
    "- Business rules, statuses and workflow transitions, permissions per role, validations, calculations, notifications (SMS/email), integrations and reports are requirements too when stated as rules.",
    "- Ignore the table of contents, revision history, meeting logs, sign-offs, names of people and page furniture.",
    "- ref: the document's own number or id for the item (\"1.01\", \"FR-12\", \"BR-3\"); null if it has none. Never make one up.",
    "- sourceQuote: copy 6 to 30 CONSECUTIVE words from the text exactly as written (same spelling, same language). It is used to verify the requirement exists, so do not paraphrase it.",
    "- priority: only if the text states one (Must/Should/Could, High/Medium/Low, عالي/متوسط/منخفض); otherwise null.",
    "- confidence: 0..1, how sure you are this is a real, correctly captured requirement.",
    "- issues: vague or unmeasurable wording (fast, user-friendly, مناسب, سريع, حسب الحاجة), TBD items, contradictions, missing error handling / validation / limits / roles / status transitions, and questions the business must answer. Quote the exact text each issue is about.",
    "- Report only issues a tester or analyst would genuinely need answered — at most 8 per part, most important first. A value the text states explicitly (a fixed value, a default, a list of options, 'locked / not editable') is NOT an issue.",
    "Return ONLY JSON, no prose, in this shape:",
    '{"requirements":[{"ref":"1.01"|null,"kind":"epic|user_story|functional|non_functional|business_rule|data|integration|report|constraint","title":"short title","description":"what is required, in full","acceptanceCriteria":["..."],"priority":null,"parentRef":"1"|null,"sourceQuote":"exact words","confidence":0.9}],"issues":[{"kind":"ambiguity|conflict|missing|untestable|question","severity":"high|medium|low","text":"the problem","quote":"exact words","suggestion":"how to fix or what to ask"}]}',
  ].join("\n")
}

export function parseModelJson(text: string): any | null {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf("{")
  if (start > 0) t = t.slice(start)
  try {
    return JSON.parse(t)
  } catch {
    const repaired = repairTruncatedJson(t)
    if (!repaired) return null
    try {
      return JSON.parse(repaired)
    } catch {
      return null
    }
  }
}

/** Rough token count (Arabic ≈ 2.5 chars/token) → an Ollama context size. */
function contextFor(promptChars: number, maxTokens: number) {
  const need = Math.ceil(promptChars / 2.5) + maxTokens + 512
  let ctx = 8192
  while (ctx < need && ctx < 32768) ctx *= 2
  return ctx
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "can", "will", "shall", "must", "not", "all", "any", "has", "have", "into",
  "في", "من", "على", "علي", "الى", "إلى", "عن", "او", "أو", "ان", "أن", "التي", "الذي", "هذا", "هذه", "مع", "كل", "يتم", "لا", "ما", "عند",
])

/** Share of a criterion's words that appear in the source text it came from. */
export function criterionSupport(criterion: string, sourceWords: Set<string>): number {
  const words = normalize(criterion).split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  if (!words.length) return 1
  return words.filter((w) => sourceWords.has(w)).length / words.length
}

export async function analyzeChunk(
  chunk: { text: string; paths: string[] },
  ctx: { projectId: string; language: DocLanguage; system: string }
): Promise<{ drafts: Draft[]; issues: Omit<AnalysisIssue, "id" | "verified" | "relatedKeys">[] }> {
  const prompt = [
    `Sections in this part: ${chunk.paths.join(" | ")}`,
    "Lines starting with ## are the heading path. \"| a | b |\" lines are table rows. \"- \" lines are list items.",
    "-----",
    chunk.text,
    "-----",
    "Return the JSON now.",
  ].join("\n")
  const maxTokens = 7000
  const raw = await chatWithConfiguredProvider({
    system: ctx.system,
    prompt,
    json: true,
    temperature: 0.1,
    maxTokens,
    timeoutMs: CHUNK_TIMEOUT_MS,
    projectId: ctx.projectId,
    command: "analyze-brd",
    contextTokens: contextFor(ctx.system.length + prompt.length, maxTokens),
  })
  const data = parseModelJson(raw)
  if (!data || (typeof data !== "object")) throw new Error("The AI reply wasn't valid JSON")

  // The heading path a requirement sits under: the chunk's section whose
  // title its ref or title appears in, else the chunk's first section.
  const sectionFor = (ref: string | null, title: string) =>
    chunk.paths.find((p) => (ref && p.includes(ref)) || (title && normalize(p).includes(normalize(title)))) ?? chunk.paths[0] ?? ""

  // Criteria must come from this part of the document; ones the model wrote
  // itself (seen in practice: a template row copied onto a one-line rule) are
  // set aside for the reviewer instead of being trusted.
  const sourceWords = new Set(normalize(chunk.text).split(" "))
  const reqs: any[] = Array.isArray(data.requirements) ? data.requirements : []
  const drafts: Draft[] = reqs
    .map((r): Draft | null => {
      const title = str(r?.title, 300)
      const description = str(r?.description, 6000)
      if (!title && !description) return null
      const ref = cleanRef(r?.ref)
      const conf = Number(r?.confidence)
      const criteria = strList(r?.acceptanceCriteria)
      const supported = criteria.filter((c) => criterionSupport(c, sourceWords) >= 0.6)
      const unsupported = criteria.filter((c) => !supported.includes(c))
      return {
        ref,
        kind: toKind(r?.kind),
        title: title || description.slice(0, 160),
        description: description || title,
        acceptanceCriteria: supported,
        ...(unsupported.length ? { unsupportedCriteria: unsupported } : {}),
        priority: toPriority(r?.priority),
        parentRef: cleanRef(r?.parentRef),
        section: sectionFor(ref, title),
        sourceQuote: str(r?.sourceQuote, 600),
        verified: false,
        confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.7,
        language: detectLanguage(`${title} ${description}`),
      }
    })
    .filter((d): d is Draft => d !== null)

  const issues = (Array.isArray(data.issues) ? data.issues : [])
    .map((i: any) => ({
      kind: toIssueKind(i?.kind),
      severity: (["high", "medium", "low"].includes(i?.severity) ? i.severity : "medium") as AnalysisIssue["severity"],
      text: str(i?.text, 1000),
      quote: str(i?.quote, 600),
      section: chunk.paths[0] ?? "",
      suggestion: str(i?.suggestion, 1000),
    }))
    .filter((i: { text: string }) => i.text)
  return { drafts, issues }
}

async function summarize(projectId: string, language: DocLanguage, docOutline: string, candidates: AnalysisCandidate[]) {
  const lang = language === "ar" ? "Arabic" : language === "en" ? "English" : "the document's main language"
  const list = candidates
    .slice(0, 150)
    .map((c) => `${c.key} [${c.kind}] ${c.title}`)
    .join("\n")
  const raw = await chatWithConfiguredProvider({
    system: `You are a senior business analyst reviewing a BRD for testability. Write in ${lang}. Be concrete and brief.`,
    prompt: [
      "Document outline:",
      docOutline.slice(0, 6000),
      "",
      "Requirements extracted:",
      list,
      "",
      `Write: (1) a 2-3 sentence summary of what the system must do; (2) up to 6 bullet points of important things the BRD does not cover (e.g. non-functional requirements, error handling, roles, integrations, reporting) — only gaps you can justify from the outline. Plain text, no JSON.`,
    ].join("\n"),
    maxTokens: 1200,
    temperature: 0.2,
    timeoutMs: 180_000,
    projectId,
    command: "analyze-brd",
    contextTokens: 16384,
  })
  return raw.trim().slice(0, 6000)
}

// ── Running an analysis ──────────────────────────────────────────────────────

/** Starts (or returns the already-running) analysis of a BRD's current version. */
export async function startBrdAnalysis(brdId: string, actor: Actor, opts: { method?: "auto" | "rules" } = {}) {
  const running = await prisma.brdAnalysis.findFirst({
    where: { brdId, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
  })
  if (running && Date.now() - running.updatedAt.getTime() < STALE_AFTER_MS) return { analysis: running, started: false }
  if (running) {
    await prisma.brdAnalysis.update({
      where: { id: running.id },
      data: { status: "failed", error: "Stopped — the server restarted while it was running.", finishedAt: new Date() },
    })
  }

  const analysis = await prisma.brdAnalysis.create({
    data: {
      brdId,
      status: "queued",
      method: opts.method === "rules" ? "rules" : "ai",
      createdById: actor.id,
      createdByName: actor.name || actor.email || null,
    },
  })
  // Runs after the response; progress is polled from the row.
  void runBrdAnalysis(analysis.id).catch(async (e) => {
    console.error("BRD analysis crashed:", e)
    await prisma.brdAnalysis
      .update({ where: { id: analysis.id }, data: { status: "failed", error: String(e?.message || e).slice(0, 1000), finishedAt: new Date() } })
      .catch(() => {})
  })
  return { analysis, started: true }
}

export async function runBrdAnalysis(analysisId: string) {
  const analysis = await prisma.brdAnalysis.findUnique({
    where: { id: analysisId },
    include: { brd: { select: { id: true, projectId: true } } },
  })
  if (!analysis) return
  const { brd } = analysis
  const doc = await loadBrdDocument(brd.id)
  if (!doc || !doc.text.trim()) {
    await prisma.brdAnalysis.update({
      where: { id: analysisId },
      data: { status: "failed", error: "No readable text in this BRD (a scanned PDF needs OCR first).", finishedAt: new Date() },
    })
    return
  }

  const provider = analysis.method === "rules" ? null : await resolveProvider(brd.projectId)
  const index = indexDocument(doc.text)
  let drafts: Draft[] = []
  let rawIssues: Omit<AnalysisIssue, "id" | "verified" | "relatedKeys">[] = []
  let method: "ai" | "rules" = provider ? "ai" : "rules"
  const failures: string[] = []

  if (provider) {
    const chunks = chunkSections(doc.sections, CHUNK_CHARS)
    await prisma.brdAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "running",
        method,
        provider: provider.provider,
        model: provider.model,
        language: doc.language,
        versionNumber: doc.versionNumber,
        totalChunks: chunks.length,
        progress: 0,
      },
    })
    const system = analysisSystemPrompt(doc.language)
    // A local Ollama serves one request at a time; cloud APIs take a few at once.
    const parallel = provider.provider === "Ollama" ? 1 : Number(process.env.BRD_AI_PARALLEL) || 3
    const results: Array<Awaited<ReturnType<typeof analyzeChunk>> | null> = new Array(chunks.length).fill(null)
    let done = 0
    let nextChunk = 0
    const worker = async () => {
      while (nextChunk < chunks.length) {
        const chunk = chunks[nextChunk++]
        for (let attempt = 0; attempt < 2 && !results[chunk.index]; attempt++) {
          try {
            results[chunk.index] = await analyzeChunk(chunk, { projectId: brd.projectId, language: doc.language, system })
          } catch (e: any) {
            if (attempt === 1) failures.push(`${chunk.paths[0] || `part ${chunk.index + 1}`}: ${String(e?.message || e).slice(0, 200)}`)
          }
        }
        await prisma.brdAnalysis.update({ where: { id: analysisId }, data: { progress: ++done } })
      }
    }
    await Promise.all(Array.from({ length: Math.min(parallel, chunks.length) }, worker))
    // Keep document order regardless of which part finished first.
    for (const r of results) if (r) drafts.push(...r.drafts), rawIssues.push(...r.issues)
    if (failures.length === chunks.length) {
      // The provider is unusable (down, wrong key, model missing): say so, and
      // still give the rule-based result rather than nothing.
      method = "rules"
      drafts = []
      rawIssues = []
    }
  } else {
    await prisma.brdAnalysis.update({
      where: { id: analysisId },
      data: { status: "running", method, language: doc.language, versionNumber: doc.versionNumber, totalChunks: 1 },
    })
  }

  if (method === "rules") {
    const res = rulesAnalysis(doc.sections, doc.language)
    drafts = res.drafts
    rawIssues = res.issues
  } else {
    // Completeness: every epic / story / FR heading in the document must come
    // back. Models skip some (epic headings especially); the structure doesn't.
    const structural = rulesAnalysis(doc.sections, doc.language).drafts.filter((d) => d.kind !== "business_rule")
    for (const r of structural) {
      const covered = drafts.some(
        (d) =>
          (d.kind === r.kind || (r.kind !== "epic" && d.kind !== "epic")) &&
          ((r.ref && d.ref === r.ref && similar(d.title, r.title)) || similar(d.title, r.title) || (d.section && d.section === r.section && d.kind === r.kind))
      )
      if (!covered) drafts.push({ ...r, confidence: 0.5 })
    }
  }

  // Grounding: the quote (or, failing that, the title) must be in the document.
  for (const d of drafts) {
    d.verified = isGrounded(d.sourceQuote, index) || isGrounded(d.title, index)
    if (!d.verified) d.confidence = Math.min(d.confidence, 0.3)
  }

  const existing = await prisma.brdRequirement.findMany({
    where: { brdId: brd.id },
    select: { id: true, key: true, title: true, description: true, sourceQuote: true },
  })
  const candidates = mergeAndKey(drafts, existing.map((e) => e.key))
  const issues: AnalysisIssue[] = rawIssues.map((i) => ({
    ...i,
    id: randomUUID(),
    verified: isGrounded(i.quote, index),
    relatedKeys: candidates.filter((c) => i.quote && c.sourceQuote && similar(c.sourceQuote, i.quote)).map((c) => c.key).slice(0, 5),
  }))

  let summary: string | null = null
  if (method === "ai" && candidates.length) {
    summary = await summarize(brd.projectId, doc.language, outline(doc.sections), candidates).catch(() => null)
  }
  const notes: string[] = []
  if (provider && method === "rules") notes.push(`The AI provider failed on every part (${failures[0] ?? "unknown error"}), so this is the rule-based result.`)
  else if (failures.length) notes.push(`${failures.length} part(s) couldn't be analysed: ${failures.join("; ")}`)
  else if (!provider && analysis.method !== "rules") notes.push("No AI provider is set up for this project, so this is the rule-based result.")

  await prisma.brdAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "done",
      method,
      summary,
      candidates: candidates as any,
      issues: issues as any,
      error: notes.join("\n") || null,
      finishedAt: new Date(),
      ...(method === "rules" ? { provider: null, model: null } : {}),
    },
  })
  await brdAudit(
    brd.id,
    "requirements_analyzed",
    `${method === "ai" ? "AI" : "Rule-based"} analysis of v${doc.versionNumber}: ${candidates.length} requirement(s), ${issues.length} issue(s)`,
    { id: analysis.createdById || "system", name: analysis.createdByName }
  ).catch(() => {})
}

// ── Applying reviewed suggestions ────────────────────────────────────────────

/** Requirements found automatically before origins were tracked, or by a scan. */
function isAutoFound(r: { origin: string | null; sourceVersionNumber: number | null }) {
  return r.origin === "rules" || r.origin === "ai" || (r.origin === null && r.sourceVersionNumber !== null)
}

export async function applyBrdAnalysis(
  analysisId: string,
  candidateIds: string[],
  opts: { replaceAutoFound?: boolean },
  actor: Actor
) {
  const analysis = await prisma.brdAnalysis.findUnique({ where: { id: analysisId } })
  if (!analysis || (analysis.status !== "done" && analysis.status !== "applied")) {
    throw new Error("This analysis isn't finished")
  }
  const all = ((analysis.candidates as unknown as AnalysisCandidate[]) || [])
  const chosen = all.filter((c) => candidateIds.includes(c.id))
  const existing = await prisma.brdRequirement.findMany({
    where: { brdId: analysis.brdId },
    include: { _count: { select: { testCases: true } } },
    orderBy: { orderIndex: "asc" },
  })
  const matched = matchExisting(chosen, existing)

  let removed = 0
  if (opts.replaceAutoFound) {
    const keepIds = new Set(matched.map((m) => m.existingId).filter(Boolean) as string[])
    const stale = existing.filter((r) => isAutoFound(r) && r._count.testCases === 0 && !keepIds.has(r.id))
    if (stale.length) {
      removed = (await prisma.brdRequirement.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } })).count
    }
  }

  const remainingKeys = new Set(
    (await prisma.brdRequirement.findMany({ where: { brdId: analysis.brdId }, select: { key: true } })).map((r) => r.key.toUpperCase())
  )
  let order = existing.length
  let added = 0
  let updated = 0
  const requirementIds: string[] = []
  for (const c of matched) {
    const data = {
      title: c.title.slice(0, 300),
      description: c.description,
      type: KIND_LABEL[c.kind].en,
      priority: c.priority,
      acceptanceCriteria: c.acceptanceCriteria as any,
      sourceQuote: c.sourceQuote || null,
      section: c.section || null,
      parentKey: c.parentKey,
      language: c.language,
      confidence: c.confidence,
      origin: analysis.method === "ai" ? "ai" : "rules",
    }
    if (c.existingId) {
      await prisma.brdRequirement.update({ where: { id: c.existingId }, data })
      requirementIds.push(c.existingId)
      updated++
      continue
    }
    let key = c.key
    if (remainingKeys.has(key.toUpperCase())) {
      let i = 2
      while (remainingKeys.has(`${c.key}-${i}`.toUpperCase())) i++
      key = `${c.key}-${i}`
    }
    remainingKeys.add(key.toUpperCase())
    const row = await prisma.brdRequirement.create({
      data: { ...data, brdId: analysis.brdId, key, orderIndex: order++, sourceVersionNumber: analysis.versionNumber },
      select: { id: true },
    })
    requirementIds.push(row.id)
    added++
  }

  await prisma.brdAnalysis.update({ where: { id: analysisId }, data: { status: "applied" } })
  await brdAudit(
    analysis.brdId,
    "requirements_extracted",
    `Added ${added}, updated ${updated}${removed ? `, removed ${removed} earlier auto-found` : ""} from ${analysis.method === "ai" ? "AI" : "rule-based"} analysis`,
    actor
  )
  return { added, updated, removed, requirementIds }
}
