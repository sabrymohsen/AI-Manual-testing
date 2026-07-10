/**
 * Minimal Markdown → HTML for providers whose rich-text fields take HTML
 * (Azure DevOps System.Description, ClickUp comments). Handles the subset the
 * app emits: headings, bold, fenced code, bullet lists, paragraphs, links.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function inline(text: string): string {
  let t = escapeHtml(text)
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>")
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return t
}

export function markdownToHtml(md: string): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  let i = 0
  let para: string[] = []
  const flush = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join("<br/>")}</p>`)
      para = []
    }
  }
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim().startsWith("```")) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++])
      i++
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`)
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flush()
      const lvl = Math.min(h[1].length, 6)
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`)
      i++
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flush()
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`)
        i++
      }
      out.push(`<ul>${items.join("")}</ul>`)
      continue
    }
    if (line.trim() === "") {
      flush()
      i++
      continue
    }
    para.push(line)
    i++
  }
  flush()
  return out.join("\n")
}

/** Crude HTML → plain text for reading descriptions back on import. */
export function htmlToPlainText(html: string): string {
  if (!html) return ""
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
