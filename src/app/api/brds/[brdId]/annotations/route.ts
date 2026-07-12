import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import { requireBrdAccess, brdAudit } from "@/lib/brd/server"
import { notify } from "@/lib/notifications"
import { extractMentionedUserIds } from "@/lib/mentions"

// GET /api/brds/:brdId/annotations -> all annotations for the BRD (visible to
// any project member). Comments are returned flat; the client threads them.
export async function GET(_req: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const annotations = await prisma.brdAnnotation.findMany({
    where: { brdId: params.brdId },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json({ annotations })
}

const schema = z.object({
  type: z.enum(["highlight", "comment", "rect", "sticky", "note"]),
  page: z.number().int().min(1).optional().nullable(),
  x: z.number().optional().nullable(),
  y: z.number().optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  text: z.string().max(5000).optional().nullable(),
  quote: z.string().max(2000).optional().nullable(),
  parentId: z.string().optional().nullable(),
})

// POST /api/brds/:brdId/annotations -> add a comment / annotation. Any project
// member may comment. @mentions in the text are resolved against the project
// roster and notified.
export async function POST(request: Request, { params }: { params: { brdId: string } }) {
  const access = await requireBrdAccess(params.brdId)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const user = access.session!.user
  const brd = access.brd!

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 })
  const d = parsed.data

  // Resolve @mentions in the comment body against the project roster.
  const project = await prisma.project.findUnique({
    where: { id: brd.projectId },
    select: {
      name: true,
      user: { select: { id: true, name: true, email: true } },
      projectMembers: { select: { user: { select: { id: true, name: true, email: true } } } },
    },
  })
  const roster = [project?.user, ...(project?.projectMembers.map((m) => m.user) || [])]
    .filter((u): u is { id: string; name: string | null; email: string } => !!u)
    .filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i)
  const mentionIds = d.text ? extractMentionedUserIds(d.text, roster).filter((id) => id !== user.id) : []

  const annotation = await prisma.brdAnnotation.create({
    data: {
      brdId: params.brdId,
      type: d.type,
      page: d.page ?? null,
      x: d.x ?? null,
      y: d.y ?? null,
      color: d.color ?? null,
      text: d.text ?? null,
      quote: d.quote ?? null,
      parentId: d.parentId ?? null,
      mentionIds,
      authorId: user.id,
      authorName: user.name || user.email,
    },
  })

  await brdAudit(
    params.brdId,
    d.parentId ? "comment_replied" : "annotation_added",
    d.text?.slice(0, 100) || d.type,
    user
  )

  // Notify @mentioned members, plus the parent comment's author on a reply.
  const recipients = new Set(mentionIds)
  if (d.parentId) {
    const parent = await prisma.brdAnnotation.findUnique({
      where: { id: d.parentId },
      select: { authorId: true },
    })
    if (parent?.authorId && parent.authorId !== user.id) recipients.add(parent.authorId)
  }
  if (recipients.size > 0) {
    const who = user.name || user.email
    notify(
      [...recipients].map((userId) => ({
        userId,
        type: "COMMENT" as const,
        title: mentionIds.includes(userId) ? `${who} mentioned you` : `${who} replied`,
        body: `On BRD "${brd.name}": ${(d.text || "").slice(0, 140)}`,
        projectId: brd.projectId,
        actionUrl: `/projects/${brd.projectId}/brds/${brd.id}`,
      }))
    ).catch(() => {})
  }

  return NextResponse.json({ annotation }, { status: 201 })
}
