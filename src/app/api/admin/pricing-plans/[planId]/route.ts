import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdmin, unauthorizedResponse, badRequestResponse, forbiddenResponse, notFoundResponse } from "@/lib/api-guards"

// PATCH /api/admin/pricing-plans/[planId] - Edit a pricing plan
export async function PATCH(
  request: Request,
  { params }: { params: { planId: string } }
) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  const { planId } = params

  try {
    const plan = await prisma.pricingPlan.findUnique({ where: { id: planId } })
    if (!plan) {
      return notFoundResponse("Pricing plan not found")
    }

    const body = await request.json()
    const { name, price, billingPeriod, features } = body

    const updatedPlan = await prisma.pricingPlan.update({
      where: { id: planId },
      data: {
        ...(name !== undefined && { name }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(billingPeriod !== undefined && { billingPeriod }),
        ...(features !== undefined && { features: Array.isArray(features) ? features : [] })
      }
    })

    return NextResponse.json({ plan: updatedPlan, message: "Pricing plan updated successfully" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update pricing plan" }, { status: 500 })
  }
}

// DELETE /api/admin/pricing-plans/[planId] - Remove a pricing plan
export async function DELETE(
  request: Request,
  { params }: { params: { planId: string } }
) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  const { planId } = params

  try {
    const plan = await prisma.pricingPlan.findUnique({ where: { id: planId } })
    if (!plan) {
      return notFoundResponse("Pricing plan not found")
    }

    await prisma.pricingPlan.delete({ where: { id: planId } })

    return NextResponse.json({ message: "Pricing plan deleted successfully" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete pricing plan" }, { status: 500 })
  }
}
