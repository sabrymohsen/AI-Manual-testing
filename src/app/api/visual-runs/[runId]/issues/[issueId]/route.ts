import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, unauthorizedResponse, notFoundResponse } from "@/lib/api-guards"
import { z } from "zod"

const bodySchema = z.object({
  category: z.string().optional(),
  severity: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
})

export async function PUT(
  request: Request,
  { params }: { params: { runId: string, issueId: string } }
) {
  const auth = await requireAuth()
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const issue = await prisma.visualDifferenceIssue.findUnique({
      where: { id: params.issueId },
      include: {
        run: {
          include: {
            project: { select: { userId: true } }
          }
        }
      }
    })

    if (!issue || issue.runId !== params.runId) {
      return notFoundResponse("Difference issue not found")
    }

    if (issue.run.project.userId !== auth.session!.user.id) {
      return unauthorizedResponse("Access denied")
    }

    const rawBody = await request.json()
    const parseResult = bodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.errors.map(e => e.message).join(", ") }, { status: 400 })
    }
    const body = rawBody
    const { category, severity, status, notes } = body

    // Save previous status
    const previousStatus = issue.status

    const updated = await prisma.visualDifferenceIssue.update({
      where: { id: params.issueId },
      data: {
        category: category !== undefined ? category : undefined,
        severity: severity !== undefined ? severity : undefined,
        status: status !== undefined ? status : undefined,
        notes: notes !== undefined ? notes : undefined
      }
    })

    // If status is updated to Accepted, automatically add this region to visual ignored regions
    if (status === "Accepted" && previousStatus !== "Accepted") {
      await prisma.visualIgnoredRegion.create({
        data: {
          mappingId: issue.run.mappingId,
          x: issue.x,
          y: issue.y,
          width: issue.width,
          height: issue.height,
          reason: `Auto-accepted: ${notes || category || "Accepted visual mismatch"}`
        }
      })
    }

    return NextResponse.json({ success: true, issue: updated })
  } catch (err: any) {
    console.error("Update difference issue error:", err)
    return NextResponse.json({ error: err.message || "Failed to update difference issue" }, { status: 500 })
  }
}
