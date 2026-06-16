import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { sanitizeLogMessage } from "@/lib/sanitize"
import { draftBugReport } from "@/lib/ai/draft-bug-report"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { actionDescription, expectedResult, actualResult, consoleLogs, networkErrors } = body

    if (!actionDescription || !expectedResult || !actualResult) {
      return NextResponse.json({ error: "Missing required step outcome data" }, { status: 400 })
    }

    // Sanitize parameters to avoid key leaks to AI
    const cleanAction = sanitizeLogMessage(actionDescription)
    const cleanExpected = sanitizeLogMessage(expectedResult)
    const cleanActual = sanitizeLogMessage(actualResult)
    const cleanLogs = sanitizeLogMessage(consoleLogs || "")
    const cleanErrors = sanitizeLogMessage(networkErrors || "")

    const logsArray = [cleanLogs, cleanErrors].filter(Boolean)

    const draft = await draftBugReport({
      title: "Failed step result",
      actionDescription: cleanAction,
      expectedResult: cleanExpected,
      actualResult: cleanActual,
      errorDetails: cleanErrors,
      logs: logsArray
    })

    return NextResponse.json({ draft })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to draft bug report" }, { status: 500 })
  }
}
