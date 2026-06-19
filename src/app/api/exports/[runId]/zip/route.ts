import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { generateZipArtifacts } from "@/lib/reports/zip-generator"
import fs from "node:fs"

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
