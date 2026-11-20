import { stepsToPlaywright, type TestData } from "@/lib/plain-english/to-playwright"

/** A no-code Automation Hub test's step, as stored in TestScript.steps. */
export interface HubStep {
  text: string
  expected?: string
}

/** Validates and trims steps sent by the editor; null when the shape is wrong. */
export function cleanSteps(input: unknown): HubStep[] | null {
  if (!Array.isArray(input) || input.length > 300) return null
  const out: HubStep[] = []
  for (const s of input) {
    const text = typeof s === "string" ? s : typeof s?.text === "string" ? s.text : null
    if (text === null) return null
    const t = text.trim().slice(0, 1000)
    if (!t) continue
    const expected = typeof s?.expected === "string" && s.expected.trim() ? s.expected.trim().slice(0, 1000) : undefined
    out.push(expected ? { text: t, expected } : { text: t })
  }
  return out
}

/** Validates a data table ({ columns, rows }); undefined = not sent, null = clear / invalid. */
export function cleanData(input: unknown): TestData | null {
  if (input === null) return null
  const d = input as any
  if (!d || !Array.isArray(d.columns) || !Array.isArray(d.rows) || d.columns.length > 30 || d.rows.length > 200) return null
  const columns = d.columns.map((c: unknown) => String(c ?? "").trim().slice(0, 60))
  const rows = d.rows
    .filter((r: unknown) => Array.isArray(r))
    .map((r: unknown[]) => columns.map((_: string, i: number) => String(r[i] ?? "").slice(0, 2000)))
  if (!columns.some(Boolean) || !rows.length) return null
  return { columns, rows }
}

/** The runnable Playwright file for a steps test. Saved as TestScript.code. */
export function compileHubSteps(name: string, steps: HubStep[], data?: TestData | null) {
  return stepsToPlaywright({ name, steps: steps.map((s) => s.text), data })
}
