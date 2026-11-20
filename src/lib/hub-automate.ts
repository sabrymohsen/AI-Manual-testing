import { prisma } from "@/lib/db"
import { parseStep } from "@/lib/plain-english/grammar"
import { generateStepsFromIntent } from "@/lib/plain-english/ai-authoring"
import { fetchPageOutline } from "@/lib/plain-english/page-outline"
import { compileHubSteps, type HubStep } from "@/lib/hub-steps"
import { HUB_NAME_PATTERN } from "@/lib/hub-scripts"

/**
 * "Automate" a manual test case: make a no-code Automation Hub test from it,
 * linked to the case so each run updates the case's status.
 *
 * Steps already written in plain English are used as they are (no AI, no
 * guessing). Otherwise AI rewrites the manual steps and their expected results
 * as runnable sentences, reading the real page for its labels; every sentence
 * is checked by the grammar, and ones it can't understand are kept and marked
 * for the tester to fix rather than silently dropped.
 */

export const AUTOMATED_FOLDER = "From test cases"

export interface AutomateResult {
  scriptId: string
  name: string
  stepCount: number
  unclear: number
  usedAi: boolean
}

/** A hub test name from a case title (any language), unique in the project. */
export async function automationName(projectId: string, title: string, testCaseId: string): Promise<string> {
  let base = title.replace(/[^\p{L}\p{N}\p{M} _-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 70)
  if (!base || !HUB_NAME_PATTERN.test(base)) base = `Test case ${testCaseId.slice(0, 8)}`
  for (let i = 1; i < 50; i++) {
    const name = i === 1 ? base : `${base} ${i}`.slice(0, 80)
    const clash = await prisma.testScript.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, OR: [{ projectId }, { projectId: null }] },
      select: { id: true },
    })
    if (!clash) return name
  }
  return `${base.slice(0, 60)} ${Date.now() % 100000}`
}

const firstUrl = (texts: string[]) => texts.join(" ").match(/https?:\/\/[^\s"'<>)]+/)?.[0] ?? null

export async function automateTestCase(opts: { projectId: string; testCaseId: string; userId: string }): Promise<AutomateResult> {
  const tc = await prisma.testCase.findFirst({
    where: { id: opts.testCaseId, projectId: opts.projectId },
    include: { steps: { orderBy: { stepNumber: "asc" } }, project: { select: { webAppUrl: true } } },
  })
  if (!tc) throw Object.assign(new Error("Test case not found"), { status: 404 })
  const manual = tc.steps.filter((s) => s.actionDescription?.trim())
  if (!manual.length) throw Object.assign(new Error("This test case has no steps to automate yet."), { status: 400 })

  const startUrl = firstUrl([tc.preconditions || "", ...manual.map((s) => s.actionDescription)]) || tc.project?.webAppUrl || null
  let steps: HubStep[]
  let usedAi = false

  if (manual.every((s) => parseStep(s.actionDescription).ok)) {
    // Already runnable sentences: keep the tester's own words.
    steps = manual.map((s) => ({ text: parseStep(s.actionDescription).text, ...(s.expectedResult?.trim() ? { expected: s.expectedResult.trim() } : {}) }))
  } else {
    usedAi = true
    const written = manual
      .map((s, i) => `${i + 1}. ${s.actionDescription.trim()}${s.expectedResult?.trim() ? `\n   Expected: ${s.expectedResult.trim()}` : ""}`)
      .join("\n")
    const instruction = [
      `Automate this manual test case: "${tc.title}".`,
      tc.preconditions?.trim() ? `Preconditions: ${tc.preconditions.trim()}` : null,
      `Manual steps:\n${written}`,
    ]
      .filter(Boolean)
      .join("\n")
    const outline = startUrl ? await fetchPageOutline(startUrl).catch(() => null) : null
    const res = await generateStepsFromIntent({
      projectId: opts.projectId,
      userId: opts.userId,
      instruction,
      pageOutline: outline,
      pageUrl: startUrl,
      previousSteps: [],
      maxSteps: 40,
      extra: [
        "Follow the manual steps in order; don't invent extra flows.",
        "Turn every 'Expected' line into one or more Verify steps (e.g. Verify that the page contains \"...\"), so the test fails when the expectation isn't met.",
        "Keep the test's language for any text you type or check (Arabic stays Arabic).",
        startUrl ? `Start with: Go to "${startUrl}"` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    })
    steps = res.steps.map((s) => ({ text: s.text }))
  }

  if (startUrl && !steps.some((s) => parseStep(s.text).ok && (parseStep(s.text) as any).command.type === "goto")) {
    steps.unshift({ text: `Go to "${startUrl}"` })
  }

  const name = await automationName(opts.projectId, tc.title, tc.id)
  const code = compileHubSteps(name, steps).code
  const script = await prisma.testScript.create({
    data: {
      name,
      type: "Web",
      mode: "steps",
      steps: steps as any,
      code,
      projectId: opts.projectId,
      folder: AUTOMATED_FOLDER,
      tags: ["automated-from-case"],
      testCaseLinks: { create: { testCaseId: tc.id } },
    },
  })
  return { scriptId: script.id, name, stepCount: steps.length, unclear: steps.filter((s) => !parseStep(s.text).ok).length, usedAi }
}
