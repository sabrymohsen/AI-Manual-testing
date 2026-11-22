import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireBrdTestAccess, brdAudit } from "@/lib/brd/server"
import { generateTestCasesFromRequirements } from "@/lib/ai/test-case-generator"
import { startAiJob } from "@/lib/ai-jobs"
import { impactsFor, mustCover } from "@/lib/brd/impact"
import { buildGenerationContext, asList, type GenReq as Req } from "@/lib/brd/generation-context"
import { loadGate, recordOverride } from "@/lib/brd/questions"
import { questionsFor } from "@/lib/brd/readiness"

const schema = z.object({
  count: z.number().int().min(1).max(10).optional(),
  suiteId: z.string().nullable().optional(),
  /** Run as a background job (202 + job); the page can be left meanwhile. */
  background: z.boolean().optional(),
  /** Proceed although blocking questions are open: records a tester override first. */
  overrideWhy: z.string().trim().min(5).max(2000).optional(),
})

const VALID_PRIORITY = new Set(["Low", "Medium", "High", "Critical"])

/**
 * POST /api/brds/:brdId/requirements/:reqId/generate  { count?, suiteId?, background? }
 *
 * Drafts test cases for one requirement with the project's AI provider and
 * links them to it. They are created as Draft so a tester reviews them before
 * they count as Ready.
 */
export async function POST(request: Request, { params }: { params: { brdId: string; reqId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!

  const req = await prisma.brdRequirement.findFirst({ where: { id: params.reqId, brdId: brd.id } })
  if (!req) return NextResponse.json({ error: "Requirement not found" }, { status: 404 })

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  const { count = 3, suiteId, background, overrideWhy } = parsed.data

  // Readiness gate: no test design while questions that change an expected
  // result are open — unless a tester records an override (who + why).
  let gate = await loadGate(brd.id)
  if (gate.state === "blocked" && overrideWhy) {
    await recordOverride(brd.id, overrideWhy, access.session!.user)
    gate = await loadGate(brd.id)
  }
  if (gate.state === "blocked") {
    return NextResponse.json(
      {
        error: `This BRD isn't ready for test design: ${gate.blocking} open question${gate.blocking === 1 ? "" : "s"} (${gate.blockingKeys.join(", ")}) ${gate.blocking === 1 ? "changes" : "change"} what the tests should expect. Answer them in Questions & readiness, or proceed with a tester override.`,
        code: "GATE_BLOCKED",
        gate,
      },
      { status: 409 }
    )
  }

  if (suiteId) {
    const suite = await prisma.testSuite.findFirst({ where: { id: suiteId, projectId: brd.projectId }, select: { id: true } })
    if (!suite) return NextResponse.json({ error: "Suite not found" }, { status: 400 })
  }

  const user = access.session!.user
  const run = () => generateForRequirement(brd, req, count, suiteId ?? null, user, background ? 600_000 : undefined, gate.state === "override")

  if (background) {
    const job = await startAiJob(
      {
        userId: user.id,
        projectId: brd.projectId,
        kind: "generate-tests",
        title: `Generating ${count} test case${count === 1 ? "" : "s"} for ${req.key}`,
        link: `/projects/${brd.projectId}/brds/${brd.id}?tab=coverage`,
      },
      async () => {
        const out = await run()
        if ("error" in out) throw new Error(out.error)
        return out
      }
    )
    return NextResponse.json({ job }, { status: 202 })
  }

  const out = await run()
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 502 })
  return NextResponse.json(out, { status: 201 })
}

type Brd = { id: string; projectId: string }
async function generateForRequirement(
  brd: Brd,
  req: Req,
  count: number,
  suiteId: string | null,
  user: { id: string; name?: string | null; email?: string },
  timeoutMs?: number,
  override = false
): Promise<
  | { error: string }
  | { testCases: { id: string; title: string }[]; linkedToStory: boolean; regression: number; blocked: number; impactedKeys: string[] }
