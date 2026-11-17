import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse, canUseProject } from "@/lib/api-guards"
import { addVisualCheckJob } from "@/lib/queue"

export async function POST(
  request: Request,
  { params }: { params: { mappingId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const mapping = await prisma.visualCheckMapping.findUnique({
      where: { id: params.mappingId },
      include: {
        project: { select: { userId: true } },
        figmaFrame: true
      }
    })

    if (!mapping) {
      return notFoundResponse("Visual mapping not found")
    }

    if (!(await canUseProject(mapping.projectId, auth.session!.user.id, "write"))) {
      return unauthorizedResponse("Access denied")
    }

    // Create a new VisualCheckRun
    const run = await prisma.visualCheckRun.create({
      data: {
        mappingId: mapping.id,
        projectId: mapping.projectId,
        status: "NeedsReview",
        figmaImagePath: mapping.figmaFrame.referenceImagePath || "",
        actualImagePath: "", // will be filled by runner
        mismatchPercent: 0,
        browserType: mapping.browserType,
        viewportName: mapping.viewportName,
        viewportWidth: mapping.viewportWidth,
        viewportHeight: mapping.viewportHeight
      }
    })

    // Queue worker job
    await addVisualCheckJob(run.id)

    return NextResponse.json({ success: true, runId: run.id })
  } catch (err: any) {
    console.error("Trigger visual check error:", err)
    return NextResponse.json({ error: err.message || "Failed to trigger visual check" }, { status: 500 })
  }
}
