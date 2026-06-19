import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { explainFailure } from "@/lib/ai/explain-failure"
import { z } from "zod"

const bodySchema = z.object({
  errorMessage: z.string().min(1, "errorMessage is required"),
  stepDescription: z.string().min(1, "stepDescription is required"),
  logs: z.array(z.string()).optional(),
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
    const { errorMessage, logs, stepDescription } = rawBody

    if (!errorMessage || !stepDescription) {
      return NextResponse.json(
        { error: "errorMessage and stepDescription are required" },
        { status: 400 }
      )
    }

    const explanation = await explainFailure(errorMessage, logs || [], stepDescription)
    return NextResponse.json({ explanation })
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI explanation failed"
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
