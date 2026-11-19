import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

import { normalize, normalizeArabic, detectLanguage } from "@/lib/brd/text-utils"
import { sectionsFromHtml, sectionsFromText, chunkSections, sectionText } from "@/lib/brd/structure"
import {
  indexDocument,
  isGrounded,
  mergeAndKey,
  toPriority,
  toKind,
  refFromHeading,
  rulesAnalysis,
  parseModelJson,
  criterionSupport,
} from "@/lib/brd/analyze"

describe("Arabic-aware text matching", () => {
  it("treats tatweel, diacritics and letter variants as the same word", () => {
    expect(normalize("متـــــــطلبات")).toBe(normalize("متطلبات"))
    expect(normalize("مُستخدِم")).toBe("مستخدم") // marks no longer split the word
    expect(normalize("إدارة الإسكان")).toBe(normalize("اداره الاسكان"))
    expect(normalize("المرحلة ٣")).toBe(normalize("المرحله 3"))
  })

  it("turns PDF presentation forms back into ordinary letters", () => {
    // "ﻣﺘﻄﻠﺐ" as some PDFs export it
    expect(normalizeArabic("ﻣﺘﻄﻠﺐ")).toBe("متطلب")
  })

  it("detects the document language", () => {
    expect(detectLanguage("وثيقة متطلبات الأعمال لإدارة الإسكان المؤقت")).toBe("ar")
    expect(detectLanguage("Business requirements for the housing service")).toBe("en")
    expect(detectLanguage("وثيقة متطلبات Business requirements")).toBe("mixed")
  })
})

const ARABIC_HTML = `
<p>الفهرس\t2</p>
<p>المتطلبات الوظيفية\t16</p>
<h2>1. الملحمة : إجرائية طلب إسكان طارئ</h2>
<h3><strong>1.01 قصة المستخدم: طلب سكن طارئ</strong></h3>
<ul><li><strong>بصفتي</strong> باحث بنيابة عن المستفيد</li></ul>
<p><strong>أرغب في</strong> تقديم طلب إسكان طارئ</p>
<ul><li>معايير القبول :</li><li>يقوم النظام بتعبئة بيانات المستفيد تلقائيًا بناء على رقم الهوية</li></ul>
<table>
<tr><td><p>الحقل</p></td><td><p>نوع العنصر</p></td><td><p>إلزامي</p></td><td><p>قواعد العمل</p></td></tr>
<tr><td><p>رقم الهوية</p></td><td><p>حقل رقمي.</p></td><td><ul><li></li></ul></td><td><p>قابل للتعبئة والتعديل</p></td></tr>
<tr><td><p>رقم الهاتف</p></td><td><p>حقل رقمي.</p></td><td></td><td><p>قابل للتعديل</p></td></tr>
</table>
<p>1.02 قصة المستخدم: عرض الطلبات</p>
<p>يجب أن يعرض النظام الطلبات بشكل مناسب.</p>
`

describe("reading a BRD's structure", () => {
  const sections = sectionsFromHtml(ARABIC_HTML)

  it("keeps headings as a path and drops the table of contents", () => {
    const story = sections.find((s) => s.title.includes("طلب سكن طارئ"))!
    expect(story.path).toEqual(["1. الملحمة : إجرائية طلب إسكان طارئ", "1.01 قصة المستخدم: طلب سكن طارئ"])
    expect(sections.map(sectionText).join("\n")).not.toContain("الفهرس")
  })

  it("keeps tables as rows and reads a Word tick (empty bullet) as ✓", () => {
    const story = sections.find((s) => s.title.includes("طلب سكن طارئ"))!
    expect(story.body).toContain("| رقم الهوية | حقل رقمي. | ✓ | قابل للتعبئة والتعديل |")
    expect(story.body).toContain("| رقم الهاتف | حقل رقمي. |  | قابل للتعديل |")
  })

  it("treats a story styled as a bold paragraph as a heading", () => {
    expect(sections.some((s) => s.title.startsWith("1.02 قصة المستخدم"))).toBe(true)
  })

  it("finds headings in PDF text by their wording", () => {
    const s = sectionsFromText("Introduction\nEpic: Payments\nUser Story 2.1: Refund an order\nAs a clerk I want to refund\nItem\t7\n")
    // Text before the first heading is an untitled section of its own.
    expect(s.map((x) => x.title).filter(Boolean)).toEqual(["Epic: Payments", "User Story 2.1: Refund an order"])
    expect(s.find((x) => x.title.startsWith("User Story"))!.body).toBe("As a clerk I want to refund")
  })

  it("splits along sections and repeats the heading when one section is too long", () => {
    const big = [{ path: ["Story A"], level: 3, title: "Story A", body: Array.from({ length: 50 }, (_, i) => `| row ${i} | value ${i} |`).join("\n") }]
    const chunks = chunkSections(big, 400)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks[1].text.startsWith("## Story A (continued)")).toBe(true)
    expect(chunks.every((c) => c.text.length <= 400)).toBe(true)
  })
})

