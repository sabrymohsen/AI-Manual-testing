import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdmin, unauthorizedResponse, badRequestResponse, forbiddenResponse, notFoundResponse } from "@/lib/api-guards"
import { hashPassword } from "@/lib/auth"

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
    const { isActive, plan, role, name, email, password } = body

    if (isActive === false && auth.session.user.id === userId) {
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

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(plan !== undefined && { plan }),
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

  if (auth.session.user.id === userId) {
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
