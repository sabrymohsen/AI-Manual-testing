// @ts-ignore -- jsdom ships no bundled types; used server-side only
import { JSDOM } from "jsdom"

/**
 * A BRD as sections that keep its structure: heading path, paragraphs, lists
 * and — most important — tables as rows.
 *
 * Plain-text extraction flattens a Word table into one cell per line, so a
 * field table ("field | type | mandatory | business rule") became a column of
 * unrelated words and its rules were lost before any analysis ran. Real BRDs
 * (the Arabic ones especially) put most of their rules in those tables.
 */

export interface BrdSection {
  /** Headings from the top of the document down to this section. */
  path: string[]
  level: number
  title: string
  /** Markdown-ish body: paragraphs, "- " list items, "| a | b |" table rows. */
  body: string
}

// Lines of a table of contents: "Title<TAB>12" or "Title ........ 12".
const TOC_LINE = /(\t\s*\d{1,4}\s*$)|(\.{3,}\s*\d{1,4}\s*$)/

/**
 * Text that opens a section even when the author styled it as a bold
 * paragraph instead of a Word heading — and the only heading signal in a PDF.
 */
const HEADING_PATTERNS: Array<{ re: RegExp; level: number }> = [
  { re: /^\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:الملحمة|ملحمة)\s*[:：-]/, level: 2 },
  { re: /^\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:Epic|EPIC)\b\s*[:：-]/, level: 2 },
  { re: /^\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:قصة المستخدم|قصه المستخدم)\s*[:：-]?/, level: 3 },
  { re: /^\s*(?:\d+(?:\.\d+)*\.?\s*)?(?:User Story|USER STORY)\b\s*[:：-]?/, level: 3 },
  { re: /^\s*(?:FR|NFR|BR|REQ|UC|US)[-_ ]?\d+(?:\.\d+)*\s*[:：-]/i, level: 3 },
]

export function headingLevelOf(line: string): number | null {
  if (line.length > 200) return null
  for (const h of HEADING_PATTERNS) if (h.re.test(line)) return h.level
  return null
}

const clean = (s: string) =>
  s
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim()

class Builder {
  sections: BrdSection[] = []
  private stack: { level: number; title: string }[] = []
  private lines: string[] = []
  private current: { level: number; title: string } = { level: 0, title: "" }

  heading(level: number, title: string) {
    this.flush()
    while (this.stack.length && this.stack[this.stack.length - 1].level >= level) this.stack.pop()
    this.stack.push({ level, title })
    this.current = { level, title }
  }

  line(text: string) {
    if (text) this.lines.push(text)
  }

  flush() {
    const body = this.lines.join("\n").trim()
    if (body || this.current.title) {
      this.sections.push({
        path: this.stack.map((s) => s.title),
        level: this.current.level,
        title: this.current.title,
        body,
      })
    }
    this.lines = []
  }

  done(): BrdSection[] {
    this.flush()
    // Drop heading-only sections that are just a table of contents or a title page.
    return this.sections.filter((s) => s.body || s.level > 0)
  }
}

