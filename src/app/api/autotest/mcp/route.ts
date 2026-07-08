import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

// Seed default mcp details if empty
const SEED_MCP_ACTIVITIES = [
  { action: "test_list", status: "success", duration: 80, result: "Exposed 4 test classes from com.ourcompany.tests." },
  { action: "test_run", status: "success", duration: 4200, result: "Ran LoginFlowTest on browser Chrome. Build outcome: BUILD SUCCESS." },
  { action: "doctor_analyze", status: "success", duration: 1800, result: "Analyzed login failure report. Triage: NoSuchElementException detected." },
  { action: "browser_navigate", status: "success", duration: 1200, result: "Opened Chrome browser session and loaded target URL." },
  { action: "report_get", status: "success", duration: 90, result: "Allure diagnostic metrics retrieved successfully." }
]

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    let config = await prisma.mcpConfig.findFirst()
    if (!config) {
      config = await prisma.mcpConfig.create({
        data: {
          serverUrl: "http://localhost:4000",
          provider: "Gemini",
          apiKey: "••••••••••••••••••••",
          permissionLevel: "Can Execute Tests"
        }
      })
    }

    let activities = await prisma.mcpActivity.findMany({
      orderBy: { createdAt: "desc" }
    })

    if (activities.length === 0) {
      await Promise.all(
        SEED_MCP_ACTIVITIES.map(a =>
          prisma.mcpActivity.create({ data: a })
        )
      )
      activities = await prisma.mcpActivity.findMany({
        orderBy: { createdAt: "desc" }
      })
    }

    return NextResponse.json({
      config,
      activities
    })
  } catch (err: any) {
    console.error("GET mcp config and logs error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
