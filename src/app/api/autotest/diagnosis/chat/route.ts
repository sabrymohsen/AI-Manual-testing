/**
 * POST /api/autotest/diagnosis/chat
 *
 * The "Ask the Doctor" chat in the Automation Hub's AI Diagnosis tab.
 *
 * The tab has always rendered this chat, but the route did not exist — every
 * question 404'd. The client checks `res.ok` and silently drops the reply,
 * which is why asking produced neither an answer nor an error.
 *
 * Answers are GROUNDED in the stored Diagnosis rows for the test being looked
 * at rather than free-associating: the failure's real error message, cause,
 * findings and remediation steps are handed to the model as context. A
 * confident-sounding invented root cause is worse than no answer when someone
 * is deciding whether a test is flaky or the product is broken.
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { chatWithConfiguredProvider, resolveProvider } from "@/lib/ai/provider-chat"
import { z } from "zod"

const bodySchema = z.object({
  prompt: z.string().min(1, "prompt is required").max(4000),
  /** Which test the tab is focused on; empty means "any". */
  testName: z.string().optional(),
})

const SYSTEM = `You are the Test Doctor, a test-automation failure analyst.
Answer the engineer's question about the failing test using ONLY the diagnosis
context provided. Be concrete and short — a few sentences, or a short numbered
list when giving steps. Prefer the locator, wait or data fix that the context
supports. If the context does not contain the answer, say so plainly and name
what evidence would be needed; never invent a stack trace, a locator or a root
cause.`

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return badRequestResponse(parsed.error.errors.map((e) => e.message).join(", "))
  }
  const { prompt, testName } = parsed.data

  try {
    // The focused test first; a couple of recent others so "has this happened
    // elsewhere?" can be answered without a second round-trip.
    const focused = testName
      ? await prisma.diagnosis.findMany({
          where: { testName: { contains: testName, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          take: 3,
        })
      : []
    const recent =
      focused.length > 0
        ? []
        : await prisma.diagnosis.findMany({ orderBy: { createdAt: "desc" }, take: 3 })

    const context = [...focused, ...recent]
      .map((d) =>
        [
          `Test: ${d.testName}`,
          `Error: ${d.errorMessage}`,
          `Primary cause: ${d.primaryCause}`,
          `Confidence: ${Math.round((d.confidence ?? 0) * 100)}%`,
          `Similar failures seen: ${d.similarFailuresCount}`,
          `Findings: ${JSON.stringify(d.findings ?? {})}`,
          `Suggested remediation: ${d.remediationSteps}`,
        ].join("\n")
      )
      .join("\n\n---\n\n")

    // Without a provider the honest answer is the stored diagnosis itself, not
    // an apology: the remediation steps are already the Doctor's conclusion.
    if (!(await resolveProvider())) {
      const first = focused[0] ?? recent[0]
      return NextResponse.json({
        response: first
          ? `No AI provider is configured, so here is the stored diagnosis for ${first.testName}:\n\n` +
            `Primary cause: ${first.primaryCause}\n\nSuggested remediation:\n${first.remediationSteps}`
          : "No AI provider is configured and there is no stored diagnosis for this test yet.",
        grounded: !!first,
        aiUsed: false,
      })
    }

    const response = await chatWithConfiguredProvider({
      system: SYSTEM,
      prompt: context
        ? `Diagnosis context:\n\n${context}\n\nEngineer's question: ${prompt}`
        : `There is no stored diagnosis for this test. Engineer's question: ${prompt}`,
      temperature: 0.2,
      maxTokens: 800,
      command: "diagnosis-chat",
    })

    return NextResponse.json({
      response: response || "No answer was returned.",
      grounded: context.length > 0,
      aiUsed: true,
    })
  } catch (err: any) {
    console.error("[diagnosis/chat]", err)
    return NextResponse.json(
      { error: err?.message || "The Doctor could not answer that" },
      { status: 502 }
    )
  }
}
