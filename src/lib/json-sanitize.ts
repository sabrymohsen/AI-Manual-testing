/**
 * Escapes control characters that occur *inside* JSON strings (raw newlines,
 * tabs) so strict JSON.parse accepts the document. Used for SHAFT trace files
 * and for AI replies, which often put real line breaks inside string values.
 */
export function sanitizeJsonControlChars(input: string): string {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    const code = input.charCodeAt(i)
    if (escaped) {
      out += ch
      escaped = false
      continue
    }
    if (ch === "\\") {
      out += ch
      escaped = inString
      continue
    }
    if (ch === '"') {
      inString = !inString
      out += ch
      continue
    }
    if (inString && code <= 0x1f) {
      if (ch === "\n") out += "\\n"
      else if (ch === "\r") out += "\\r"
      else if (ch === "\t") out += "\\t"
      else out += "\\u" + code.toString(16).padStart(4, "0")
      continue
    }
    out += ch
  }
  return out
}
