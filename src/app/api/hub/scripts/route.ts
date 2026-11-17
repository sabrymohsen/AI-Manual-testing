import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, requireProjectMember } from "@/lib/api-guards"
import { cleanFolder, convertLegacyScripts, hubNameError, projectScriptsWhere, seedProjectIfEmpty } from "@/lib/hub-scripts"

export const dynamic = "force-dynamic"

const latestRun = {
  executions: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { id: true, status: true, duration: true, createdAt: true, results: true },
  },
}

// GET /api/hub/scripts?projectId= — a project's tests (plus shared examples)
// with their latest run. Without projectId: every test (AI agent, old callers).
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")
  const auth = projectId ? await requireProjectMember(projectId) : await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: (auth as any).status || 401 })

  try {
    const where = projectId ? projectScriptsWhere(projectId) : {}
    if (projectId) await seedProjectIfEmpty(projectId)

    let scripts = await prisma.testScript.findMany({ where, orderBy: [{ folder: "asc" }, { name: "asc" }], include: latestRun })
    if (await convertLegacyScripts(scripts)) {
      scripts = await prisma.testScript.findMany({ where, orderBy: [{ folder: "asc" }, { name: "asc" }], include: latestRun })
    }

    return NextResponse.json({
      scripts: scripts.map(({ executions, ...s }) => {
        const last = executions[0]
        const results = Array.isArray(last?.results) ? (last!.results as any[]) : []
        return {
          ...s,
          shared: s.projectId === null,
          lastExecution: last
            ? {
                id: last.id,
                status: last.status,
                duration: last.duration,
                createdAt: last.createdAt,
                passed: results.filter((r) => r.status === "passed").length,
                failed: results.filter((r) => ["failed", "timedOut", "interrupted"].includes(r.status)).length,
                total: results.length,
              }
            : null,
        }
      }),
    })
  } catch (err: any) {
    console.error("GET hub scripts error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/hub/scripts — create a test { projectId, name, type, code, folder?, tags? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const projectId: string | null = body.projectId || null
  const auth = projectId ? await requireProjectMember(projectId) : await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: (auth as any).status || 401 })

  try {
    const name = String(body.name || "").trim()
    const { type, code, tags } = body
    const nameError = hubNameError(name)
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 })
    if (!type || !code) {
      return NextResponse.json({ error: "Missing required fields: type, code" }, { status: 400 })
    }

    const duplicate = await prisma.testScript.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, ...(projectId ? projectScriptsWhere(projectId) : {}) },
    })
    if (duplicate) {
      return NextResponse.json({ error: `A test named "${name}" already exists` }, { status: 409 })
    }

    const script = await prisma.testScript.create({
      data: { name, type, code, tags: Array.isArray(tags) ? tags : [], folder: cleanFolder(body.folder), projectId },
    })
    return NextResponse.json({ script }, { status: 201 })
  } catch (err: any) {
    console.error("POST hub script error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

