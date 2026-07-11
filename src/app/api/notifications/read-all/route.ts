import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/api-guards"

// POST /api/notifications/read-all -> mark every unread notification as read
export async function POST() {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.session!.user.id

  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  })

  return NextResponse.json({ ok: true, unreadCount: 0 })
}
