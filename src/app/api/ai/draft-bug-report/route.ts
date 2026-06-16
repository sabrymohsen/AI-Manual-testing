import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { draftBugReport } from "@/lib/ai/draft-bug-report"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()

    if (!body.actionDescription || !body.expectedResult || !body.actualResult) {
      return NextResponse.json(
        { error: "actionDescription, expectedResult, and actualResult are required" },
        { status: 400 }
      )
    }

    const draft = await draftBugReport({
      title: body.title || "Failed Test Step",
      actionDescription: body.actionDescription,
      expectedResult: body.expectedResult,
      actualResult: body.actualResult,
      errorDetails: body.errorDetails,
      logs: body.logs,
    })

    return NextResponse.json({ draft })
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI drafting failed"
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
