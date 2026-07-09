import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdmin, unauthorizedResponse, badRequestResponse, forbiddenResponse } from "@/lib/api-guards"

// GET /api/admin/transactions - Get all billing/transaction logs (Admin only)
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  try {
    const transactions = await prisma.transaction.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    return NextResponse.json({ transactions })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch transactions" }, { status: 500 })
  }
}

// POST /api/admin/transactions - Simulate a payment / Plan Upgrade transaction
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  try {
    const body = await request.json()
    const { userId, amount, status, plan } = body

    if (!userId || amount === undefined || !plan) {
      return badRequestResponse("UserId, amount, and plan are required")
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return badRequestResponse("User does not exist")
    }

    // Run transaction: update user plan AND log billing transaction
    const [transaction] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          amount: parseFloat(amount),
          status: status || "Success",
          plan
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      }),
      prisma.user.update({
        where: { id: userId },
        // A paid plan clears any trial window so it never auto-downgrades.
        data: { plan, trialEndsAt: null }
      })
    ])

    return NextResponse.json({ transaction, message: "Subscription simulated and transaction logged" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to simulate transaction" }, { status: 500 })
  }
}
