// @ts-ignore -- jsdom ships no bundled types; used server-side only
import { JSDOM } from "jsdom"
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
  HeadingLevel,
  UnderlineType,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx"

const HEADING: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
}

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
  left: AlignmentType.LEFT,
}

interface RunStyle {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  strike?: boolean
  highlight?: string
  color?: string
  size?: number // half-points
  font?: string
  subScript?: boolean
  superScript?: boolean
}

function toHex(color: string): string | undefined {
  if (!color) return undefined
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (m) return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")
  const h = color.replace("#", "").trim()
  if (/^[0-9a-f]{6}$/i.test(h)) return h
  if (/^[0-9a-f]{3}$/i.test(h)) return h.split("").map((c) => c + c).join("")
  return undefined
}

// Merge an element's inline style into the accumulating run style.
function applyInlineStyle(el: any, style: RunStyle): RunStyle {
  const next = { ...style }
  const s = el.style
  if (!s) return next
  if (s.fontWeight === "bold" || Number(s.fontWeight) >= 600) next.bold = true
  if (s.fontStyle === "italic") next.italics = true
  if (s.textDecoration?.includes("underline")) next.underline = true
  if (s.textDecoration?.includes("line-through")) next.strike = true
  if (s.color) next.color = toHex(s.color) ?? next.color
  if (s.backgroundColor && s.backgroundColor !== "transparent") next.highlight = "yellow"
  if (s.fontSize) {
    const px = parseFloat(s.fontSize)
    if (px) next.size = Math.round(px * 1.5) // px → half-points
  }
  if (s.fontFamily) next.font = s.fontFamily.split(",")[0].replace(/["']/g, "").trim()
  return next
}

function runProps(text: string, style: RunStyle) {
  return {
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    color: style.color,
    size: style.size,
    font: style.font,
    subScript: style.subScript,
    superScript: style.superScript,
    highlight: style.highlight as any,
    underline: style.underline ? { type: UnderlineType.SINGLE } : undefined,
  }
}

function collectRuns(node: any, style: RunStyle, out: TextRun[]) {
  node.childNodes.forEach((child: any) => {
    if (child.nodeType === 3) {
      const text = child.textContent || ""
      if (text) out.push(new TextRun(runProps(text, style)))
      return
    }
    if (child.nodeType !== 1) return
    const el = child as any
    const tag = el.tagName as string
    let next: RunStyle = { ...style }
    if (tag === "B" || tag === "STRONG") next.bold = true
    if (tag === "I" || tag === "EM") next.italics = true
    if (tag === "U") next.underline = true
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") next.strike = true
    if (tag === "SUB") next.subScript = true
    if (tag === "SUP") next.superScript = true
    if (tag === "MARK") next.highlight = "yellow"
    if (tag === "A") next.color = "0563C1"
    if (tag === "FONT" && el.getAttribute("color")) next.color = toHex(el.getAttribute("color")) ?? next.color
    next = applyInlineStyle(el, next)
    if (tag === "BR") {
      out.push(new TextRun({ break: 1 }))
      return
    }
    collectRuns(child, next, out)
  })
}

function alignOf(el: any) {
  const ta = el?.style?.textAlign
  return ta ? ALIGN[ta] : undefined
}

function paraFromBlock(el: any, extra: any = {}): Paragraph {
  const runs: TextRun[] = []
  collectRuns(el, applyInlineStyle(el, {}), runs)
  return new Paragraph({
    children: runs.length ? runs : [new TextRun("")],
    alignment: alignOf(el),
    ...extra,
  })
}

function buildTable(tableEl: any): Table {
  const rows: TableRow[] = []
  tableEl.querySelectorAll("tr").forEach((tr: any) => {
    const cells: TableCell[] = []
    tr.querySelectorAll("td,th").forEach((td: any) => {
      cells.push(new TableCell({ children: [paraFromBlock(td)] }))
    })
    if (cells.length) rows.push(new TableRow({ children: cells }))
  })
  const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
  })
}

/**
 * HTML → .docx for the BRD editor. Handles headings, paragraphs, alignment,
 * bold/italic/underline/strike, text color, font size/family, highlight,
 * bullet/numbered lists, links (as colored text), horizontal rules, and
 * tables. Images are omitted from the .docx (flattened) — a documented limit.
 */
export async function htmlToDocxBuffer(html: string): Promise<Buffer> {
  const dom = new JSDOM(`<body>${html || ""}</body>`)
  const body = dom.window.document.body
  const blocks: (Paragraph | Table)[] = []

  const pushBlock = (el: any) => {
    const tag = el.tagName as string
    if (HEADING[tag]) {
      blocks.push(paraFromBlock(el, { heading: HEADING[tag] }))
      return
    }
    if (tag === "HR") {
      blocks.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" } } }))
      return
    }
    // Page break (from the editor's page-break element).
    if (tag === "DIV" && el.getAttribute("data-pagebreak")) {
      blocks.push(new Paragraph({ children: [new PageBreak()] }))
      return
    }
    if (tag === "TABLE") {
      try { blocks.push(buildTable(el)) } catch { blocks.push(paraFromBlock(el)) }
      return
    }
    if (tag === "UL" || tag === "OL") {
      el.querySelectorAll(":scope > li").forEach((li: any) => {
        const runs: TextRun[] = []
        collectRuns(li, applyInlineStyle(li, {}), runs)
        blocks.push(
          new Paragraph({
            children: runs.length ? runs : [new TextRun("")],
            ...(tag === "UL"
              ? { bullet: { level: 0 } }
              : { numbering: { reference: "brd-numbering", level: 0 } }),
          })
        )
      })
      return
    }
    blocks.push(paraFromBlock(el)) // p / div / blockquote / pre / anything else
  }

  Array.from(body.children).forEach((el) => pushBlock(el))
  if (blocks.length === 0) blocks.push(new Paragraph({ children: [new TextRun(body.textContent || "")] }))

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "brd-numbering",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT }],
        },
      ],
    },
    sections: [{ children: blocks }],
  })
  return Packer.toBuffer(doc)
}
