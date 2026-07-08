import { NextRequest, NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

// GET /api/hub/config/properties/history?name=<optional>
// Recent property change history, optionally filtered to one property.
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const name = request.nextUrl.searchParams.get("name") || undefined

  const rows = await prisma.propertyHistory.findMany({
    where: name ? { propertyName: name } : undefined,
    orderBy: { changedAt: "desc" },
    take: 100,
  })

  const userIds = Array.from(new Set(rows.map((r) => r.changedBy).filter(Boolean))) as string[]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
    : []
  const byId = new Map(users.map((u) => [u.id, u.name || u.email]))

  return NextResponse.json({
    history: rows.map((r) => ({
      id: r.id,
      propertyName: r.propertyName,
      oldValue: r.oldValue,
      newValue: r.newValue,
      changedBy: r.changedBy ? byId.get(r.changedBy) || "Unknown" : "System",
      changedAt: r.changedAt,
    })),
  })
}
