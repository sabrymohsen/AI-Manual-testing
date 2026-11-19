/**
 * Text helpers safe to use in the browser and on the server (no fs/prisma).
 */

// Harakat, Quranic marks and the superscript alef: they change how a word is
// read, not which word it is, and documents use them inconsistently.
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g
// Tatweel (ـ) only stretches a word for layout: "متـــــطلبات" is "متطلبات".
const TATWEEL = /ـ/g
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g

/**
 * One spelling for the same Arabic word, so text matches however it was typed
 * or exported:
 * - NFKC turns PDF "presentation forms" (ﻣ ﺘ ﻄ) back into ordinary letters
 * - marks and tatweel are removed
 * - أ إ آ ٱ → ا, ى → ي, ة → ه, ؤ → و, ئ → ي
 * - Arabic-Indic digits (٠-٩, ۰-۹) → 0-9
 */
export function normalizeArabic(s: string): string {
  return s
    .normalize("NFKC")
    .replace(ARABIC_MARKS, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
}

/** Whitespace/case/punctuation-insensitive form, for "is this text still there?". */
export function normalize(s: string): string {
  return normalizeArabic(s)
    .toLowerCase()
    .replace(BIDI_MARKS, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export type DocLanguage = "ar" | "en" | "mixed"

/** Dominant script of a text: Arabic, English (Latin), or a real mix of both. */
export function detectLanguage(text: string): DocLanguage {
  const sample = text.slice(0, 200_000)
  const arabic = (sample.match(/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g) || []).length
  const latin = (sample.match(/[A-Za-z]/g) || []).length
  const total = arabic + latin
  if (!total) return "en"
  const share = arabic / total
  if (share >= 0.7) return "ar"
  if (share <= 0.3) return "en"
  return "mixed"
}

/** True when a string is mostly Arabic — for choosing text direction. */
export function isRtl(s: string | null | undefined): boolean {
  if (!s) return false
  return detectLanguage(s) === "ar"
}
