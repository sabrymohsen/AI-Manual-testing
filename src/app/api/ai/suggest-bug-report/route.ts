import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { sanitizeLogMessage } from "@/lib/sanitize"
import { draftBugReport } from "@/lib/ai/draft-bug-report"
import { z } from "zod"

const bodySchema = z.object({
  actionDescription: z.string().min(1, "actionDescription is required"),
  expectedResult: z.string().min(1, "expectedResult is required"),
  actualResult: z.string().min(1, "actualResult is required"),
  consoleLogs: z.string().optional(),
  networkErrors: z.string().optional(),
  // Optional so existing callers keep working; when present, the project's own
  // AI key is preferred over the workspace/env one.
  projectId: z.string().optional(),

})

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const rawBody = await request.json()
    const parseResult = bodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return badRequestResponse(parseResult.error.errors.map(e => e.message).join(", "))
    }
    const body = rawBody
    const { actionDescription, expectedResult, actualResult, consoleLogs, networkErrors, projectId } = body

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
      projectId,
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
