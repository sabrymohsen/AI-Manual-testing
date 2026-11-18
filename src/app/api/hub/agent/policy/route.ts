import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { requireHubAdmin } from "@/lib/hub-access"
import { getAiPolicy } from "@/lib/hub-ai-providers"

export const dynamic = "force-dynamic"

// GET /api/hub/agent/policy — consent + budget policy.
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  return NextResponse.json({ policy: await getAiPolicy() })
}

// PUT /api/hub/agent/policy — update consent toggles + monthly budget.
export async function PUT(request: NextRequest) {
  // Workspace-wide setting shared by every project: admins only.
  const auth = await requireHubAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => ({}))
    const data: Record<string, any> = {}
    if (body.allowDataAccess !== undefined) data.allowDataAccess = Boolean(body.allowDataAccess)
    if (body.redactSensitive !== undefined) data.redactSensitive = Boolean(body.redactSensitive)
    if (body.monthlyBudgetUsd !== undefined) {
      data.monthlyBudgetUsd = Math.max(0, Math.min(100000, Number(body.monthlyBudgetUsd) || 0))
    }

    await prisma.aiPolicy.upsert({
      where: { id: "ai-policy" },
      update: data,
      create: { id: "ai-policy", ...data }
    })

    return NextResponse.json({ policy: await getAiPolicy() })
  } catch (err: any) {
    console.error("PUT policy error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
