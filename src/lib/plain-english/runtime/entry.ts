/**
 * Entry for qa-steps.cjs: the plain-English step runner as one file that
 * generated Playwright tests require. Bundled by scripts/build-steps-runtime.mjs
 * into qa-steps-runtime.generated.ts — run `npm run gen:steps-runtime` after
 * changing the grammar or interpreter (a unit test fails while it's stale).
 */
import type { Page } from "playwright"
import { executePlainEnglishStep, getPlainEnglishContext, setPlainEnglishContext } from "../interpreter"

/** Call once per test: the step list (for dialogs) and starting variables. */
export function setup(page: Page, opts: { steps?: string[]; variables?: Record<string, unknown> } = {}) {
  setPlainEnglishContext(page, {
    steps: (opts.steps || []).map((t, i) => ({ id: `step-${i + 1}`, actionDescription: t })),
    variables: { ...(opts.variables || {}) },
  })
}

/** Run one plain-English step, exactly as QA Engine does. */
export async function step(page: Page, sentence: string, opts: { timeoutMs?: number } = {}) {
  await executePlainEnglishStep(page, { actionDescription: sentence, timeoutMs: opts.timeoutMs })
}

/**
 * Another user's page ("As reviewer: …" steps run in their own browser
 * context): it shares the test's {variables} and settings with `from`.
 */
export function share(from: Page, to: Page) {
  if (from === to) return
  const a = getPlainEnglishContext(from)
  const b = getPlainEnglishContext(to)
  b.variables = a.variables
  b.implicitWaitMs = a.implicitWaitMs
  b.dialogPolicy = a.dialogPolicy
}
