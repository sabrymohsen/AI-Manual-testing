import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { explainFailure } from "@/lib/ai/explain-failure"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const { errorMessage, logs, stepDescription } = await request.json()

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
