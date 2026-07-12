import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"
import { brdFileUrl } from "@/lib/brd/server"

// GET /api/scrum/tasks/:taskId/brds -> BRDs linked to this story, for the drawer
export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: { projectId: true },
  })
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 })

  const auth = await requireProjectMember(task.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const links = await prisma.brdLink.findMany({
    where: { taskId: params.taskId, brd: { isDeleted: false } },
    include: {
      brd: {
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    brds: links.map((l) => {
      const current = l.brd.versions.find((v) => v.id === l.brd.currentVersionId) ?? l.brd.versions[0]
      return {
        linkId: l.id,
        id: l.brd.id,
        name: l.brd.name,
        fileType: l.brd.fileType,
        status: l.brd.status,
        updatedAt: l.brd.updatedAt,
        fileUrl: current ? brdFileUrl(current.storagePath) : null,
      }
    }),
  })
}
