import { readFile } from "fs/promises"
import path from "path"
import mammoth from "mammoth"
import { prisma } from "@/lib/db"
import { extractDocument } from "@/lib/ai/document-extractor"
import { STORAGE_ROOT } from "@/lib/brd/server"
import { normalize } from "@/lib/brd/text-utils"

/**
 * BRD content helpers: real file-type detection, plain-text extraction per
 * version (search, compare, change detection) and a paragraph diff.
 */

// ── File type from the bytes, not the browser's claim ────────────────────────

/**
 * Upload used to trust `file.type`, which is whatever the browser (or a
 * crafted request) says. A .docx is a zip containing word/document.xml; a PDF
 * starts with %PDF.
 */
export function sniffBrdType(buf: Buffer): "pdf" | "docx" | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf"
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
  if (isZip && buf.includes(Buffer.from("word/document.xml"))) return "docx"
  return null
}

// ── Text ─────────────────────────────────────────────────────────────────────

export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Plain text of a stored file, or "" when it can't be read. */
export async function extractTextFromBuffer(buf: Buffer, fileType: string): Promise<string> {
  try {
    if (fileType === "docx") return (await mammoth.extractRawText({ buffer: buf })).value.trim()
    const doc = await extractDocument(buf, "file.pdf", "application/pdf")
    return doc.text
  } catch (e: any) {
    console.error("BRD text extraction failed:", e?.message)
    return ""
  }
}

/** Text of a version, extracting and caching it on first use. */
export async function ensureVersionText(versionId: string): Promise<string> {
  const v = await prisma.brdVersion.findUnique({
    where: { id: versionId },
    select: { id: true, textContent: true, contentHtml: true, storagePath: true, fileType: true },
  })
  if (!v) return ""
  if (v.textContent != null) return v.textContent
  let text = ""
  if (v.contentHtml) text = htmlToText(v.contentHtml)
  else {
    try {
      text = await extractTextFromBuffer(await readFile(path.join(STORAGE_ROOT, v.storagePath)), v.fileType)
    } catch {
      text = ""
    }
  }
  await prisma.brdVersion.update({ where: { id: v.id }, data: { textContent: text } })
  return text
}

export { normalize }

// ── Diff ─────────────────────────────────────────────────────────────────────

export type DiffOp = { op: "same" | "added" | "removed"; text: string }

function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Paragraph-level diff (LCS). Paragraphs compare by normalised text, so
 * whitespace-only changes don't show as edits. Capped so a huge document
 * can't take the server down — beyond the cap it falls back to a coarse diff.
 */
export function diffText(a: string, b: string): DiffOp[] {
  const A = paragraphs(a)
  const B = paragraphs(b)
  const na = A.map(normalize)
  const nb = B.map(normalize)

  if (A.length * B.length > 4_000_000) {
    const setB = new Set(nb)
    const setA = new Set(na)
    return [
      ...A.filter((_, i) => !setB.has(na[i])).map((text) => ({ op: "removed" as const, text })),
      ...B.filter((_, i) => !setA.has(nb[i])).map((text) => ({ op: "added" as const, text })),
    ]
  }

  const m = A.length
  const n = B.length
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  const out: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (na[i] === nb[j]) {
      out.push({ op: "same", text: B[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: "removed", text: A[i++] })
    else out.push({ op: "added", text: B[j++] })
  }
  while (i < m) out.push({ op: "removed", text: A[i++] })
  while (j < n) out.push({ op: "added", text: B[j++] })
  return out
}
