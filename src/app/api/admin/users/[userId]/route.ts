import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdmin, unauthorizedResponse, badRequestResponse, forbiddenResponse, notFoundResponse } from "@/lib/api-guards"
import { hashPassword } from "@/lib/auth"
import { getTrialDays } from "@/lib/settings"
import { daysToDate } from "@/lib/trial"

// PATCH /api/admin/users/[userId] - Toggle isActive or change Plan/Role
export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  const { userId } = params

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return notFoundResponse("User not found")
    }

    const body = await request.json()
    const { isActive, plan, role, name, email, password, extendDays, reactivateTrial } = body

    if (isActive === false && auth.session!.user.id === userId) {
      return badRequestResponse("Cannot deactivate your own admin account")
    }

    if (email !== undefined && email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) {
        return badRequestResponse("Email already registered to another user")
      }
    }

    if (password !== undefined && String(password).length < 6) {
      return badRequestResponse("Password must be at least 6 characters")
    }

    // Trial operations take priority over a raw `plan` change. A manual plan
    // assignment (paid grant / manual downgrade) always clears the trial so the
    // account never auto-downgrades again.
    const trialData: { plan?: "Free" | "Pro"; trialStartedAt?: Date | null; trialEndsAt?: Date | null } = {}
    if (reactivateTrial) {
      const days = await getTrialDays()
      trialData.plan = "Pro"
      trialData.trialStartedAt = new Date()
      trialData.trialEndsAt = daysToDate(days)
    } else if (extendDays !== undefined) {
      const n = Number(extendDays)
      if (!Number.isFinite(n) || n <= 0) {
        return badRequestResponse("extendDays must be a positive number")
      }
      // Extend from the later of now / current end so an expired trial revives.
      const base = user.trialEndsAt && user.trialEndsAt.getTime() > Date.now() ? user.trialEndsAt : new Date()
      trialData.plan = "Pro"
      trialData.trialEndsAt = daysToDate(n, base)
    } else if (plan !== undefined) {
      trialData.plan = plan
      trialData.trialEndsAt = null
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...trialData,
        ...(role !== undefined && { role }),
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(password !== undefined && { passwordHash: await hashPassword(password) })
      },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        isActive: true,
        trialStartedAt: true,
        trialEndsAt: true,
        createdAt: true
      }
    })

    return NextResponse.json({ user: updatedUser, message: "User updated successfully" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update user" }, { status: 500 })
  }
}

// DELETE /api/admin/users/[userId] - Hard delete user
export async function DELETE(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  const { userId } = params

  if (auth.session!.user.id === userId) {
    return badRequestResponse("Cannot delete your own admin account")
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return notFoundResponse("User not found")
    }

    await prisma.user.delete({ where: { id: userId } })

    return NextResponse.json({ message: "User deleted successfully" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete user" }, { status: 500 })
  }
}
