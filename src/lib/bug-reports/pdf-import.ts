import { PNG } from "pngjs"

/**
 * Read the "تقرير الأخطاء" (bug report) PDFs that the automation runs print
 * from Chromium, and turn every BUG-NN section into a bug draft with its
 * screenshots.
 *
 * The PDF is the only source: the HTML it was printed from and the screenshot
 * folder beside it are usually not sent along, so both the text and the
 * images are read straight out of the PDF.
 *
 * Two things make the text harder than it looks:
 *  1. pdf.js returns one text item per run of glyphs, and diacritics (ُ ّ …)
 *     break a word into several items. Lines are rebuilt from item positions,
 *     right to left, and diacritics are dropped.
 *  2. Chromium draws some Arabic letter pairs as ONE ligature glyph (لا, لأ,
 *     لإ, لم). When pdf.js turns the visual glyph order back into reading
 *     order it reverses characters, not glyphs, so those pairs come out
 *     swapped ("املستفيد" for "المستفيد", "ال يمكن" for "لا يمكن").
 *     fixArabicLigatures() undoes the patterns that are unambiguous; the
 *     import preview lets the tester correct anything left.
 */

export interface ImportedScreenshot {
  /** 1-based index within the bug ("1 من 2"). */
  index: number
  caption: string
  pageUrl: string | null
  fileName: string | null
  png: Buffer
  width: number
  height: number
}

export interface ImportedBug {
  /** The report's own id, e.g. "BUG-01". */
  ref: string
  title: string
  severity: "Critical" | "High" | "Medium" | "Low"
  /** The report's status column ("جديد", "بحاجة لتأكيد"). */
  reportStatus: string
  module: string
  testName: string
  impact: string
  requirementText: string
  requirementRef: string
  expectedResult: string
  actualResult: string
  preconditions: string[]
  steps: string[]
  foundAt: string
  pageUrl: string | null
  screenshots: ImportedScreenshot[]
}

