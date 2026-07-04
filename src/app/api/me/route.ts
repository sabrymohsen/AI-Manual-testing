import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const user = await prisma.user.findUnique({
    where: { id: auth.session!.user.id },
    select: { id: true, email: true, name: true, plan: true },
  })
  if (!user) return unauthorizedResponse("User not found")

  return NextResponse.json({ user })
}
