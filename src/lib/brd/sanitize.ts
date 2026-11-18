import createDOMPurify from "dompurify"
// @ts-ignore -- jsdom ships no bundled types; used server-side only (as in docx.ts)
import { JSDOM } from "jsdom"

/**
 * Server-side HTML sanitiser for BRD documents.
 *
 * BRD HTML reaches every project member through dangerouslySetInnerHTML: the
 * editor's HTML was stored exactly as the client sent it, and mammoth passes
 * hyperlink targets from uploaded .docx files straight through. Either path
 * let one user plant script that ran for everyone who opened the document.
 *
 * Everything is cleaned on the way in (save) AND on the way out (preview), so
 * HTML already stored before this fix is safe too.
 */

let purifier: ReturnType<typeof createDOMPurify> | null = null

function getPurifier() {
  if (purifier) return purifier
  const { window } = new JSDOM("")
  purifier = createDOMPurify(window as unknown as Window & typeof globalThis)
  // Links open in a new tab without handing the opener to the target.
  purifier.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("href")) {
      node.setAttribute("target", "_blank")
      node.setAttribute("rel", "noopener noreferrer")
    }
  })
  return purifier
}

/** Document formatting the editor produces; no scripts, frames, forms or event handlers. */
const ALLOWED_TAGS = [
  "p", "br", "hr", "div", "span", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "strike", "del", "ins", "sub", "sup", "mark", "small", "font",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "a", "img", "figure", "figcaption",
]

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "style", "class", "dir", "lang",
  "colspan", "rowspan", "width", "height", "align", "valign", "color", "face", "size",
  "target", "rel", "start", "type",
]

// DOMPurify's default pattern narrowed to http(s)/mailto. The second half
// accepts values with no scheme at all (relative paths, "#anchor", and plain
// attribute values like colspan="2" — DOMPurify runs this regex on those too,
// so a scheme-only pattern silently strips them). javascript:, vbscript: and
// any other "word:" scheme fail. data: images are handled by DOMPurify's own
// DATA_URI_TAGS rule.
const ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

export function sanitizeBrdHtml(html: string): string {
  return getPurifier().sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "button", "svg", "math"],
  }) as string
}
