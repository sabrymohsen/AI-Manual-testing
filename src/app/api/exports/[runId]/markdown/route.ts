import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { generateMarkdownReport } from "@/lib/reports/markdown-generator"

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
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