export interface ImportedReport {
  title: string
  subtitle: string
  environment: string
  baseUrl: string
  date: string
  pageCount: number
  bugs: ImportedBug[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const DIACRITICS = /[\u064B-\u0652\u0670\u0640\u0000]/g

/** Undo the swapped ligature pairs (see file comment). Word by word. */
export function fixArabicLigatures(text: string): string {
  return text.replace(/[\u0600-\u06FF]+/g, (w) => {
    if (w === "ال") return "لا"
    if (w === "فال") return "فلا"
    if (w === "وال") return "ولا"
    if (w === "إال") return "إلا"
    if (w === "أال") return "ألا"
    if (w === "لكال") return "لكلا"
    if (KNOWN_WORDS[w]) return KNOWN_WORDS[w]
    const out = (
      w
        // Definite article followed by a lam-alef / lam-meem ligature:
        // "اال" → "الا", "اإل" → "الإ", "األ" → "الأ", "اآل" → "الآ", "امل" → "الم"
        .replace(/^(و|ف|ب|ك)?ا([اإأآم])ل/, "$1ال$2")
        // "ل" + "الأ…" drawn as ل + لأ ligature: "لألقسام" → "للأقسام"
        .replace(/^ل([أإ])ل/, "لل$1")
    )
    return KNOWN_WORDS[out] || out
  })
}

/**
 * Words where a ligature in the middle of the word came out swapped and the
 * swapped form is not itself a word, so the fix is safe. Grown from real
 * reports; anything missing is fixed by hand in the import preview.
 */
const KNOWN_WORDS: Record<string, string> = {
  "خالل": "خلال",
  "الاطالع": "الاطلاع",
  "اطالع": "اطلاع",
  "ثالثة": "ثلاثة",
  "ثالث": "ثلاث",
  "الحقا": "لاحقا",
  "مقفال": "مقفلا",
  "ملدير": "لمدير",
  "ملراجعة": "لمراجعة",
  "ملعالجة": "لمعالجة",
  "مل": "لم",
  "المستخدمني": "المستخدمين",
  "مستخدمني": "مستخدمين",
  "صالحية": "صلاحية",
  "الصالحية": "الصلاحية",
  "صالحيات": "صلاحيات",
  "الصالحيات": "الصلاحيات",
  "بال": "بلا",
  "بدال": "بدلا",
  "عالمة": "علامة",
  "العالمة": "العلامة",
  "إلضافة": "لإضافة",
  "ألن": "لأن",
  "قابلني": "قابلين",
  "الالزمة": "اللازمة",
  "إمالئي": "إملائي",
}

/**
 * Paired punctuation comes out facing the wrong way and on the wrong side of
 * its space: in an RTL line the PDF holds mirrored glyphs, and only some runs
 * get mirrored back. Rather than guess per glyph, rebuild the pairs: in Arabic
 * text the quotes alternate open/close, and so do brackets (they don't nest in
 * these reports). Then put the spaces outside the pair.
 * "تعود» تم إصدار القرار «بعد" → "تعود «تم إصدار القرار» بعد"
 */
export function fixPairedPunctuation(s: string): string {
  if (!/[\u0600-\u06FF]/.test(s)) return s
  const pair = (text: string, chars: RegExp, open: string, close: string) => {
    let isOpen = false
    return text.replace(chars, () => ((isOpen = !isOpen) ? open : close))
  }
  // Latin parentheses ("(PDF0009-v1)") are already right; protect them.
  const latin: string[] = []
  let out = s.replace(/\([A-Za-z0-9][^()\u0600-\u06FF]*\)/g, (m) => {
    latin.push(m)
    return `\u0001${latin.length - 1}\u0001`
  })
  out = pair(out, /[«»]/g, "«", "»")
  out = pair(out, /[()]/g, "(", ")")
  out = out
    .replace(/([«(])\s+/g, "$1")
    .replace(/\s+([»)])/g, "$1")
    .replace(/([^\s«(])([«(])/g, "$1 $2")
    .replace(/([»)])([^\s»).,،؛:!؟*])/g, "$1 $2")
    .replace(/\u0001(\d+)\u0001/g, (_, i) => latin[Number(i)])
  return out.replace(/\s+/g, " ").trim()
}

interface Item {
  str: string
  x: number
  y: number
  w: number
  rtl: boolean
}

interface Line {
  y: number
  /** The line split into cells where the gap is wide (table columns). */
  cells: string[]
  text: string
}

function clean(s: string) {
  return fixArabicLigatures(s.replace(DIACRITICS, "")).replace(/\s+/g, " ").trim()
}

/**
 * Rebuild visual lines. Adjacent left-to-right items (digits of "4.1.6", the
 * letters of a URL) are joined in drawing order first, then every run on the
 * line is placed right to left — the report is an RTL document.
 */
function buildLines(items: Item[]): Line[] {
  const rows: Item[][] = []
  for (const it of items) {
    // Lone diacritics and NUL fillers only split words apart.
    if (!it.str || !it.str.replace(DIACRITICS, "")) continue
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= 2.5)
    if (row) row.push(it)
    else rows.push([it])
  }

  const lines: Line[] = []
  for (const row of rows) {
    // Merge touching LTR items in stream order.
    const runs: Item[] = []
    for (const it of row) {
      const prev = runs[runs.length - 1]
      if (prev && !prev.rtl && !it.rtl && Math.abs(prev.x + prev.w - it.x) < 1.5) {
        prev.str += it.str
        prev.w = it.x + it.w - prev.x
      } else {
        runs.push({ ...it })
      }
    }
    runs.sort((a, b) => b.x + b.w - (a.x + a.w))

    const cells: string[] = []
    let cell = ""
    let leftEdge: number | null = null
    let prevRtl = false
    for (const r of runs) {
      const right = r.x + r.w
      if (leftEdge !== null) {
        const gap = leftEdge - right
        if (gap > 28) {
          cells.push(cell)
          cell = ""
        } else if (gap > (prevRtl && r.rtl ? 3 : 1.2) && !/\s$/.test(cell) && !/^\s/.test(r.str)) {
          cell += " "
        }
      }
      cell += r.str
      leftEdge = r.x
      prevRtl = r.rtl
    }
    cells.push(cell)
    const cleaned = cells.map(clean).filter(Boolean)
    if (cleaned.length) {
      lines.push({ y: row[0].y, cells: cleaned, text: cleaned.join(" ") })
    }
  }
  lines.sort((a, b) => b.y - a.y)
  return lines
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function toPng(img: { width: number; height: number; data: Uint8Array | Uint8ClampedArray; kind?: number }): Buffer | null {
  const { width, height, data } = img
  if (!width || !height || !data) return null
  const png = new PNG({ width, height })
  const px = width * height
  if (data.length >= px * 4) {
    png.data = Buffer.from(data.buffer, data.byteOffset, px * 4)
  } else if (data.length >= px * 3) {
    for (let i = 0, j = 0; i < px; i++, j += 3) {
      png.data[i * 4] = data[j]
      png.data[i * 4 + 1] = data[j + 1]
      png.data[i * 4 + 2] = data[j + 2]
      png.data[i * 4 + 3] = 255
    }
  } else {
    return null
  }
  return PNG.sync.write(png)
}

// ---------------------------------------------------------------------------
// Report structure
// ---------------------------------------------------------------------------

const SEVERITY: Record<string, ImportedBug["severity"]> = {
  "حرجة": "Critical",
  "عالية": "High",
  "متوسطة": "Medium",
  "منخفضة": "Low",
  Critical: "Critical",
  High: "High",
  Medium: "Medium",
  Low: "Low",
}

/** Values of the report's status column. */
const REPORT_STATUSES = ["بحاجة لتأكيد", "جديد", "مؤكد", "مفتوح", "معاد فتحه", "قيد المراجعة"]

const HEADINGS = {
  impact: "أثر المشكلة على العمل",
  requirement: "نص المتطلبات",
  expected: "النتيجة المتوقعة",
  actual: "النتيجة الفعلية",
  preconditions: "الشروط المسبقة",
  steps: "خطوات إعادة المشكلة",
  evidence: "الأدلة",
  reqRef: "مرجع المتطلبات",
  testCase: "حالة الاختبار",
  foundAt: "تاريخ الاكتشاف",
} as const

/** "SHOD · تقرير الأخطاء 4 / 38" page footer, in whatever order it was rebuilt. */
const isFooter = (l: Line) => /\b\d+ \/ \d+\b/.test(l.text) && l.text.includes("تقرير الأخطاء") && l.text.length < 60
const BUG_HEADER = /^(BUG-\d+)\b/
const SHOT_HEADER = /(BUG-\d+)\s*لقطة|لقطة\s*(BUG-\d+)/

interface PageData {
  lines: Line[]
  images: { png: Buffer; width: number; height: number }[]
}

export async function readPages(data: Uint8Array, warnings: string[]): Promise<PageData[]> {
  // The legacy build runs in Node without a worker or a canvas.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const doc = await pdfjs.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise
  const pages: PageData[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items: Item[] = tc.items
      .filter((it: any) => typeof it.str === "string")
      .map((it: any) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        rtl: it.dir === "rtl",
      }))
    const lines = buildLines(items).filter((l) => !isFooter(l))

    const images: PageData["images"] = []
    const ops = await page.getOperatorList()
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue
      const name = ops.argsArray[i][0]
      try {
        const img = await new Promise<any>((resolve) => {
          const objs = name.startsWith("g_") ? page.commonObjs : page.objs
          objs.get(name, resolve)
        })
        const png = img && toPng(img)
        if (png) images.push({ png, width: img.width, height: img.height })
      } catch (e: any) {
        warnings.push(`Page ${p}: could not read an image (${e?.message || e}).`)
      }
    }
    pages.push({ lines, images })
    page.cleanup()
  }
  await doc.destroy()
  return pages
}

