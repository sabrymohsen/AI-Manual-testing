import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { notFoundResponse, unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"
import { notifyBugStatus, notifyBugsBulk } from "@/lib/work-notifications"

export async function POST(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const bug = await prisma.bugReport.findUnique({
    where: { id: params.bugId },
    select: { projectId: true, status: true }
  })

  if (!bug) {
    return notFoundResponse("Bug report not found")
  }

  const auth = await requireProjectMember(bug.projectId!)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { status } = body

    if (!status) {
      return NextResponse.json({ error: "Status value is required" }, { status: 400 })
    }

    const updatedBug = await prisma.$transaction(async (tx) => {
      const updated = await tx.bugReport.update({
        where: { id: params.bugId },
        data: {
          status: status as any
        }
      })

      await tx.bugActivity.create({
        data: {
          bugId: params.bugId,
          action: "Status Changed",
          details: `Status transitioned from ${bug.status} to ${status}.`
        }
      })

      return updated
    })

    if (status !== bug.status) {
      const me = auth.session!.user
      notifyBugStatus({
        projectId: bug.projectId!,
        bug: { id: updatedBug.id, title: updatedBug.title, key: updatedBug.bugKey, reporterId: updatedBug.reporterId, assignedTo: updatedBug.assignedTo },
        to: status,
        actorId: me.id,
        actorName: me.name || me.email,
      }).catch(() => {})
    }

    return NextResponse.json({ bug: updatedBug })
  } catch (error: any) {
    console.error("POST /api/bug-reports/[bugId]/status error:", error)
    return NextResponse.json({ error: error.message || "Failed to update status" }, { status: 500 })
  }
}