/** Sections from Word/editor HTML. Images and anchors are ignored. */
export function sectionsFromHtml(html: string): BrdSection[] {
  // Inline images (base64) can be most of a Word file's HTML; they carry no text.
  const slim = html.replace(/<img\b[^>]*>/gi, "")
  const document: Document = new JSDOM(`<body>${slim}</body>`).window.document
  const b = new Builder()

  const textOf = (el: Element) => clean(el.textContent || "")

  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      const t = textOf(el)
      if (t && !TOC_LINE.test(el.textContent || "")) b.heading(Number(tag[1]), t)
      return
    }
    if (tag === "table") {
      for (const tr of Array.from(el.querySelectorAll("tr"))) {
        // Only this table's own cells, not a nested table's.
        if (tr.closest("table") !== el) continue
        const cells = Array.from(tr.children)
          .filter((c) => /^t[dh]$/i.test(c.tagName))
          .map((c) => {
            const t = textOf(c).replace(/\|/g, "/")
            // Word tick boxes are often a bulleted empty item whose bullet is a
            // Wingdings ✓ — the text is empty but the cell means "yes"
            // (e.g. the "mandatory" column of a field table).
            if (!t && c.querySelector("li")) return "✓"
            return t
          })
        if (cells.some(Boolean)) b.line(`| ${cells.join(" | ")} |`)
      }
      b.line("")
      return
    }
    if (tag === "ul" || tag === "ol") {
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== "li") continue
        const own = Array.from(li.childNodes)
          .filter((n) => !(n.nodeType === 1 && /^(ul|ol)$/i.test((n as Element).tagName)))
          .map((n) => n.textContent || "")
          .join(" ")
        const t = clean(own)
        if (t) b.line(`- ${t}`)
        for (const sub of Array.from(li.children)) if (/^(ul|ol)$/i.test(sub.tagName)) walk(sub)
      }
      return
    }
    if (tag === "p") {
      const raw = el.textContent || ""
      if (TOC_LINE.test(raw)) return
      const t = clean(raw)
      if (!t) return
      const level = headingLevelOf(t)
      if (level) b.heading(level, t)
      else b.line(t)
      return
    }
    for (const child of Array.from(el.children)) walk(child)
  }

  for (const child of Array.from(document.body.children)) walk(child)
  return b.done()
}

/** Sections from plain text (PDF). Headings are recognised by their wording. */
export function sectionsFromText(text: string): BrdSection[] {
  const b = new Builder()
  for (const rawLine of text.normalize("NFKC").split(/\r?\n/)) {
    if (TOC_LINE.test(rawLine)) continue
    const line = rawLine.replace(/[ \t]+/g, " ").trim()
    if (!line) continue
    const level = headingLevelOf(line)
    if (level) b.heading(level, line)
    else b.line(line)
  }
  return b.done()
}

export function sectionText(s: BrdSection): string {
  const head = s.path.length ? `## ${s.path.join(" › ")}` : ""
  return [head, s.body].filter(Boolean).join("\n")
}

export interface BrdChunk {
  index: number
  text: string
  /** Heading paths covered, for progress and context. */
  paths: string[]
}

/**
 * Groups sections into chunks of at most `maxChars`, never splitting a section
 * unless it alone is too long — then it is split at line boundaries, repeating
 * its heading so the model always knows which story a table belongs to.
 */
export function chunkSections(sections: BrdSection[], maxChars = 9000): BrdChunk[] {
  const chunks: BrdChunk[] = []
  let buf: string[] = []
  let paths: string[] = []
  let size = 0

  const push = () => {
    if (!buf.length) return
    chunks.push({ index: chunks.length, text: buf.join("\n\n"), paths })
    buf = []
    paths = []
    size = 0
  }

  for (const s of sections) {
    const text = sectionText(s)
    const label = s.path.join(" › ") || "(start of document)"
    if (text.length > maxChars) {
      push()
      const head = s.path.length ? `## ${s.path.join(" › ")} (continued)` : ""
      let part: string[] = []
      let partSize = 0
      for (const line of text.split("\n")) {
        if (partSize + line.length + 1 > maxChars - head.length - 2 && part.length) {
          chunks.push({ index: chunks.length, text: part.join("\n"), paths: [label] })
          part = head ? [head] : []
          partSize = head.length
        }
        part.push(line.slice(0, maxChars - head.length - 2))
        partSize += line.length + 1
      }
      if (part.length) chunks.push({ index: chunks.length, text: part.join("\n"), paths: [label] })
      continue
    }
    if (size + text.length + 2 > maxChars) push()
    buf.push(text)
    paths.push(label)
    size += text.length + 2
  }
  push()
  return chunks
}

/** Headings only — a compact map of the document for the summary pass. */
export function outline(sections: BrdSection[]): string {
  return sections
    .filter((s) => s.title)
    .map((s) => `${"  ".repeat(Math.max(0, s.level - 1))}- ${s.title}`)
    .join("\n")
}