/** Text after `label` on the same line, if the label is there. */
function after(line: string, label: string) {
  const i = line.indexOf(label)
  return i === -1 ? null : line.slice(i + label.length).replace(/^[\s:—-]+/, "").trim()
}

function parseBugSection(ref: string, lines: Line[]): Omit<ImportedBug, "screenshots" | "pageUrl"> {
  // Header: "BUG-01 حرجة بحاجة لتأكيد تعديل المستفيد test_tc_…" — one cell or
  // several depending on spacing, so read it as one string.
  let head = lines[0].text.replace(BUG_HEADER, "").trim()
  let testName = (head.match(/\btest_\w+/) || [])[0] || ""
  head = head.replace(testName, "").trim()
  let severity: ImportedBug["severity"] = "Medium"
  const sev = Object.keys(SEVERITY).find((k) => head.startsWith(k))
  if (sev) {
    severity = SEVERITY[sev]
    head = head.slice(sev.length).trim()
  }
  const status = REPORT_STATUSES.find((st) => head.startsWith(st)) || ""
  const reportStatus = status
  const moduleName = head.slice(status.length).trim()

  const title = fixPairedPunctuation(lines[1]?.text || ref)

  // Walk the rest into sections by heading.
  type Key = keyof typeof HEADINGS | "pre"
  const buckets: Record<Key, string[]> = {
    pre: [], impact: [], requirement: [], expected: [], actual: [], preconditions: [],
    steps: [], evidence: [], reqRef: [], testCase: [], foundAt: [],
  }
  let current: Key = "pre"
  let requirementTitle = ""
  const stepCells: string[] = []
  for (const line of lines.slice(2)) {
    const t = line.text
    if (t.includes(HEADINGS.impact)) { current = "impact"; continue }
    if (t.includes(HEADINGS.requirement)) {
      current = "requirement"
      requirementTitle = t.replace(/[—-]?\s*نص المتطلبات\s*/, "").trim()
      continue
    }
    if (t.includes(HEADINGS.expected)) { current = "expected"; continue }
    if (t.includes(HEADINGS.actual)) { current = "actual"; continue }
    if (t.includes(HEADINGS.preconditions)) { current = "preconditions"; continue }
    if (t.includes(HEADINGS.steps)) { current = "steps"; continue }
    const ref2 = after(t, HEADINGS.reqRef)
    if (ref2 !== null) { buckets.reqRef.push(ref2); current = "reqRef"; continue }
    const tcase = after(t, HEADINGS.testCase)
    if (tcase !== null) { if (!testName) testName = tcase; current = "testCase"; continue }
    const found = after(t, HEADINGS.foundAt)
    if (found !== null) { buckets.foundAt.push(found); current = "foundAt"; continue }

    if (current === "steps") {
      // Steps share their rows with the evidence column ("فتح اللقطة", file
      // names). Keep only the cells that are not evidence.
      for (const c of line.cells) {
        if (c === HEADINGS.evidence) continue
        if (/فتح اللقطة|\.png|\.jpe?g|BUG-\d+_/i.test(c)) continue
        stepCells.push(c)
      }
      continue
    }
    if (current === "reqRef") { buckets.reqRef.push(t); continue }
    if (current === "pre" && /يؤكد قبل الإرسال|True|False/.test(t)) continue
    buckets[current].push(t)
  }

  // Step rows look like "<text> 1" or "1 <text>", sometimes with the number
  // on its own row (a long step wrapped). Rebuild them by their numbers.
  const steps: string[] = []
  for (const c of stepCells) {
    if (/^\d{1,2}$/.test(c)) continue // a step number on its own row
    const lead = c.match(/^(\d{1,2})\s+(.+)$/)
    const trail = c.match(/^(.+?)\s+(\d{1,2})$/)
    if (lead) steps.push(lead[2].trim())
    else if (trail) steps.push(trail[1].trim())
    else if (steps.length) steps[steps.length - 1] += " " + c // wrapped step
    else steps.push(c)
  }

  const join = (a: string[]) => fixPairedPunctuation(a.join(" ").replace(/\s+/g, " ").trim())

  return {
    ref,
    title,
    severity,
    reportStatus,
    module: moduleName,
    testName,
    impact: join(buckets.impact),
    requirementText: [requirementTitle, join(buckets.requirement)].filter(Boolean).join("\n"),
    requirementRef: join(buckets.reqRef),
    expectedResult: join(buckets.expected),
    actualResult: join(buckets.actual),
    preconditions: buckets.preconditions.filter(Boolean).map((t) => fixPairedPunctuation(tidyPrecondition(t))),
    steps: steps.filter(Boolean).map(fixPairedPunctuation),
    foundAt: buckets.foundAt[0] || "",
  }
}

