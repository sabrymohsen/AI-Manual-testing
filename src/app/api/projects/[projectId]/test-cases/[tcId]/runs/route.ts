import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"

/**
 * GET /api/projects/:projectId/test-cases/:tcId/runs?limit=10
 *
 * Execution history for one case — automated runs and manual-session results
 * merged, newest first — with the first failing step of each. Powers the Runs
 * tab, which used to show a "coming in the next pass" note and link to a page
 * that does not exist.
 */
const FAIL = ["Failed", "Blocked"] as const

export async function GET(request: Request, { params }: { params: { projectId: string; tcId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  const tc = await prisma.testCase.findFirst({
    where: { id: params.tcId, projectId: params.projectId },
    select: { id: true },
  })
  if (!tc) return notFoundResponse("Test case not found")

  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 10, 1), 50)

  const [auto, manual, hub] = await Promise.all([
    prisma.testRun.findMany({
      where: { testCaseId: params.tcId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        browserType: true,
        viewport: true,
        triggeredBy: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        createdAt: true,
        stepResults: {
          where: { status: { in: [...FAIL] } },
          orderBy: { stepNumber: "asc" },
          take: 1,
          select: { stepNumber: true, actionDescription: true, actualResult: true, errorDetails: true },
        },
        _count: { select: { bugReports: true } },
      },
    }),
    prisma.manualSessionCase.findMany({
      where: { testCaseId: params.tcId },
      orderBy: { session: { startedAt: "desc" } },
      take: limit,
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        session: {
          select: { id: true, name: true, environment: true, browserType: true, viewport: true, startedAt: true, status: true },
        },
        stepResults: {
          where: { status: { in: [...FAIL] } },
          orderBy: { stepNumber: "asc" },
          take: 1,
          select: { stepNumber: true, actionDescription: true, actualResult: true, notes: true },
        },
      },
    }),
    // Automation Hub runs of scripts linked to this case.
    prisma.testExecution.findMany({
      where: { script: { testCaseLinks: { some: { testCaseId: params.tcId } } }, status: { in: ["Passed", "Failed", "Cancelled"] } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        browser: true,
        duration: true,
        createdAt: true,
        results: true,
        triggeredByName: true,
        script: { select: { name: true } },
      },
    }),
  ])

  const runs = [
    ...auto.map((r) => ({
      id: r.id,
      kind: "Automated" as const,
      status: r.status as string,
      name: `Automated run (${r.triggeredBy})`,
      environment: null as string | null,
      browser: r.browserType,
      viewport: r.viewport,
      at: (r.completedAt ?? r.startedAt ?? r.createdAt).toISOString(),
      durationMs: r.durationMs,
      failedStep: r.stepResults[0]
        ? {
            stepNumber: r.stepResults[0].stepNumber,
            action: r.stepResults[0].actionDescription,
            detail: r.stepResults[0].actualResult || r.stepResults[0].errorDetails || null,
          }
        : null,
      bugCount: r._count.bugReports,
      href: `/projects/${params.projectId}/test-runs/${r.id}/report`,
    })),
    ...manual.map((m) => ({
      id: m.id,
      kind: "Manual" as const,
      status: m.status as string,
      name: m.session.name,
      environment: m.session.environment as string,
      browser: m.session.browserType,
      viewport: m.session.viewport,
      at: (m.completedAt ?? m.startedAt ?? m.session.startedAt).toISOString(),
      durationMs: m.durationMs,
      failedStep: m.stepResults[0]
        ? {
            stepNumber: m.stepResults[0].stepNumber,
            action: m.stepResults[0].actionDescription,
            detail: m.stepResults[0].actualResult || m.stepResults[0].notes || null,
          }
        : null,
      bugCount: null as number | null,
      href: `/projects/${params.projectId}/manual-sessions/${m.session.id}`,
    })),
    ...hub.map((h) => {
      const fail = Array.isArray(h.results) ? (h.results as any[]).find((r) => ["failed", "timedOut", "interrupted"].includes(r.status)) : null
      return {
        id: h.id,
        kind: "Automated" as const,
        status: h.status,
        name: `Automation Hub: ${h.script?.name ?? "script"}`,
        environment: null as string | null,
        browser: h.browser ?? "",
        viewport: "",
        at: new Date(h.createdAt.getTime() + (h.duration ?? 0)).toISOString(),
        durationMs: h.duration ?? 0,
        failedStep: fail ? { stepNumber: 0, action: String(fail.title), detail: fail.error?.message ? String(fail.error.message).split("\n")[0] : null } : null,
        bugCount: null as number | null,
        href: `/projects/${params.projectId}/automation-hub?tab=runs&run=${h.id}`,
      }
    }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)

  return NextResponse.json({ runs })
}
