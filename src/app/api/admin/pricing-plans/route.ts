import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdmin, unauthorizedResponse, badRequestResponse, forbiddenResponse, requireAuth } from "@/lib/api-guards"

// GET /api/admin/pricing-plans - Get pricing list options (Open to authenticated users)
export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const plans = await prisma.pricingPlan.findMany({
      orderBy: { price: "asc" }
    })

    return NextResponse.json({ plans })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch pricing plans" }, { status: 500 })
  }
}

// POST /api/admin/pricing-plans - Create a new pricing tier (Admin only)
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  try {
    const body = await request.json()
    const { name, price, billingPeriod, features } = body

    if (!name || price === undefined || !billingPeriod) {
      return badRequestResponse("Name, price and billing period are required")
    }

    const plan = await prisma.pricingPlan.create({
      data: {
        name,
        price: parseFloat(price),
        billingPeriod,
        features: Array.isArray(features) ? features : []
      }
    })

    return NextResponse.json({ plan, message: "Pricing plan created successfully" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create pricing plan" }, { status: 500 })
  }
}
