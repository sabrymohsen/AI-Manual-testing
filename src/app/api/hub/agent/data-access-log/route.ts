import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"

export const dynamic = "force-dynamic"

// GET /api/hub/agent/data-access-log — recent record of what test data was sent
// to (or withheld from) an AI provider.
export async function GET() {
  // Logs across every user and project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  const rows = await prisma.aiDataAccessLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  })

  return NextResponse.json({
    log: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      dataSummary: r.dataSummary,
      redacted: r.redacted,
      withheld: r.withheld,
      createdAt: r.createdAt
    }))
  })
}
