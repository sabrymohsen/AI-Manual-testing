import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { hashPassword, verifyPassword } from "@/lib/auth"
import { logUserActivity } from "@/lib/user-activity"
import { z } from "zod"

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
})

// POST /api/me/password -> change password (requires the current password)
export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.session!.user.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.errors[0]?.message || "Validation failed"
    return NextResponse.json({ error: first }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
  }

  const passwordHash = await hashPassword(parsed.data.newPassword)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

  logUserActivity(userId, "PASSWORD_CHANGED", "Changed account password")

  return NextResponse.json({ ok: true })
}