describe("checking the AI against the document", () => {
  const doc = indexDocument("يجب أن يقوم النظام بتعبئة اسم المستفيد تلقائيًا بناء على رقم الهوية. The system shall lock the account after five failed attempts.")

  it("accepts a quote copied with small differences", () => {
    expect(isGrounded("يجب ان يقوم النظام بتعبئه اسم المستفيد تلقائيا", doc)).toBe(true)
    expect(isGrounded("the system shall lock the account after five failed attempts", doc)).toBe(true)
  })

  it("rejects text that isn't in the document", () => {
    expect(isGrounded("يجب أن يرسل النظام بريدًا إلكترونيًا للمستفيد عند الاعتماد", doc)).toBe(false)
    expect(isGrounded("The system shall support two-factor authentication", doc)).toBe(false)
    expect(isGrounded("", doc)).toBe(false)
  })
})

describe("normalising model output", () => {
  it("maps stated priorities and ignores missing ones", () => {
    expect(toPriority("Must")).toBe("High")
    expect(toPriority("عالية")).toBe("High")
    expect(toPriority("منخفض")).toBe("Low")
    expect(toPriority(null)).toBeNull()
    expect(toPriority("highlight")).toBe("High") // documented: prefix match on Must/High
  })

  it("maps kinds in either language", () => {
    expect(toKind("user_story")).toBe("user_story")
    expect(toKind("قصة مستخدم")).toBe("user_story")
    expect(toKind("Non-functional")).toBe("non_functional")
    expect(toKind("قاعدة عمل")).toBe("business_rule")
  })

  it("reads the document's own number from a heading, incl. Arabic digits", () => {
    expect(refFromHeading("1.01 قصة المستخدم: طلب")).toBe("1.01")
    expect(refFromHeading("١.٠٢ قصة المستخدم: عرض")).toBe("1.02")
    expect(refFromHeading("FR-12 Login")).toBe("FR-12")
    expect(refFromHeading("قصة المستخدم: بدون رقم")).toBeNull()
  })

  it("recovers JSON wrapped in a code fence or cut off", () => {
    expect(parseModelJson('```json\n{"requirements":[]}\n```')).toEqual({ requirements: [] })
    expect(parseModelJson('{"requirements":[{"title":"a"')?.requirements?.[0]?.title).toBe("a")
    expect(parseModelJson("not json")).toBeNull()
  })
})

