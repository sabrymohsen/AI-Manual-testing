import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireProjectMember } from "@/lib/api-guards"

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  query: z.string().max(2000),
  shared: z.boolean().optional(),
})

/** Board query without the bits that aren't filters (an open task). */
function cleanQuery(q: string): string {
  const p = new URLSearchParams(q.replace(/^\?/, ""))
  p.delete("task")
  return p.toString()
}

// GET — my views plus views shared with the project.
export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const views = await prisma.scrumSavedView.findMany({
    where: { projectId: params.projectId, OR: [{ userId: auth.session!.user.id }, { shared: true }] },
    orderBy: [{ shared: "asc" }, { name: "asc" }],
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  return NextResponse.json({
    views: views.map((v) => ({ id: v.id, name: v.name, query: v.query, shared: v.shared, mine: v.userId === auth.session!.user.id, owner: v.user.name || v.user.email })),
  })
}

// POST — save the current filters as a view.
export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const auth = await requireProjectMember(params.projectId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Give the view a name" }, { status: 400 })
  const view = await prisma.scrumSavedView.create({
    data: {
      projectId: params.projectId,
      userId: auth.session!.user.id,
      name: parsed.data.name,
      query: cleanQuery(parsed.data.query),
      shared: parsed.data.shared ?? false,
    },
  })
  return NextResponse.json({ view: { id: view.id, name: view.name, query: view.query, shared: view.shared, mine: true } }, { status: 201 })
}
