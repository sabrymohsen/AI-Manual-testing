// @ts-ignore -- jsdom ships no bundled types; used server-side only
import { JSDOM } from "jsdom"
import { Document, Packer, Paragraph, TextRun, HeadingLevel, UnderlineType } from "docx"

const HEADING: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
}

interface RunStyle {
  bold?: boolean
  italics?: boolean
  underline?: boolean
  strike?: boolean
  highlight?: string
}

function runProps(text: string, style: RunStyle) {
  return {
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    highlight: style.highlight as any,
    underline: style.underline ? { type: UnderlineType.SINGLE } : undefined,
  }
}

// Collect the styled text runs inside a block element.
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
    const next: RunStyle = { ...style }
    if (tag === "B" || tag === "STRONG") next.bold = true
    if (tag === "I" || tag === "EM") next.italics = true
    if (tag === "U") next.underline = true
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") next.strike = true
    if (tag === "MARK") next.highlight = "yellow"
    if (tag === "BR") {
      out.push(new TextRun({ break: 1 }))
      return
    }
    collectRuns(child, next, out)
  })
}

/**
 * Minimal but valid HTML → .docx conversion for the BRD editor. Handles
 * headings (h1–h4), paragraphs, bold/italic/underline/strike/mark, and
 * bullet/numbered lists. Complex tables/images are flattened to text — this is
 * a documented fidelity limit, not silent data loss.
 */
export async function htmlToDocxBuffer(html: string): Promise<Buffer> {
  const dom = new JSDOM(`<body>${html || ""}</body>`)
  const body = dom.window.document.body
  const paragraphs: Paragraph[] = []

  const pushBlock = (el: any) => {
    const tag = el.tagName as string
    if (HEADING[tag]) {
      const runs: TextRun[] = []
      collectRuns(el, {}, runs)
      paragraphs.push(new Paragraph({ heading: HEADING[tag], children: runs.length ? runs : [new TextRun("")] }))
      return
    }
    if (tag === "UL" || tag === "OL") {
      el.querySelectorAll("li").forEach((li: any) => {
        const runs: TextRun[] = []
        collectRuns(li, {}, runs)
        paragraphs.push(
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
    // default: paragraph / div / blockquote / anything else
    const runs: TextRun[] = []
    collectRuns(el, {}, runs)
    paragraphs.push(new Paragraph({ children: runs.length ? runs : [new TextRun("")] }))
  }

  Array.from(body.children).forEach((el) => pushBlock(el))
  if (paragraphs.length === 0) {
    // Plain text with no block wrappers.
    paragraphs.push(new Paragraph({ children: [new TextRun(body.textContent || "")] }))
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "brd-numbering",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" as any }],
        },
      ],
    },
    sections: [{ children: paragraphs }],
  })
  return Packer.toBuffer(doc)
}
