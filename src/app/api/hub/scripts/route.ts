import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/api-guards"
import { requireHubAdmin, requireHubProject, readableProjectIds } from "@/lib/hub-access"
import { cleanFolder, convertLegacyScripts, hubNameError, projectScriptsWhere, seedProjectIfEmpty } from "@/lib/hub-scripts"

export const dynamic = "force-dynamic"

/** History used for the flaky flag: this many most recent finished runs. */
const HISTORY = 10

/**
 * A test is flaky when its recent runs flip between pass and fail, or when
 * Playwright had to retry a test before it passed.
 */
function flakiness(statuses: string[], retriedPass: boolean) {
  let flips = 0
  for (let i = 1; i < statuses.length; i++) if (statuses[i] !== statuses[i - 1]) flips++
  return { flips, flaky: retriedPass || (statuses.length >= 3 && flips >= 2) }
}

// GET /api/hub/scripts?projectId= — a project's tests (plus shared examples)
// with their latest run, recent history (flaky detection) and linked test
// cases. Without projectId: tests in every project the caller can read.
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")
  if (!projectId) {
    const auth = await requireAuth()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: 401 })
    const ids = await readableProjectIds(auth.session!.user.id)
    const scripts = await prisma.testScript.findMany({
      where: ids === "all" ? {} : { OR: [{ projectId: null }, { projectId: { in: ids } }] },
      orderBy: [{ folder: "asc" }, { name: "asc" }],
    })
    return NextResponse.json({ scripts })
  }

  const auth = await requireHubProject(projectId, "read")
  if (!auth.ok) return auth.response

  try {
    const where = projectScriptsWhere(projectId)
    await seedProjectIfEmpty(projectId)

    let scripts = await prisma.testScript.findMany({
      where,
      orderBy: [{ folder: "asc" }, { name: "asc" }],
      include: { testCaseLinks: { select: { testCase: { select: { id: true, title: true, lastStatus: true } } } } },
    })
    if (await convertLegacyScripts(scripts)) {
      scripts = await prisma.testScript.findMany({
        where,
        orderBy: [{ folder: "asc" }, { name: "asc" }],
        include: { testCaseLinks: { select: { testCase: { select: { id: true, title: true, lastStatus: true } } } } },
      })
    }

    // Runs in THIS project only — a shared example's runs elsewhere are not ours.
    const runs = await prisma.testExecution.findMany({
      where: {
        scriptId: { in: scripts.map((s) => s.id) },
        OR: [{ projectId }, { projectId: null, script: { projectId } }],
      },
      orderBy: { createdAt: "desc" },
      take: scripts.length * 25,
      select: { id: true, scriptId: true, status: true, duration: true, createdAt: true, results: true },
    })
    const byScript = new Map<string, typeof runs>()
    for (const r of runs) byScript.set(r.scriptId, [...(byScript.get(r.scriptId) ?? []), r])

    return NextResponse.json({
      scripts: scripts.map(({ testCaseLinks, ...s }) => {
        const mine = byScript.get(s.id) ?? []
        const last = mine[0]
        const results = Array.isArray(last?.results) ? (last!.results as any[]) : []
        const finished = mine.filter((r) => r.status === "Passed" || r.status === "Failed").slice(0, HISTORY)
        const statuses = finished.map((r) => r.status)
        const retriedPass = finished.some((r) => Array.isArray(r.results) && (r.results as any[]).some((x) => x.status === "flaky"))
        const { flips, flaky } = flakiness(statuses, retriedPass)
        return {
          ...s,
          shared: s.projectId === null,
          linkedTestCases: testCaseLinks.map((l) => l.testCase),
          history: statuses,
          passRate: statuses.length ? Math.round((statuses.filter((x) => x === "Passed").length / statuses.length) * 100) : null,
          flaky,
          flips,
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
  // Writing a test = running code on the server later: project writers only.
  // A test with no project is a shared example for everyone — admins only.
  const auth = projectId ? await requireHubProject(projectId, "write") : await requireHubAdmin()
  if (!auth.ok) return auth.response

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

