import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { z } from "zod"
import { chatWithConfiguredProvider } from "@/lib/ai/provider-chat"

const bodySchema = z.object({
  actionDescription: z.string().min(1, "actionDescription is required"),
  testCaseTitle: z.string().optional(),
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
    const { actionDescription, testCaseTitle, projectId } = rawBody

    if (!actionDescription) {
      return NextResponse.json({ error: "actionDescription is required" }, { status: 400 })
    }

    const systemPrompt = `You are a professional QA test assistant.
Suggest a clear, concise, and standard QA expected result for a given manual test step action description.
Return ONLY a plain text containing the suggested expected result (max 2 sentences).`

    const userMessage = `Action Description: ${actionDescription}
Test Case Title context: ${testCaseTitle || "General"}`

    const suggestion =
      (
        await chatWithConfiguredProvider({
          projectId,
          system: systemPrompt,
          prompt: userMessage,
          temperature: 0.3,
          command: "suggest-expected-result",
        })
      ).trim() || "Observed output meets specifications."

    return NextResponse.json({ suggestion })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to suggest expected result" }, { status: 500 })
  }
}