> {
  const project = await prisma.project.findUnique({ where: { id: brd.projectId }, select: { webAppUrl: true } })
  const arabic = /[؀-ۿ]/.test(`${req.title} ${req.description}`)

  const [all, questions] = await Promise.all([
    prisma.brdRequirement.findMany({
      where: { brdId: brd.id },
      select: { id: true, key: true, title: true, description: true, acceptanceCriteria: true, section: true, parentKey: true, priority: true, status: true },
    }),
    prisma.brdQuestion.findMany({
      where: { brdId: brd.id, status: "Open" },
      select: { key: true, priority: true, status: true, question: true, relatedKeys: true },
    }),
  ])
  const asImpact = (r: (typeof all)[number]) => ({ ...r, acceptanceCriteria: asList(r.acceptanceCriteria) })
  const impacted = mustCover(impactsFor(asImpact(req as any), all.map(asImpact))).slice(0, 3)
  const openQs = questionsFor(req.key, questions)
  const text = buildGenerationContext(req, impacted, openQs, arabic)
  const byKey = new Map(impacted.map((i) => [i.key.toLowerCase(), i.id]))
  const openKeys = new Set(questions.map((q) => q.key.toLowerCase()))

  let generated
  try {
    generated = await generateTestCasesFromRequirements(text, project?.webAppUrl, {
      projectId: brd.projectId,
      testCaseCount: count,
      language: arabic ? "ar" : "en",
      includeNegativeCases: true,
      includeEdgeCases: true,
      userId: user.id,
      timeoutMs,
    })
  } catch (e: any) {
    console.error("BRD test generation failed:", e?.message)
    return {
      error: `The AI couldn't generate test cases${e?.message ? ` (${String(e.message).slice(0, 200)})` : ""}. Check the AI settings and try again.`,
    }
  }
  if (!generated?.length) return { error: "The AI returned no usable test cases. Try again." }

  const tag = req.key.toLowerCase()
  let regression = 0
  let blocked = 0
  // Regression cases may come on top of the requested count (one per impact).
  const limit = count + impacted.length
  const created = await prisma.$transaction(async (tx) => {
    const out: { id: string; title: string }[] = []
    for (const g of generated.slice(0, limit)) {
      const aiTags = (g.tags ?? []).map((t) => String(t).trim()).filter(Boolean)
      const lower = aiTags.map((t) => t.toLowerCase())
      // Regression: tagged so, or tagged with an impacted requirement's key.
      const impactIds = lower.map((t) => byKey.get(t)).filter(Boolean) as string[]
      const isRegression = lower.includes("regression") || impactIds.length > 0
      const blockedBy = aiTags.filter((t) => /^Q-\d+$/i.test(t) && openKeys.has(t.toLowerCase())).map((t) => t.toUpperCase())
      if (isRegression) regression++
      if (blockedBy.length) blocked++
      const extraTags = [
        ...(isRegression ? ["regression"] : []),
        ...(blockedBy.length ? ["blocked-open-question"] : []),
        ...(override ? ["tester-override"] : []),
      ]
      const note = [
        blockedBy.length ? `BLOCKED by open question ${blockedBy.join(", ")}: the expected result is not confirmed yet.` : null,
        override ? "Designed under a tester override of the readiness gate." : null,
      ].filter(Boolean).join(" ")
      const tc = await tx.testCase.create({
        data: {
          projectId: brd.projectId,
          title: (g.title || `${req.key} test`).slice(0, 500),
          priority: (VALID_PRIORITY.has(g.priority) ? g.priority : "Medium") as any,
          preconditions: [note, g.preconditions].filter(Boolean).join("\n") || null,
          source: "AIGenerated",
          executionType: "Manual",
          reviewState: "Draft",
          suiteId: suiteId ?? null,
          tags: Array.from(new Set(["brd", tag, ...extraTags, ...aiTags].map((t) => String(t).slice(0, 40)))).slice(0, 12),
          steps: {
            create: (g.steps ?? []).map((s, i) => ({
              stepNumber: i + 1,
              actionDescription: s.actionDescription || "—",
              expectedResult: s.expectedResult || "",
            })),
          },
          // Linked to this requirement, and a regression case also to the requirement it protects.
          brdRequirementLinks: {
            create: [req.id, ...impactIds.filter((id) => id !== req.id)]
              .filter((id, i, a) => a.indexOf(id) === i)
              .map((requirementId) => ({ requirementId })),
          },
          // Also on the story made from this requirement, so the board shows its tests.
          ...(req.taskId ? { scrumTaskLinks: { create: { taskId: req.taskId } } } : {}),
        },
        select: { id: true, title: true },
      })
      out.push(tc)
    }
    return out
  })

  await brdAudit(
    brd.id,
    "tests_generated",
    `Generated ${created.length} draft test case(s) for ${req.key}${regression ? `, ${regression} regression` : ""}${blocked ? `, ${blocked} blocked by open questions` : ""}${override ? " (tester override)" : ""}`,
    user
  )
  return { testCases: created, linkedToStory: !!req.taskId, regression, blocked, impactedKeys: impacted.map((i) => i.key) }
}
