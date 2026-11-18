import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireBrdAccess } from "@/lib/brd/server"
import { diffText, ensureVersionText } from "@/lib/brd/content"

/**
 * GET /api/brds/:brdId/compare?from=<versionId>&to=<versionId>
 *
 * Paragraph diff between two versions — "what changed between v3 and v4, so
 * what do I re-test?". `to` defaults to the current version, `from` to the
 * one before it.
 */
export async function GET(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const brd = access.brd!

  const url = new URL(request.url)
  const versions = await prisma.brdVersion.findMany({
    where: { brdId: brd.id },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  })
  const to = versions.find((v) => v.id === (url.searchParams.get("to") || brd.currentVersionId)) ?? versions[0]
  const from =
    versions.find((v) => v.id === url.searchParams.get("from")) ??
    versions.find((v) => v.versionNumber < (to?.versionNumber ?? 0))
  if (!to || !from) return NextResponse.json({ error: "Need two versions to compare" }, { status: 400 })

  const [a, b] = await Promise.all([ensureVersionText(from.id), ensureVersionText(to.id)])
  const ops = diffText(a, b)
  return NextResponse.json({
    from: from.versionNumber,
    to: to.versionNumber,
    added: ops.filter((o) => o.op === "added").length,
    removed: ops.filter((o) => o.op === "removed").length,
    ops,
    // A scanned PDF has no extractable text, so an empty diff would mislead.
    noText: !a.trim() || !b.trim(),
  })
}
