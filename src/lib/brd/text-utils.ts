/**
 * Text helpers safe to use in the browser and on the server (no fs/prisma).
 */

/** Whitespace/case/punctuation-insensitive form, for "is this text still there?". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‏‎]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}
