"use client"

import { useMemo } from "react"
import { Pencil } from "@/components/ui/icons"
import { cn } from "@/lib/utils"

/**
 * A bug's "how to reproduce" text, laid out as a story: what must be true
 * first, the numbered steps, then the one expected-vs-actual result.
 *
 * The text is stored as one block (stepsToReproduce). Bugs written in the app,
 * imported from PDF or synced from a tracker all follow the same loose shape:
 * an optional description, a "Preconditions:" list, a "Steps:" list of
 * numbered lines. This reads that shape in English and Arabic; anything it
 * doesn't recognise stays as plain description text, so nothing is lost.
 */

export interface ParsedReproduction {
  description: string
  preconditions: string[]
  steps: string[]
  expected?: string
  actual?: string
}

const PRE = /^(pre-?conditions?|before you start|الشروط المسبقة|المتطلبات المسبقة|الشروط)\s*[:：]?\s*$/i
const STEPS = /^(steps?(\s+to\s+reproduce)?|reproduction steps|خطوات(\s+إعادة\s+(المشكلة|الإنتاج|الخطأ))?|الخطوات)\s*[:：]?\s*$/i
const EXPECTED = /^(expected(\s+result)?|النتيجة المتوقعة|المتوقع)\s*[:：]\s*(.*)$/i
const ACTUAL = /^(actual(\s+result)?|النتيجة الفعلية|الفعلي)\s*[:：]\s*(.*)$/i
const NUMBERED = /^\s*(?:\d+|[٠-٩]+)\s*[.)\-–]\s*(.+)$/
const BULLET = /^\s*[-•*·]\s*(.+)$/

export function parseReproduction(text: string | null | undefined): ParsedReproduction {
  const out: ParsedReproduction = { description: "", preconditions: [], steps: [] }
  if (!text?.trim()) return out
  let section: "description" | "pre" | "steps" = "description"
  const desc: string[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (PRE.test(line)) { section = "pre"; continue }
    if (STEPS.test(line)) { section = "steps"; continue }
    const exp = line.match(EXPECTED)
    if (exp) { out.expected = exp[3]?.trim() || out.expected; continue }
    const act = line.match(ACTUAL)
    if (act) { out.actual = act[3]?.trim() || out.actual; continue }

    const numbered = line.match(NUMBERED)
    if (section === "pre") {
      if (numbered && !BULLET.test(line)) { section = "steps"; out.steps.push(numbered[1].trim()); continue }
      out.preconditions.push((line.match(BULLET)?.[1] ?? line).trim())
      continue
    }
    if (section === "steps") {
      if (numbered) out.steps.push(numbered[1].trim())
      else if (out.steps.length) out.steps[out.steps.length - 1] += ` ${line}`
      else out.steps.push((line.match(BULLET)?.[1] ?? line).trim())
      continue
    }
    // Description: numbered lines with no heading are still steps.
    if (numbered) { section = "steps"; out.steps.push(numbered[1].trim()); continue }
    desc.push(line)
  }
  out.description = desc.join("\n")
  // "Open the page — Expected: it loads" (from the step builder) keeps the step text only.
  out.steps = out.steps.map((s) => s.replace(/\s+[—-]\s+Expected:\s+.*$/i, "").trim()).filter(Boolean)
  return out
}

/** Mostly Arabic/Hebrew text reads right to left, numbers on the right. */
function isRtl(text: string) {
  const rtl = (text.match(/[֐-ࣿ]/g) || []).length
  const ltr = (text.match(/[A-Za-z]/g) || []).length
  return rtl > ltr
}

/** Turn bare links in a line into clickable ones. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s«»"'()]+)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline" dir="ltr">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

export function BugReproduction({
  text,
  expected,
  actual,
  onEdit,
  onExpectedChange,
  onActualChange,
  onExpectedBlur,
  onActualBlur,
}: {
  text: string | null | undefined
  expected: string
  actual: string
  onEdit: () => void
  onExpectedChange: (v: string) => void
  onActualChange: (v: string) => void
  onExpectedBlur: () => void
  onActualBlur: () => void
}) {
  const parsed = useMemo(() => parseReproduction(text), [text])
  const rtl = useMemo(() => isRtl(`${text ?? ""} ${expected} ${actual}`), [text, expected, actual])
  const empty = !parsed.description && !parsed.preconditions.length && !parsed.steps.length

  return (
    <section className="space-y-5" dir={rtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between" dir="ltr">
        <h4 className="text-sm font-semibold text-foreground">How to reproduce</h4>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit steps
        </button>
      </div>

      {empty && (
        <button
          type="button"
          onClick={onEdit}
          dir="ltr"
          className="w-full rounded-lg border border-dashed p-4 text-left text-sm text-muted-foreground hover:bg-accent/50"
        >
          No steps yet. Write how to make the bug happen, one numbered step per line.
        </button>
      )}

      {parsed.description && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          <Linkified text={parsed.description} />
        </p>
      )}

      {parsed.preconditions.length > 0 && (
        <div className="rounded-lg bg-muted/60 px-4 py-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{rtl ? "قبل البدء" : "Before you start"}</p>
          <ul className="space-y-1 text-sm leading-relaxed text-foreground">
            {parsed.preconditions.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                <span className="min-w-0 break-words">
                  <Linkified text={p} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.steps.length > 0 && (
        <ol className="space-y-0" aria-label="Steps">
          {parsed.steps.map((s, i) => {
            const last = i === parsed.steps.length - 1
            return (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {/* Connector from this step to the next */}
                {!last && <span className="absolute top-7 h-[calc(100%-1.5rem)] w-px bg-border ltr:left-3 rtl:right-3" aria-hidden />}
                <span
                  className={cn(
                    "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    last ? "bg-rose-500/15 text-rose-700" : "bg-primary/10 text-primary"
                  )}
                >
                  {i + 1}
                </span>
                <p className="min-w-0 pt-0.5 text-sm leading-relaxed text-foreground">
                  <Linkified text={s} />
                </p>
              </li>
            )
          })}
        </ol>
      )}

      {/* The one result of the whole bug */}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            {rtl ? "النتيجة المتوقعة" : "Expected"}
          </span>
          <textarea
            value={expected}
            onChange={(e) => onExpectedChange(e.target.value)}
            onBlur={onExpectedBlur}
            rows={Math.min(8, Math.max(2, Math.ceil((expected.length || 1) / 60)))}
            placeholder={parsed.expected || "What should happen"}
            dir="auto"
            aria-label="Expected result"
            className="w-full resize-y bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </label>
        <label className="block rounded-lg border border-rose-200 bg-rose-50/50 p-3">
          <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-rose-700">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
            {rtl ? "النتيجة الفعلية" : "Actual"}
          </span>
          <textarea
            value={actual}
            onChange={(e) => onActualChange(e.target.value)}
            onBlur={onActualBlur}
            rows={Math.min(8, Math.max(2, Math.ceil((actual.length || 1) / 60)))}
            placeholder={parsed.actual || "What happened instead"}
            dir="auto"
            aria-label="Actual result"
            className="w-full resize-y bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </label>
      </div>
    </section>
  )
}
