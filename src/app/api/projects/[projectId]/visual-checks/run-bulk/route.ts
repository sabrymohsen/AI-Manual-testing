import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectOwner, unauthorizedResponse, badRequestResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"
import { addVisualCheckJob } from "@/lib/queue"

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const auth = await requireProjectOwner(params.projectId)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const runBulkSchema = z.object({
      mappingIds: z.array(z.string()).optional(),
    })
    const parsed = runBulkSchema.safeParse(body)
    if (!parsed.success) {
      return badRequestResponse(parsed.error.errors.map(e => e.message).join(", "))
    }
    const { mappingIds } = parsed.data

    // Fetch mappings to run
    const mappings = await prisma.visualCheckMapping.findMany({
      where: {
        projectId: params.projectId,
        isActive: true,
        ...(mappingIds && Array.isArray(mappingIds) ? { id: { in: mappingIds } } : {})
      },
      include: {
        figmaFrame: true
      }
    })

    if (mappings.length === 0) {
      return NextResponse.json({ error: "No active visual mappings found to run" }, { status: 400 })
    }

    const runs = []
    for (const mapping of mappings) {
      const run = await prisma.visualCheckRun.create({
        data: {
          mappingId: mapping.id,
          projectId: params.projectId,
          status: "NeedsReview",
          figmaImagePath: mapping.figmaFrame.referenceImagePath || "",
          actualImagePath: "",
          mismatchPercent: 0,
          browserType: mapping.browserType,
          viewportName: mapping.viewportName,
          viewportWidth: mapping.viewportWidth,
          viewportHeight: mapping.viewportHeight
        }
      })

      // Queue worker job
      await addVisualCheckJob(run.id)
      runs.push(run)
    }

    return NextResponse.json({ success: true, count: runs.length, runs })
  } catch (err: any) {
    console.error("Bulk trigger visual checks error:", err)
    return NextResponse.json({ error: err.message || "Failed to trigger bulk visual checks" }, { status: 500 })
  }
}
