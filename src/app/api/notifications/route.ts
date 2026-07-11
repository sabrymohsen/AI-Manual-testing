import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/api-guards"

// GET /api/notifications?page=&limit=          -> paginated list + unread count
// GET /api/notifications?unread=true           -> unread count only
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.session!.user.id

  const url = new URL(request.url)

  if (url.searchParams.get("unread") === "true") {
    const count = await prisma.notification.count({ where: { userId, read: false } })
    return NextResponse.json({ unreadCount: count })
  }

  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")))
  const onlyUnread = url.searchParams.get("filter") === "unread"

  const where = { userId, ...(onlyUnread ? { read: false } : {}) }

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, read: false } }),
  ])

  return NextResponse.json({
    notifications: items,
    unreadCount,
    page,
    hasMore: page * limit < total,
  })
}
