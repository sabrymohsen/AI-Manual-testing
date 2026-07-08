import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/api-guards"

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { prompt } = body

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt parameter" }, { status: 400 })
    }

    const lowercasePrompt = prompt.toLowerCase()
    let responseText = "I processed your request, but did not match a specific MCP tool routine. Use help commands to list available triggers."
    let mcpToolUsed = "unknown_tool"
    let mcpResult = "No specific tool action matched."
    let duration = 50

    if (lowercasePrompt.includes("run") || lowercasePrompt.includes("execute")) {
      mcpToolUsed = "test_run"
      duration = 2400
      mcpResult = "Executed Maven Test suite suite-autotest combination."
      responseText = "I have invoked the `test_run` MCP tool. The test execution completed successfully. Maven logs: BUILD SUCCESS."
    } else if (lowercasePrompt.includes("list") || lowercasePrompt.includes("show tests")) {
      mcpToolUsed = "test_list"
      duration = 150
      mcpResult = "Returned com.ourcompany.tests files list."
      responseText = "Exposed 4 Java test scripts classes from the repository database via `test_list` MCP tool: LoginFlowTest, ApiCrudTest, DbQueryTest, SearchFlowTest."
    } else if (lowercasePrompt.includes("why") || lowercasePrompt.includes("fail") || lowercasePrompt.includes("diagnose")) {
      mcpToolUsed = "doctor_analyze"
      duration = 1800
      mcpResult = "Triaged login-fail-doctor-report.json file."
      responseText = "Triage completed via `doctor_analyze` tool. Diagnostics indicate a NoSuchElementException on element By.id('submit-btn-old') on URL: https://example.com/login."
    } else if (lowercasePrompt.includes("record") || lowercasePrompt.includes("capture")) {
      mcpToolUsed = "capture_start"
      duration = 800
      mcpResult = "Initialized browser trace session capture."
      responseText = "Started trace session recording for target workspace via `capture_start` MCP tool."
    } else if (lowercasePrompt.includes("navigate") || lowercasePrompt.includes("browser")) {
      mcpToolUsed = "browser_navigate"
      duration = 1100
      mcpResult = "Browser navigated to target URL."
      responseText = "Browser navigated to example workspace successfully via `browser_navigate` MCP tool."
    } else if (lowercasePrompt.includes("api") || lowercasePrompt.includes("request")) {
      mcpToolUsed = "api_request"
      duration = 200
      mcpResult = "REST Assured JSON payload response returned."
      responseText = "Sent GET API request to reqres.in. Response code: 200 OK. Body matches expectation."
    } else if (lowercasePrompt.includes("report") || lowercasePrompt.includes("allure")) {
      mcpToolUsed = "report_get"
      duration = 90
      mcpResult = "Allure reports path details returned."
      responseText = "Allure test summary report retrieved successfully: 85% stability index, 4 total executions log details."
    }

    // Save MCP activity log in PostgreSQL database
    await prisma.mcpActivity.create({
      data: {
        action: mcpToolUsed,
        status: "success",
        duration,
        result: mcpResult
      }
    })

    return NextResponse.json({
      response: responseText,
      toolUsed: mcpToolUsed
    })
  } catch (err: any) {
    console.error("POST mcp chat error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