/** "البيئةhttps://x — qa :" → "البيئة: qa — https://x" */
function tidyPrecondition(t: string): string {
  const env = t.match(/^البيئة\s*(https?:\/\/\S+)\s*—\s*(\S+)\s*:?$/)
  if (env) return `البيئة: ${env[2]} — ${env[1]}`
  const users = t.match(/^حسابات المستخدمين\s*:?\s*(.+?)\s*:?$/)
  if (users) return `حسابات المستخدمين: ${users[1].replace(/[«»]?\s*:\s*/, "«").replace(/^«?/, "«")}`
  return t
}

export async function parseBugReportPdf(buffer: Buffer | Uint8Array): Promise<ImportedReport> {
  const warnings: string[] = []
  const data = new Uint8Array(buffer)
  const pages = await readPages(data, warnings)

  // Cover page metadata.
  const cover = pages[0]?.lines.map((l) => l.text) || []
  // Labels row "البيئة | التاريخ | …" with the values on the next row.
  const coverLines = pages[0]?.lines || []
  const labelRow = coverLines.findIndex((l) => l.cells[0] === "البيئة")
  const valueRow = labelRow >= 0 ? coverLines[labelRow + 1] : undefined
  const environment = valueRow?.cells[0] || ""
  const date = (valueRow?.text.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || ""
  const title = cover.find((t) => t.startsWith("تقرير الأخطاء")) || "تقرير الأخطاء"
  const titleIdx = cover.indexOf(title)
  const subtitle = titleIdx >= 0 ? cover[titleIdx + 1] || "" : ""
  const baseUrl = cover.find((t) => /^https?:\/\//.test(t)) || ""

  // Split pages into bug sections and screenshot pages.
  const sections = new Map<string, Line[]>()
  const shots = new Map<string, ImportedScreenshot[]>()
  let currentRef: string | null = null

  pages.forEach((page, idx) => {
    if (idx === 0) return
    const first = page.lines[0]?.text || ""
    const shotHeader = page.lines.slice(0, 3).map((l) => l.text).join(" ").match(SHOT_HEADER)

    if (shotHeader && page.images.length) {
      const ref = shotHeader[1] || shotHeader[2]
      const text = page.lines.map((l) => l.text)
      const caption = (text.find((t) => t.includes("لحظة الفشل")) || "")
        .replace(/لحظة الفشل/, "").replace(/شاشة/, "").replace(/[«»]/g, "").trim()
      // The page URL can wrap onto a second line.
      const urlIdx = text.findIndex((t) => /^https?:\/\//.test(t))
      let pageUrl: string | null = null
      if (urlIdx >= 0) {
        pageUrl = text[urlIdx]
        const next = text[urlIdx + 1]
        if (next && /^[\w\-./?=&%#]+$/.test(next)) pageUrl += next
        pageUrl = pageUrl.replace(/\s+/g, "")
      }
      const fileName = (text.join(" ").match(/(BUG-\d+_\d+_[^\s]+?\.png)/) || [])[1] || null
      const list = shots.get(ref) || []
      for (const img of page.images) {
        list.push({ index: list.length + 1, caption, pageUrl, fileName, ...img })
      }
      shots.set(ref, list)
      return
    }

    const header = first.match(BUG_HEADER)
    if (header && Object.keys(SEVERITY).some((k) => first.includes(k))) {
      currentRef = header[1]
      sections.set(currentRef, [...page.lines])
      return
    }

    if (currentRef && !page.lines.some((l) => l.text === "الرقم الخطورة المشكلة الوحدة الحالة")) {
      // Continuation of the current bug (its section wrapped onto this page).
      const isIndex = page.lines.some((l) => /^الأخطاء$/.test(l.text))
      if (!isIndex) sections.get(currentRef)!.push(...page.lines)
    }
  })

  const bugs: ImportedBug[] = []
  for (const [ref, lines] of sections) {
    try {
      const parsed = parseBugSection(ref, lines)
      const screenshots = shots.get(ref) || []
      bugs.push({ ...parsed, screenshots, pageUrl: screenshots[0]?.pageUrl || null })
    } catch (e: any) {
      warnings.push(`${ref}: could not read this section (${e?.message || e}).`)
    }
  }
  bugs.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }))

  if (!bugs.length) {
    warnings.push("No BUG-NN sections were found. Is this a bug report PDF from an automation run?")
  }

  return {
    title,
    subtitle,
    environment,
    baseUrl,
    date,
    pageCount: pages.length,
    bugs,
    warnings,
  }
}

/** Plain-text description used for the bug's "steps" field. */
export function formatSteps(bug: Pick<ImportedBug, "preconditions" | "steps">): string {
  const parts: string[] = []
  if (bug.preconditions.length) {
    parts.push("الشروط المسبقة:\n" + bug.preconditions.map((p) => `- ${p}`).join("\n"))
  }
  if (bug.steps.length) {
    parts.push(bug.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"))
  }
  return parts.join("\n\n")
}
