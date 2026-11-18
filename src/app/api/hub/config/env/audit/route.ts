import { NextResponse } from "next/server"
import { requireHubAdmin } from "@/lib/hub-access"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

// GET /api/hub/config/env/audit — recent access/change audit trail for env vars
// and secrets (create / update / delete / reveal).
export async function GET() {
  // The secrets audit trail spans every project: admins only.
  const access = await requireHubAdmin()
  if (!access.ok) return access.response

  const rows = await prisma.auditLog.findMany({
    where: { action: { startsWith: "secret." } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true } } },
  })

  // Include env.* actions too for a complete config-access picture.
  const envRows = await prisma.auditLog.findMany({
    where: { action: { startsWith: "env." } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true } } },
  })

  const merged = [...rows, ...envRows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 100)
    .map((r) => ({
      id: r.id,
      action: r.action,
      details: r.details,
      user: r.user?.name || r.user?.email || "Unknown",
      createdAt: r.createdAt,
    }))

  return NextResponse.json({ audit: merged })
}
