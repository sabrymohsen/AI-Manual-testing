import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, requireProjectMember } from "@/lib/api-guards"
import { cleanFolder, hubNameError, projectScriptsWhere } from "@/lib/hub-scripts"

export const dynamic = "force-dynamic"

// POST /api/hub/recorder/save — save a reviewed recording as a hub test.
// { name, code, projectId?, folder?, tags? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const projectId: string | null = body.projectId || null
  const auth = projectId ? await requireProjectMember(projectId) : await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: (auth as any).status || 401 })

  try {
    const name = String(body.name || "").trim()
    const { code, tags } = body
    const nameError = hubNameError(name)
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 })
    if (!code) return NextResponse.json({ error: "Nothing recorded to save" }, { status: 400 })

    const duplicate = await prisma.testScript.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, ...(projectId ? projectScriptsWhere(projectId) : {}) },
    })
    if (duplicate) {
      return NextResponse.json({ error: `A test named "${name}" already exists` }, { status: 409 })
    }

    const script = await prisma.testScript.create({
      data: {
        name,
        type: "Web",
        code,
        projectId,
        folder: cleanFolder(body.folder ?? "Recorded"),
        tags: Array.isArray(tags) && tags.length > 0 ? tags : ["recorded"],
      },
    })
    return NextResponse.json({ script }, { status: 201 })
  } catch (err: any) {
    console.error("POST recorder save error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
