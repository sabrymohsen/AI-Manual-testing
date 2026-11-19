import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { notFoundResponse, unauthorizedResponse, requireProjectMember } from "@/lib/api-guards"

export async function POST(
  request: Request,
  { params }: { params: { bugId: string } }
) {
  const bug = await prisma.bugReport.findUnique({
    where: { id: params.bugId },
    select: { projectId: true }
  })

  if (!bug) {
    return notFoundResponse("Bug report not found")
  }

  const auth = await requireProjectMember(bug.projectId!)
  if (auth.error) return unauthorizedResponse(auth.error)

  try {
    const body = await request.json()
    const { comment } = body

    if (!comment || !comment.trim()) {
      return NextResponse.json({ error: "Comment text is required" }, { status: 400 })
    }

    const newComment = await prisma.$transaction(async (tx) => {
      const c = await tx.bugComment.create({
        data: {
          bugId: params.bugId,
          comment,
          authorId: auth.session!.user.id
        }
      })

      await tx.bugActivity.create({
        data: {
          bugId: params.bugId,
          action: "Comment Added",
          details: `User added comment: "${comment.substring(0, 60)}${comment.length > 60 ? "..." : ""}"`
        }
      })

      return c
    })

    return NextResponse.json({ comment: newComment }, { status: 201 })
  } catch (error: any) {
    console.error("POST /api/bug-reports/[bugId]/comments error:", error)
    return NextResponse.json({ error: error.message || "Failed to add comment" }, { status: 500 })
  }
}
