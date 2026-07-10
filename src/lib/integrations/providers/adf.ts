/**
 * Minimal Markdown → Atlassian Document Format (ADF) converter for Jira Cloud v3.
 *
 * Handles the subset the app emits: headings (#/##/###), bullet lists (- ),
 * fenced code blocks (```), blank-line-separated paragraphs with inline **bold**
 * and hard line breaks, and bare links. Not a full CommonMark implementation —
 * good enough for the structured bug/story descriptions we generate.
 */

type AdfNode = Record<string, any>

/** Parse inline **bold** into ADF text nodes; everything else is plain text. */
function inlineNodes(text: string): AdfNode[] {
  const nodes: AdfNode[] = []
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  for (const part of parts) {
    if (!part) continue
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) {
      nodes.push({ type: "text", text: bold[1], marks: [{ type: "strong" }] })
    } else {
      nodes.push({ type: "text", text: part })
    }
  }
  return nodes.length ? nodes : [{ type: "text", text: text || " " }]
}

/** Build a paragraph node from lines, inserting hardBreak between them. */
function paragraph(lines: string[]): AdfNode {
  const content: AdfNode[] = []
  lines.forEach((line, i) => {
    if (i > 0) content.push({ type: "hardBreak" })
    content.push(...inlineNodes(line))
  })
  return { type: "paragraph", content }
}

export function markdownToAdf(md: string): AdfNode {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n")
  const content: AdfNode[] = []
  let i = 0
  let paraBuf: string[] = []

  const flushPara = () => {
    if (paraBuf.length) {
      content.push(paragraph(paraBuf))
      paraBuf = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.trim().startsWith("```")) {
      flushPara()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing fence
      content.push({
        type: "codeBlock",
        content: [{ type: "text", text: codeLines.join("\n") || " " }],
      })
      continue
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushPara()
      content.push({
        type: "heading",
        attrs: { level: Math.min(heading[1].length, 6) },
        content: inlineNodes(heading[2]),
      })
      i++
      continue
    }

    // Bullet list (consecutive "- " lines)
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara()
      const items: AdfNode[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const text = lines[i].replace(/^\s*[-*]\s+/, "")
        items.push({ type: "listItem", content: [paragraph([text])] })
        i++
      }
      content.push({ type: "bulletList", content: items })
      continue
    }

    // Blank line ends a paragraph
    if (line.trim() === "") {
      flushPara()
      i++
      continue
    }

    paraBuf.push(line)
    i++
  }
  flushPara()

  if (content.length === 0) content.push({ type: "paragraph", content: [{ type: "text", text: " " }] })
  return { type: "doc", version: 1, content }
}

/** Extract plain text from an ADF doc (for reading descriptions back on import). */
export function adfToPlainText(adf: any): string {
  if (!adf || typeof adf !== "object") return typeof adf === "string" ? adf : ""
  const out: string[] = []
  const walk = (node: any) => {
    if (!node) return
    if (node.type === "text" && typeof node.text === "string") out.push(node.text)
    if (node.type === "hardBreak") out.push("\n")
    if (Array.isArray(node.content)) {
      node.content.forEach(walk)
      if (["paragraph", "heading", "codeBlock", "listItem"].includes(node.type)) out.push("\n")
    }
  }
  walk(adf)
  return out.join("").replace(/\n{3,}/g, "\n\n").trim()
}
