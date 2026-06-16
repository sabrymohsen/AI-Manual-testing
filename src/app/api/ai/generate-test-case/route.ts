import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { generateTestCaseFromPrompt } from "@/lib/ai/generate-test-case"

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const { prompt, projectId } = await request.json()

    if (!prompt || !projectId) {
      return NextResponse.json(
        { error: "Prompt and projectId are required" },
        { status: 400 }
      )
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id },
    })

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const generated = await generateTestCaseFromPrompt(prompt, {
      name: project.name,
      webAppUrl: project.webAppUrl,
      description: project.description,
    })

    return NextResponse.json({ generated })
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI generation failed"
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