describe("merging and keys", () => {
  const base = {
    description: "d",
    acceptanceCriteria: [] as string[],
    priority: null,
    parentRef: null,
    section: "S",
    sourceQuote: "",
    verified: true,
    confidence: 0.8,
    language: "ar" as const,
  }

  it("joins the same story seen by two parts and keeps both sets of criteria", () => {
    const out = mergeAndKey([
      { ...base, ref: "1.01", kind: "user_story", title: "طلب سكن طارئ", acceptanceCriteria: ["أ"] },
      { ...base, ref: "1.01", kind: "user_story", title: "طلب سكن طارئ", acceptanceCriteria: ["أ", "ب"] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe("US-1.01")
    expect(out[0].acceptanceCriteria).toEqual(["أ", "ب"])
  })

  it("never reuses a key when a document repeats a number", () => {
    const out = mergeAndKey(
      [
        { ...base, ref: "1.01", kind: "user_story", title: "طلب سكن طارئ", section: "A" },
        { ...base, ref: "1.01", kind: "user_story", title: "تقديم طلب إسكان مؤقت", section: "B" },
        { ...base, ref: null, kind: "business_rule", title: "rule" },
      ],
      ["BR-1"]
    )
    expect(out.map((c) => c.key)).toEqual(["US-1.01", "US-1.01-2", "BR-2"])
  })

  it("links stories to their epic", () => {
    const out = mergeAndKey([
      { ...base, ref: "1", kind: "epic", title: "Epic one", section: "Epic one" },
      { ...base, ref: "1.01", kind: "user_story", title: "Story", section: "Epic one › Story", parentRef: "1" },
    ])
    expect(out[1].parentKey).toBe(out[0].key)
  })
})

describe("rule-based scan (no AI)", () => {
  it("finds epics, stories with criteria and field rules, and vague wording — in Arabic", () => {
    const { drafts, issues } = rulesAnalysis(sectionsFromHtml(ARABIC_HTML), "ar")
    const story = drafts.find((d) => d.ref === "1.01")!
    expect(story.kind).toBe("user_story")
    expect(story.title).toBe("طلب سكن طارئ")
    expect(story.description).toContain("بصفتي")
    expect(story.acceptanceCriteria).toContain("رقم الهوية — حقل رقمي. — ✓ — قابل للتعبئة والتعديل")
    expect(story.acceptanceCriteria.some((c) => c.startsWith("الحقل"))).toBe(false) // header row skipped
    expect(drafts.find((d) => d.kind === "epic")?.title).toBe("إجرائية طلب إسكان طارئ")
    expect(issues.some((i) => i.quote.includes("بشكل مناسب"))).toBe(true)
  })

  it("works the same for an English BRD", () => {
    const html = `<h2>Epic: Accounts</h2><h3>FR-7: Lock account</h3><p>The system shall lock the account after 5 failed logins.</p>
      <ul><li>Show a clear message</li></ul><h2>Scope</h2><p>The system must respond fast.</p>`
    const { drafts, issues } = rulesAnalysis(sectionsFromHtml(html), "en")
    const fr = drafts.find((d) => d.ref === "FR-7")!
    expect(fr.kind).toBe("functional")
    expect(fr.title).toBe("Lock account")
    expect(drafts.find((d) => d.kind === "business_rule")?.title).toContain("must respond fast")
    expect(issues.some((i) => /fast/.test(i.text))).toBe(true)
  })
})

describe("rule-based scan — requirements written as bullets", () => {
  it("reads numbered requirement bullets and turns questions into issues (English)", () => {
    const html = `<h2>2. Draft Functional Requirements</h2>
      <ul><li>FR-01 Customers can start a return from any delivered order.</li>
      <li>FR-04 A prepaid label is emailed. (TBD: carrier contract)</li>
      <li>NFR-2: Pages load in under 2 seconds.</li></ul>
      <h2>3. Open Questions</h2><ul><li>Is there an exchange flow in phase one, or refund only?</li></ul>`
    const { drafts, issues } = rulesAnalysis(sectionsFromHtml(html), "en")
    const out = mergeAndKey(drafts)
    expect(out.map((c) => [c.key, c.kind])).toEqual([
      ["FR-01", "functional"],
      ["FR-04", "functional"],
      ["NFR-2", "non_functional"],
    ])
    const fr4 = out.find((c) => c.key === "FR-04")!
    expect(fr4.title).toBe("A prepaid label is emailed.")
    expect(fr4.description).toContain("TBD: carrier contract") // kept for the reader
    expect(issues.some((i) => i.kind === "question" && i.text.includes("exchange flow"))).toBe(true)
    expect(issues.some((i) => i.kind === "ambiguity" && /tbd/i.test(i.text))).toBe(true)
  })

  it("reads plain bullets under a requirements heading and one-line stories (Arabic)", () => {
    const html = `<h2>المتطلبات الوظيفية</h2>
      <ul><li>يتمكن الباحث من إرفاق المستندات الداعمة للطلب</li><li>هل يمكن إلغاء الطلب بعد اعتماده؟</li></ul>
      <h2>نطاق العمل</h2><ul><li>بصفتي مستفيد أرغب في متابعة حالة طلبي</li><li>نقطة عامة ليست متطلبا</li></ul>`
    const { drafts, issues } = rulesAnalysis(sectionsFromHtml(html), "ar")
    expect(drafts.map((d) => [d.kind, d.title])).toEqual([
      ["functional", "يتمكن الباحث من إرفاق المستندات الداعمة للطلب"],
      ["user_story", "بصفتي مستفيد أرغب في متابعة حالة طلبي"],
    ])
    expect(issues.some((i) => i.kind === "question" && i.text.includes("إلغاء الطلب"))).toBe(true)
  })

  it("puts requirement bullets inside an epic under that epic", () => {
    const html = `<h2>Epic: Returns</h2><ul><li>FR-7 The customer can print the label again.</li></ul>`
    const out = mergeAndKey(rulesAnalysis(sectionsFromHtml(html), "en").drafts)
    const epic = out.find((c) => c.kind === "epic")!
    expect(out.find((c) => c.key === "FR-7")?.parentKey).toBe(epic.key)
  })
})

describe("acceptance criteria must come from the document", () => {
  const words = (t: string) => new Set(normalize(t).split(" "))

  it("keeps table rows and close paraphrases (Arabic)", () => {
    const src = words("| الحقل | نوع العنصر | إلزامي | قواعد العمل |\n| رقم الهوية | حقل رقمي. | ✓ | قابل تعبئته و التعديل. |\nيقوم النظام بتعبئة بيانات المستفيد تلقائيًا بناء على رقم الهوية")
    expect(criterionSupport("رقم الهوية — حقل رقمي — إلزامي ✓ — قابل للتعبئة والتعديل", src)).toBeGreaterThanOrEqual(0.6)
    expect(criterionSupport("يعبئ النظام بيانات المستفيد تلقائيًا من رقم الهوية", src)).toBeGreaterThanOrEqual(0.6)
  })

  it("rejects criteria the model made up (seen: a template row on a one-line rule)", () => {
    const src = words("FR-02 Eligibility is evaluated per item, not per order.")
    expect(criterionSupport("Item — field — mandatory ✓ — editable", src)).toBeLessThan(0.6)
    expect(criterionSupport("Order — field — optional — editable", src)).toBeLessThan(0.6)
  })
})
