import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { cleanFolder, hubNameError } from "@/lib/hub-scripts"
import { requireHubScript } from "@/lib/hub-access"
import { recalcMany } from "@/lib/test-cases/rollup"

// GET /api/hub/scripts/{id}?projectId= — script code + recent executions.
// For a shared example, only runs made in `projectId` are returned.
export async function GET(request: NextRequest, { params }: { params: { scriptId: string } }) {
  const projectId = request.nextUrl.searchParams.get("projectId")
  const auth = await requireHubScript(params.scriptId, "read", projectId)
  if (!auth.ok) return auth.response

  try {
    const scope = auth.script.projectId ?? projectId
    const executions = scope
      ? await prisma.testExecution.findMany({
          where: { scriptId: auth.script.id, OR: [{ projectId: scope }, { projectId: null, script: { projectId: scope } }] },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, status: true, duration: true, createdAt: true, browser: true, batchId: true, results: true },
        })
      : []
    const links = await prisma.hubScriptTestCase.findMany({
      where: { scriptId: auth.script.id },
      select: { testCase: { select: { id: true, title: true, lastStatus: true } } },
    })
    return NextResponse.json({ script: { ...auth.script, executions, linkedTestCases: links.map((l) => l.testCase) } })
  } catch (err: any) {
    console.error("GET hub script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/hub/scripts/{id} — update a script; `testCaseIds` replaces the
// manual test cases it verifies (project scripts only).
export async function PUT(request: NextRequest, { params }: { params: { scriptId: string } }) {
  const auth = await requireHubScript(params.scriptId, "write")
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { type, code, tags, accessibilityEnabled } = body
    const name = typeof body.name === "string" ? body.name.trim() : undefined

    if (name !== undefined) {
      const nameError = hubNameError(name)
      if (nameError) return NextResponse.json({ error: nameError }, { status: 400 })
      const clash = await prisma.testScript.findFirst({
        where: {
          id: { not: params.scriptId },
          name: { equals: name, mode: "insensitive" },
          ...(auth.script.projectId ? { OR: [{ projectId: auth.script.projectId }, { projectId: null }] } : {}),
        },
      })
      if (clash) return NextResponse.json({ error: `A test named "${name}" already exists` }, { status: 409 })
    }

    if (tags !== undefined && (!Array.isArray(tags) || tags.some((t: unknown) => typeof t !== "string" || t.length > 40))) {
      return NextResponse.json({ error: "Tags must be short text" }, { status: 400 })
    }

    const script = await prisma.testScript.update({
      where: { id: params.scriptId },
      data: {
        ...(name !== undefined && { name }),
        ...(body.folder !== undefined && { folder: cleanFolder(body.folder) }),
        ...(type !== undefined && { type }),
        ...(code !== undefined && { code }),
        ...(tags !== undefined && { tags: Array.from(new Set((tags as string[]).map((t) => t.trim()).filter(Boolean))).slice(0, 20) }),
        ...(accessibilityEnabled !== undefined && { accessibilityEnabled: Boolean(accessibilityEnabled) }),
      },
    })

    if (Array.isArray(body.testCaseIds)) {
      if (!auth.script.projectId) {
        return NextResponse.json({ error: "Shared examples can't be linked to test cases — copy it into the project first" }, { status: 400 })
      }
      const owned = await prisma.testCase.findMany({
        where: { id: { in: body.testCaseIds.map(String) }, projectId: auth.script.projectId },
        select: { id: true },
      })
      const before = await prisma.hubScriptTestCase.findMany({ where: { scriptId: script.id }, select: { testCaseId: true } })
      await prisma.$transaction([
        prisma.hubScriptTestCase.deleteMany({ where: { scriptId: script.id } }),
        prisma.hubScriptTestCase.createMany({ data: owned.map((o) => ({ scriptId: script.id, testCaseId: o.id })) }),
      ])
      // Newly linked cases pick up this script's last result; unlinked ones drop it.
      await recalcMany([...before.map((b) => b.testCaseId), ...owned.map((o) => o.id)])
    }

    return NextResponse.json({ script })
  } catch (err: any) {
    console.error("PUT hub script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/hub/scripts/{id}
export async function DELETE(_request: NextRequest, { params }: { params: { scriptId: string } }) {
  const auth = await requireHubScript(params.scriptId, "write")
  if (!auth.ok) return auth.response
  try {
    const links = await prisma.hubScriptTestCase.findMany({ where: { scriptId: params.scriptId }, select: { testCaseId: true } })
    await prisma.testScript.delete({ where: { id: params.scriptId } })
    // Linked cases may have been taking their status from this script.
    if (links.length) await recalcMany(links.map((l) => l.testCaseId))
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("DELETE hub script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
