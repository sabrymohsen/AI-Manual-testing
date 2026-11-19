import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireBrdAccess, requireBrdTestAccess } from "@/lib/brd/server"
import { startBrdAnalysis, matchExisting, STALE_AFTER_MS } from "@/lib/brd/analyze"
import type { AnalysisCandidate, AnalysisIssue, AnalysisView } from "@/lib/brd/analysis-types"

export const dynamic = "force-dynamic"

/**
 * GET  /api/brds/:brdId/analysis — the latest analysis (progress while it
 *      runs; suggestions and issues when done), matched against the
 *      requirements already tracked.
 * POST /api/brds/:brdId/analysis — start one: { method?: "auto" | "rules" }.
 *      Returns the running analysis if there already is one.
 */
export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  let a = await prisma.brdAnalysis.findFirst({ where: { brdId: params.brdId }, orderBy: { createdAt: "desc" } })
  if (!a) return NextResponse.json({ analysis: null })

  // A run whose row stopped moving died with its server process.
  if ((a.status === "running" || a.status === "queued") && Date.now() - a.updatedAt.getTime() > STALE_AFTER_MS) {
    a = await prisma.brdAnalysis.update({
      where: { id: a.id },
      data: { status: "failed", error: "Stopped — the server restarted while it was running. Start it again.", finishedAt: new Date() },
    })
  }

  const existing = await prisma.brdRequirement.findMany({
    where: { brdId: params.brdId },
    select: { id: true, key: true, title: true, description: true, sourceQuote: true },
  })
  const current = await prisma.brdVersion.findFirst({
    where: { id: access.brd!.currentVersionId ?? "" },
    select: { versionNumber: true },
  })

  const view: AnalysisView = {
    id: a.id,
    status: a.status as AnalysisView["status"],
    method: a.method as AnalysisView["method"],
    provider: a.provider,
    model: a.model,
    language: a.language as AnalysisView["language"],
    versionNumber: a.versionNumber,
    progress: a.progress,
    totalChunks: a.totalChunks,
    summary: a.summary,
    candidates: matchExisting(((a.candidates as unknown) as AnalysisCandidate[]) || [], existing),
    issues: ((a.issues as unknown) as AnalysisIssue[]) || [],
    error: a.error,
    createdByName: a.createdByName,
    createdAt: a.createdAt.toISOString(),
    finishedAt: a.finishedAt?.toISOString() ?? null,
    outdated: !!(a.versionNumber && current && current.versionNumber !== a.versionNumber),
  }
  return NextResponse.json({ analysis: view })
}

const startSchema = z.object({ method: z.enum(["auto", "rules"]).optional() }).optional()

export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdTestAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const parsed = startSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const { analysis, started } = await startBrdAnalysis(params.brdId, access.session!.user, { method: parsed.data?.method })
  return NextResponse.json({ id: analysis.id, started }, { status: started ? 202 : 200 })
}
