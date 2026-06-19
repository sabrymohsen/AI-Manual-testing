import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { generateMarkdownReport } from "@/lib/reports/markdown-generator"

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) {
    return unauthorizedResponse(auth.error)
  }

  const entity = await prisma.testRun.findFirst({
    where: { id: params.runId, project: { userId: auth.session!.user.id } },
    select: { projectId: true }
  })
  if (!entity) {
    return notFoundResponse("Not found")
  }

  try {
    const markdown = await generateMarkdownReport(params.runId)

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="test-run-${params.runId}.md"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    )
  }
}
