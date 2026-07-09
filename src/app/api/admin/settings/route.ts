import { NextResponse } from "next/server"
import { requireAdmin, unauthorizedResponse, forbiddenResponse, badRequestResponse } from "@/lib/api-guards"
import { getTrialDays, setTrialDays } from "@/lib/settings"

// GET /api/admin/settings - Platform settings (admin only)
export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  const trialDays = await getTrialDays()
  return NextResponse.json({ settings: { trialDays } })
}

// PATCH /api/admin/settings - Update platform settings (admin only)
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) {
    if (auth.status === 401) return unauthorizedResponse(auth.error)
    return forbiddenResponse(auth.error)
  }

  try {
    const body = await request.json()
    if (body.trialDays !== undefined) {
      const n = Number(body.trialDays)
      if (!Number.isFinite(n) || n < 0 || n > 365) {
        return badRequestResponse("trialDays must be a number between 0 and 365")
      }
      await setTrialDays(n)
    }

    const trialDays = await getTrialDays()
    return NextResponse.json({ settings: { trialDays }, message: "Settings updated" })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update settings" }, { status: 500 })
  }
}
