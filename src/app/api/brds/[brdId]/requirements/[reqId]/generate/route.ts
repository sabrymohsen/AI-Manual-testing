import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireBrdTestAccess, brdAudit } from "@/lib/brd/server"
import { generateTestCasesFromRequirements } from "@/lib/ai/test-case-generator"
import { startAiJob } from "@/lib/ai-jobs"

const schema = z.object({
  count: z.number().int().min(1).max(10).optional(),
  suiteId: z.string().nullable().optional(),
  /** Run as a background job (202 + job); the page can be left meanwhile. */
  background: z.boolean().optional(),
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
  const { count = 3, suiteId, background } = parsed.data

  if (suiteId) {
    const suite = await prisma.testSuite.findFirst({ where: { id: suiteId, projectId: brd.projectId }, select: { id: true } })
    if (!suite) return NextResponse.json({ error: "Suite not found" }, { status: 400 })
  }

  const user = access.session!.user
  const run = () => generateForRequirement(brd, req, count, suiteId ?? null, user, background ? 600_000 : undefined)

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
type Req = { id: string; key: string; title: string; description: string; taskId: string | null }

async function generateForRequirement(
  brd: Brd,
  req: Req,
  count: number,
  suiteId: string | null,
  user: { id: string; name?: string | null; email?: string },
  timeoutMs?: number
): Promise<{ error: string } | { testCases: { id: string; title: string }[]; linkedToStory: boolean }> {
  const project = await prisma.project.findUnique({ where: { id: brd.projectId }, select: { webAppUrl: true } })
  const text = `${req.key}: ${req.title}\n\n${req.description}`
  const arabic = /[؀-ۿ]/.test(text)

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
  const created = await prisma.$transaction(async (tx) => {
    const out: { id: string; title: string }[] = []
    for (const g of generated.slice(0, count)) {
      const tc = await tx.testCase.create({
        data: {
          projectId: brd.projectId,
          title: (g.title || `${req.key} test`).slice(0, 500),
          priority: (VALID_PRIORITY.has(g.priority) ? g.priority : "Medium") as any,
          preconditions: g.preconditions || null,
          source: "AIGenerated",
          executionType: "Manual",
          reviewState: "Draft",
          suiteId: suiteId ?? null,
          tags: Array.from(new Set(["brd", tag, ...(g.tags ?? [])].map((t) => String(t).slice(0, 40)))).slice(0, 10),
          steps: {
            create: (g.steps ?? []).map((s, i) => ({
              stepNumber: i + 1,
              actionDescription: s.actionDescription || "—",
              expectedResult: s.expectedResult || "",
            })),
          },
          brdRequirementLinks: { create: { requirementId: req.id } },
          // Also on the story made from this requirement, so the board shows its tests.
          ...(req.taskId ? { scrumTaskLinks: { create: { taskId: req.taskId } } } : {}),
        },
        select: { id: true, title: true },
      })
      out.push(tc)
    }
    return out
  })

  await brdAudit(brd.id, "tests_generated", `Generated ${created.length} draft test case(s) for ${req.key}`, user)
  return { testCases: created, linkedToStory: !!req.taskId }
}
