import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { generateZipArtifacts } from "@/lib/reports/zip-generator"
import fs from "node:fs"

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const zipPath = await generateZipArtifacts(params.runId)
    const buffer = fs.readFileSync(zipPath)

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="test-run-${params.runId}.zip"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    )
  }
}
