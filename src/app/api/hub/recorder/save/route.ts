import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireHubAdmin, requireHubProject } from "@/lib/hub-access"
import { cleanFolder, hubNameError, projectScriptsWhere } from "@/lib/hub-scripts"

export const dynamic = "force-dynamic"

// POST /api/hub/recorder/save — save a reviewed recording as a hub test.
// { name, code, projectId?, folder?, tags? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const projectId: string | null = body.projectId || null
  // Same rule as creating a test: project writers, or an admin for a shared example.
  const auth = projectId ? await requireHubProject(projectId, "write") : await requireHubAdmin()
  if (!auth.ok) return auth.response

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
