import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const user = await prisma.user.findUnique({
    where: { id: auth.session!.user.id },
    select: { id: true, email: true, name: true, plan: true, role: true, trialStartedAt: true, trialEndsAt: true },
  })
  if (!user) return unauthorizedResponse("User not found")

  const trialActive = !!user.trialEndsAt && user.trialEndsAt.getTime() > Date.now()
  const trialDaysRemaining = user.trialEndsAt
    ? Math.max(0, Math.ceil((user.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0

  return NextResponse.json({ user: { ...user, trialActive, trialDaysRemaining } })
}
