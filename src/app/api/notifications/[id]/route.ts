import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/api-guards"

// DELETE /api/notifications/:id -> permanently remove a notification
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.session!.user.id

  const result = await prisma.notification.deleteMany({
    where: { id: params.id, userId },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 })
  }

  const unreadCount = await prisma.notification.count({ where: { userId, read: false } })
  return NextResponse.json({ ok: true, unreadCount })
}
