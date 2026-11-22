import { describe, it, expect, vi } from "vitest"
import JSZip from "jszip"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/ai/provider-chat", () => ({ chatWithConfiguredProvider: vi.fn(), resolveProvider: vi.fn(), localAiProvider: vi.fn() }))

import { insertCriteriaIntoDocx, scanParagraphs, findAnchor } from "@/lib/brd/docx-insert"
import { parseDraftReply, fallbackDraft, cleanCriteria } from "@/lib/brd/issue-resolution"
import type { AnalysisIssue } from "@/lib/brd/analysis-types"

const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`
const cell = (t: string) => `<w:tc>${p(t)}</w:tc>`
const BODY = [
  p("1. Introduction"),
  `<w:tbl><w:tr>${cell("معتمد مبدئياً")}${cell("اعتمد الموظف المختص التصميم المبدئي")}</w:tr></w:tbl>`,
  p("The consultant uploads the drawings &amp; waits for review."),
  p("Last paragraph"),
  `<w:sectPr><w:pgSz w:w="11906"/></w:sectPr>`,
].join("")
const DOC = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${BODY}</w:body></w:document>`

async function docx(xml = DOC) {
  const zip = new JSZip()
  zip.file("word/document.xml", xml)
  zip.file("word/styles.xml", "<styles/>")
  return zip.generateAsync({ type: "nodebuffer" })
}
async function bodyOf(buf: Buffer) {
  return (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string")
}

describe("writing acceptance criteria into a Word BRD", () => {
  it("anchors table text after the whole table, other text after its paragraph", () => {
    const paras = scanParagraphs(DOC)
    const tableEnd = DOC.indexOf("</w:tbl>") + "</w:tbl>".length
    expect(findAnchor(paras, "معتمد مبدئياً | اعتمد الموظف المختص التصميم المبدئي")).toBe(tableEnd)
    const after = DOC.indexOf("</w:p>", DOC.indexOf("consultant")) + "</w:p>".length
    expect(findAnchor(paras, "uploads the drawings & waits")).toBe(after)
    expect(findAnchor(paras, "nothing like this anywhere")).toBeNull()
  })

  it("keeps the document and adds the blocks in place, unfound ones before the section settings", async () => {
    const out = await insertCriteriaIntoDocx(await docx(), [
      { quote: "معتمد مبدئياً | اعتمد الموظف المختص التصميم المبدئي", title: "بصفتي موظف", criteria: ["يظهر زر الاعتماد", "a < b & c"] },
      { quote: "not in the document at all", title: "Elsewhere", criteria: ["x"] },
    ])
    expect(out.placedNearQuote).toEqual([true, false])
    const xml = await bodyOf(out.buffer)
    // Original content untouched.
    for (const part of [p("1. Introduction"), p("Last paragraph"), "<w:tbl>"]) expect(xml).toContain(part)
    // Arabic block right after the table, right-to-left, escaped.
    const tbl = xml.indexOf("</w:tbl>")
    expect(xml.indexOf("معايير القبول — بصفتي موظف")).toBeGreaterThan(tbl)
    expect(xml.indexOf("معايير القبول — بصفتي موظف")).toBeLessThan(xml.indexOf("consultant"))
    expect(xml).toContain("<w:bidi/>")
    expect(xml).toContain("• a &lt; b &amp; c")
    // Unfound block at the end, before the final sectPr, under one heading.
    const end = xml.indexOf("Acceptance criteria — Elsewhere")
    expect(end).toBeGreaterThan(xml.indexOf("Last paragraph"))
    expect(end).toBeLessThan(xml.lastIndexOf("<w:sectPr"))
    expect(xml.split("<w:sectPr").length).toBe(2)
  })

  it("refuses a file with no document body", async () => {
    const zip = new JSZip()
    zip.file("x.txt", "hi")
    await expect(insertCriteriaIntoDocx(await zip.generateAsync({ type: "nodebuffer" }), [])).rejects.toThrow(/no document body/)
  })
})

describe("issue criteria drafts", () => {
  it("reads the AI reply, only for the ids it was given", () => {
    const m = parseDraftReply(
      '```json\n{"items":[{"id":"1","title":"As a clerk, I want X","criteria":["1. Shows X","- Hides Y",""]},{"id":"9","title":"t","criteria":["c"]},{"id":"2","title":"","criteria":["c"]}]}\n```',
      ["1", "2"]
    )
    expect(m.get("1")).toEqual({ title: "As a clerk, I want X", criteria: ["Shows X", "Hides Y"] })
    expect(m.has("9")).toBe(false)
    expect(m.has("2")).toBe(false) // no title
  })

  it("starts from the reviewer's suggestion when there is no AI", () => {
    const i = {
      id: "a",
      kind: "untestable",
      severity: "medium",
      text: "The status is unclear.",
      quote: "معتمد مبدئياً | اعتمد الموظف",
      section: "",
      suggestion: "Define who approves. Define what happens next.",
      verified: true,
      relatedKeys: [],
    } as AnalysisIssue
    const d = fallbackDraft(i)
    expect(d.title).toBe("معتمد مبدئياً")
    expect(d.criteria).toEqual(["Define who approves.", "Define what happens next."])
  })

  it("caps and cleans criteria", () => {
    expect(cleanCriteria(Array.from({ length: 12 }, (_, n) => ` ${n + 1}) item `))).toHaveLength(8)
    expect(cleanCriteria("nope")).toEqual([])
  })
})
