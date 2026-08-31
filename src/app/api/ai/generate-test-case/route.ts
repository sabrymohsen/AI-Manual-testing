import { NextResponse } from "next/server"
import { requireAuth, unauthorizedResponse, badRequestResponse } from "@/lib/api-guards"
import { prisma } from "@/lib/db"
import { generateTestCaseFromPrompt } from "@/lib/ai/generate-test-case"
import { aiGenerateSchema } from "@/schemas"
import { requireProjectOwner } from "@/lib/api-guards"
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    // Rate limit: 10 AI requests per user per minute
    const rateLimit = await checkRateLimit(`ai:${auth.session!.user.id}`, {
      windowMs: 60 * 1000,
      maxRequests: 10,
      keyPrefix: "ratelimit",
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many AI generation requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)) } }
      )
    }

    const body = await request.json()
    const parsed = aiGenerateSchema.safeParse(body)

    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }

    const { prompt, projectId } = parsed.data

    const projectAuth = await requireProjectOwner(projectId)
    if (projectAuth.error) return unauthorizedResponse(projectAuth.error)

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: auth.session!.user.id },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const generated = await generateTestCaseFromPrompt(prompt, {
      name: project.name,
      webAppUrl: project.webAppUrl,
      description: project.description,
      projectId,
    })

    return NextResponse.json({ generated })
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI generation failed"
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
