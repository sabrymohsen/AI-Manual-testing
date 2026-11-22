/**
 * Adds acceptance-criteria blocks to a Word (.docx) BRD without rebuilding it.
 *
 * The document's own XML is kept as it is (tables, images, fonts, numbering)
 * and new paragraphs are spliced in right after the text each block is about:
 * after the paragraph that contains the quote, or after the whole table when
 * the quote is inside one. A block whose quote can't be found goes at the end
 * of the document under one heading.
 */
import JSZip from "jszip"
import { normalize } from "@/lib/brd/text-utils"

export interface CriteriaBlock {
  /** The document text this block is about (the issue's quote). "a | b" = table cells. */
  quote: string
  /** Heading line, e.g. the user story title. */
  title: string
  criteria: string[]
}

export interface InsertResult {
  buffer: Buffer
  /** Per block: placed next to its quote (true) or at the end of the document (false). */
  placedNearQuote: boolean[]
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const xmlUnescape = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")

const hasArabic = (s: string) => /[؀-ۿ]/.test(s)

interface Para {
  /** Offset just after </w:p> — or after the outermost table holding it. */
  anchor: number
  text: string
}

/** Every body paragraph with its plain text and where a block after it would go. */
export function scanParagraphs(xml: string): Para[] {
  const out: Para[] = []
  const tag = /<(\/?)w:(p|tbl|txbxContent)\b[^>]*?(\/?)>/g
  const stack: { name: string; start: number }[] = []
  // Start offset of each open paragraph, and of the outermost open table.
  let outerTblStart = -1
  const pendingInTable: { start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = tag.exec(xml))) {
    const [whole, closing, name, selfClosing] = m
    if (selfClosing) continue
    if (!closing) {
      stack.push({ name, start: m.index })
      if (name === "tbl" && outerTblStart === -1) outerTblStart = m.index
      continue
    }
    // Closing tag: pop to the matching open one.
    let i = stack.length - 1
    while (i >= 0 && stack[i].name !== name) i--
    if (i < 0) continue
    const open = stack[i]
    stack.length = i
    const end = m.index + whole.length
    const inTextBox = stack.some((s) => s.name === "txbxContent")
    if (name === "p" && !inTextBox) {
      if (outerTblStart !== -1) pendingInTable.push({ start: open.start, end })
      else out.push({ anchor: end, text: paraText(xml.slice(open.start, end)) })
    } else if (name === "tbl" && !stack.some((s) => s.name === "tbl")) {
      // The outermost table closed: its paragraphs anchor after it.
      for (const p of pendingInTable) out.push({ anchor: end, text: paraText(xml.slice(p.start, p.end)) })
      pendingInTable.length = 0
      outerTblStart = -1
    }
  }
  return out
}

function paraText(pXml: string): string {
  let t = ""
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(pXml))) t += m[1] !== undefined ? xmlUnescape(m[1]) : " "
  return t
}

/**
 * Where a block about `quote` should go: the paragraph holding the longest
 * part of the quote (table cells are " | "-separated in quotes).
 */
export function findAnchor(paras: Para[], quote: string): number | null {
  const parts = quote
    .split("|")
    .map((p) => normalize(p))
    .filter((p) => p.split(" ").length >= 2)
    .sort((a, b) => b.length - a.length)
  const normParas = paras.map((p) => normalize(p.text))
  for (const part of parts) {
    // Whole part, then its first 8 words (a quote can run past one paragraph).
    const tries = [part, part.split(" ").slice(0, 8).join(" ")]
    for (const t of tries) {
      if (t.split(" ").length < 2) continue
      const i = normParas.findIndex((p) => p.includes(t))
      if (i !== -1) return paras[i].anchor
    }
  }
  return null
}

function paragraph(text: string, opts: { bold?: boolean; color?: string; rtl: boolean; indent?: boolean; spaceBefore?: number }) {
  const pPr = [
    opts.rtl ? "<w:bidi/>" : "",
    `<w:spacing w:before="${opts.spaceBefore ?? 0}" w:after="60"/>`,
    opts.indent ? (opts.rtl ? '<w:ind w:right="360"/>' : '<w:ind w:left="360"/>') : "",
    opts.rtl ? '<w:jc w:val="right"/>' : "",
  ].join("")
  const rPr = [opts.bold ? "<w:b/><w:bCs/>" : "", opts.color ? `<w:color w:val="${opts.color}"/>` : "", opts.rtl ? "<w:rtl/>" : ""].join("")
  return `<w:p><w:pPr>${pPr}</w:pPr><w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`
}

function blockXml(block: CriteriaBlock, rtl: boolean): string {
  const heading = rtl ? `معايير القبول — ${block.title}` : `Acceptance criteria — ${block.title}`
  return [
    paragraph(heading, { bold: true, color: "1F4E79", rtl, spaceBefore: 160 }),
    ...block.criteria.map((c) => paragraph(`• ${c}`, { rtl, indent: true })),
  ].join("")
}

export async function insertCriteriaIntoDocx(buf: Buffer, blocks: CriteriaBlock[], opts: { rtl?: boolean } = {}): Promise<InsertResult> {
  const zip = await JSZip.loadAsync(buf)
  const file = zip.file("word/document.xml")
  if (!file) throw new Error("This Word file has no document body")
  let xml = await file.async("string")

  const paras = scanParagraphs(xml)
  const rtlFor = (b: CriteriaBlock) => opts.rtl ?? hasArabic(`${b.title} ${b.criteria.join(" ")}`)

  const placed: boolean[] = []
  const byAnchor = new Map<number, string[]>()
  const atEnd: string[] = []
  for (const b of blocks) {
    const anchor = b.quote ? findAnchor(paras, b.quote) : null
    placed.push(anchor !== null)
    if (anchor === null) atEnd.push(blockXml(b, rtlFor(b)))
    else byAnchor.set(anchor, [...(byAnchor.get(anchor) ?? []), blockXml(b, rtlFor(b))])
  }

  // Splice from the end so earlier offsets stay valid.
  for (const anchor of Array.from(byAnchor.keys()).sort((a, b) => b - a)) {
    xml = xml.slice(0, anchor) + byAnchor.get(anchor)!.join("") + xml.slice(anchor)
  }

  if (atEnd.length) {
    const rtl = blocks.some(rtlFor)
    const title = paragraph(rtl ? "معايير القبول المضافة أثناء المراجعة" : "Acceptance criteria added in review", {
      bold: true,
      color: "1F4E79",
      rtl,
      spaceBefore: 240,
    })
    // Before the body's final section properties (page size, margins), else before </w:body>.
    const sect = xml.lastIndexOf("<w:sectPr")
    const bodyEnd = xml.lastIndexOf("</w:body>")
    const at = sect !== -1 && sect < bodyEnd ? sect : bodyEnd
    if (at === -1) throw new Error("This Word file has no document body")
    xml = xml.slice(0, at) + title + atEnd.join("") + xml.slice(at)
  }

  zip.file("word/document.xml", xml, { createFolders: false })
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  return { buffer, placedNearQuote: placed }
}
