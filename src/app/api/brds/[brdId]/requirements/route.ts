import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireBrdAccess, requireBrdTestAccess, brdAudit } from "@/lib/brd/server"
import { extractBrdRequirements } from "@/lib/brd/lifecycle"

/**
 * GET  /api/brds/:brdId/requirements — requirements with their linked test
 *      cases and a coverage summary (the traceability view).
 * POST /api/brds/:brdId/requirements — { action: "extract" } finds
 *      requirements in the current version; or { title, description, key? }
 *      adds one by hand.
 */
export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const reqs = await prisma.brdRequirement.findMany({
    where: { brdId: params.brdId },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    include: {
      testCases: {
        include: {
          testCase: { select: { id: true, title: true, lastStatus: true, reviewState: true, priority: true } },
        },
        orderBy: { linkedAt: "asc" },
      },
    },
  })

  const live = reqs.filter((r) => r.status !== "removed")
  const verdict = (r: (typeof reqs)[number]) => {
    const cases = r.testCases.map((l) => l.testCase).filter((t) => t.reviewState !== "Deprecated")
    if (!cases.length) return "uncovered"
    if (cases.some((t) => t.lastStatus === "Failed" || t.lastStatus === "Blocked")) return "failing"
    if (cases.every((t) => t.lastStatus === "Passed")) return "passing"
    return "covered"
  }

  const requirements = reqs.map((r) => ({
    id: r.id,
    key: r.key,
    title: r.title,
    description: r.description,
    type: r.type,
    priority: r.priority,
    status: r.status,
    changedInVersion: r.changedInVersion,
    previousText: r.previousText,
    coverage: r.status === "removed" ? "removed" : verdict(r),
    testCases: r.testCases.map((l) => ({
      ...l.testCase,
      needsReview: l.needsReview,
      reviewReason: l.reviewReason,
    })),
  }))

  return NextResponse.json({
    requirements,
    summary: {
      total: live.length,
      covered: requirements.filter((r) => r.status !== "removed" && r.coverage !== "uncovered").length,
      uncovered: requirements.filter((r) => r.coverage === "uncovered").length,
      passing: requirements.filter((r) => r.coverage === "passing").length,
      failing: requirements.filter((r) => r.coverage === "failing").length,
      changed: live.filter((r) => r.status === "changed").length,
      needsReview: reqs.reduce((n, r) => n + r.testCases.filter((l) => l.needsReview).length, 0),
    },
  })
}

const createSchema = z.union([
  z.object({ action: z.literal("extract") }),
  z.object({
    key: z.string().trim().max(40).optional(),
    title: z.string().trim().min(1, "Title is required").max(300),
    description: z.string().trim().max(10000).optional(),
    priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  }),
])

export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const user = access.session!.user

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid" }, { status: 400 })

  if ("action" in parsed.data) {
    const res = await extractBrdRequirements(params.brdId)
    if (res.added) await brdAudit(params.brdId, "requirements_extracted", `Found ${res.added} new requirement(s)`, user)
    return NextResponse.json(res)
  }

  const d = parsed.data
  const count = await prisma.brdRequirement.count({ where: { brdId: params.brdId } })
  let key = d.key?.toUpperCase() || `REQ-${count + 1}`
  for (let i = count + 2; await prisma.brdRequirement.findFirst({ where: { brdId: params.brdId, key } }); i++) {
    key = `REQ-${i}`
  }
  const requirement = await prisma.brdRequirement.create({
    data: {
      brdId: params.brdId,
      key,
      title: d.title,
      description: d.description || d.title,
      priority: d.priority ?? null,
      orderIndex: count,
    },
  })
  await brdAudit(params.brdId, "requirement_added", `${key}: ${d.title}`, user)
  return NextResponse.json({ requirement }, { status: 201 })
}
