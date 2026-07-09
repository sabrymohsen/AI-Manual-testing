import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdmin, unauthorizedResponse, badRequestResponse, forbiddenResponse } from "@/lib/api-guards"
import { hashPassword } from "@/lib/auth"
import { expireDueTrials } from "@/lib/trial"

// GET /api/admin/users - List all users
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  try {
    // Keep plans honest before listing: downgrade any elapsed Pro trials.
    await expireDueTrials()

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        isActive: true,
        trialStartedAt: true,
        trialEndsAt: true,
        createdAt: true,
        _count: {
          select: {
            projects: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    return NextResponse.json({ users })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch users" }, { status: 500 })
  }
}

// POST /api/admin/users - Admin creates a new user
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  try {
    const body = await request.json()
    const { email, password, name, plan, role } = body

    if (!email || !password) {
      return badRequestResponse("Email and password are required")
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return badRequestResponse("Email already registered")
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
        plan: plan || "Free",
        role: role || "User",
        isActive: true
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

    return NextResponse.json({ user, message: "User created successfully" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create user" }, { status: 500 })
  }
}
