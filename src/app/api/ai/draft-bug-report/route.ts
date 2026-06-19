import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { draftBugReport } from "@/lib/ai/draft-bug-report"
import { z } from "zod"

const bodySchema = z.object({
  actionDescription: z.string().min(1, "actionDescription is required"),
  expectedResult: z.string().min(1, "expectedResult is required"),
  actualResult: z.string().min(1, "actualResult is required"),
  title: z.string().optional(),
  errorDetails: z.string().optional(),
  logs: z.any().optional(),
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
