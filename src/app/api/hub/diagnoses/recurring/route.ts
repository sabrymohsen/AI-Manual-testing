import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"
import { visibleExecutionIds } from "@/lib/hub-access"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)
  // Only diagnoses of runs in the caller's projects.
  const visible = await visibleExecutionIds(auth.session!.user.id)
  const visibleWhere = visible === "all" ? {} : { testExecutionId: { in: visible } }

  try {
    const items = await prisma.diagnosis.findMany({ where: visibleWhere })

    // Group items by errorMessage/signature
    const groups: Record<string, { signature: string; count: number; firstSeen: Date; lastSeen: Date; tests: string[] }> = {}

    items.forEach(item => {
      const signature = item.errorMessage.split("\n")[0] // Use first line as key
      if (!groups[signature]) {
        groups[signature] = {
          signature,
          count: 0,
          firstSeen: item.createdAt,
          lastSeen: item.createdAt,
          tests: []
        }
      }

      groups[signature].count += 1 + item.similarFailuresCount
      if (item.createdAt < groups[signature].firstSeen) {
        groups[signature].firstSeen = item.createdAt
      }
      if (item.createdAt > groups[signature].lastSeen) {
        groups[signature].lastSeen = item.createdAt
      }
      if (!groups[signature].tests.includes(item.testName)) {
        groups[signature].tests.push(item.testName)
      }
    })

    return NextResponse.json({ recurring: Object.values(groups) })
  } catch (err: any) {
    console.error("GET recurring failures error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
